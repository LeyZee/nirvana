import { createHash } from 'node:crypto';

import type { FastifyRateLimitStore, FastifyRateLimitStoreCtor } from '@fastify/rate-limit';
import { sql, type Database } from '@nirvana/db';
import { z } from 'zod';

const CounterSchema = z.object({ hits: z.number().int(), ttl: z.number().int() });

/** What the plugin hands `child`: its merged options, plus `routeInfo` (the route, or `{}` for `createRateLimit`). */
const ChildOptionsSchema = z.object({
  routeInfo: z
    .object({ method: z.union([z.string(), z.array(z.string())]).optional(), url: z.string().optional() })
    .optional(),
  max: z.unknown(),
  timeWindow: z.unknown(),
});

/** How long a counter outlives its window before the purge drops it (the IPs and accounts it counts with it). */
const PURGE_AFTER = '1 hour';

/**
 * One counter per limiter and per client, so that a route's own limit never shares the API-wide one. A route
 * limiter is named after its route; a `createRateLimit` limiter has no route, so after its bounds.
 */
function namespaceOf(options: unknown): string {
  const parsed = ChildOptionsSchema.safeParse(options);
  if (!parsed.success) return 'limiter';
  const { routeInfo, max, timeWindow } = parsed.data;
  if (routeInfo?.url !== undefined) return `route ${String(routeInfo.method)} ${routeInfo.url}`;
  const bound = (value: unknown) => (typeof value === 'number' ? String(value) : 'custom');
  return `limiter ${bound(max)}/${bound(timeWindow)}`;
}

/** The client part is hashed: the table never holds an IP or an e-mail in clear, and the key stays short. */
function storedKey(namespace: string, key: string): string {
  return `${namespace}:${createHash('sha256').update(key).digest('base64url')}`;
}

/**
 * `@fastify/rate-limit` store on `rate_limit_counters` (ADR 0027): every API instance counts in the same rows, and a
 * restart keeps them. One atomic statement per request: a counter whose window has ended starts again at 1.
 * `continueExceeding` and `exponentialBackoff` are not supported (no limiter of the API uses them).
 */
export function postgresRateLimitStore(db: Pick<Database, 'execute'>): FastifyRateLimitStoreCtor {
  class PostgresRateLimitStore implements FastifyRateLimitStore {
    readonly #namespace: string;

    constructor(_options: unknown, namespace = 'global') {
      this.#namespace = namespace;
    }

    incr(
      key: string,
      callback: (error: Error | null, result?: { current: number; ttl: number }) => void,
      timeWindow: number,
    ): void {
      const window = sql`(${timeWindow} * interval '1 millisecond')`;
      db.execute(
        sql`insert into rate_limit_counters as c (key, hits, window_ends_at)
            values (${storedKey(this.#namespace, key)}, 1, now() + ${window})
            on conflict (key) do update set
              hits = case when c.window_ends_at <= now() then 1 else c.hits + 1 end,
              window_ends_at = case when c.window_ends_at <= now() then now() + ${window} else c.window_ends_at end
            returning hits, greatest(0, ceil(extract(epoch from c.window_ends_at - now()) * 1000))::int as ttl`,
      ).then(
        (result) => {
          const counter = CounterSchema.safeParse(result.rows[0]);
          if (counter.success) callback(null, { current: counter.data.hits, ttl: counter.data.ttl });
          else callback(new Error('rate limit counter not returned'));
        },
        (error: unknown) => {
          callback(error instanceof Error ? error : new Error(String(error)));
        },
      );
    }

    child(routeOptions: unknown): FastifyRateLimitStore {
      return new PostgresRateLimitStore(routeOptions, namespaceOf(routeOptions));
    }
  }
  return PostgresRateLimitStore;
}

/** `rate_limit.purge`: drops the counters whose window ended over an hour ago; returns how many. */
export async function purgeRateLimitCounters(db: Pick<Database, 'execute'>): Promise<number> {
  const result = await db.execute(
    sql`delete from rate_limit_counters where window_ends_at < now() - ${PURGE_AFTER}::interval`,
  );
  return result.rowCount ?? 0;
}
