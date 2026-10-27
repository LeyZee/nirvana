import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text } from 'drizzle-orm/pg-core';

import { timestampTz } from './columns';

/** Written every 30 s by each worker, read by `/ready`. Out of RLS. */
export const workerHeartbeats = pgTable('worker_heartbeats', {
  workerId: text('worker_id').primaryKey(),
  hostname: text('hostname').notNull(),
  version: text('version').notNull(),
  lastSeenAt: timestampTz('last_seen_at').notNull().defaultNow(),
});

/**
 * The API's shared rate limiter (ADR 0027): one counter per key and window, so every instance of the API counts the
 * same requests. Out of RLS (no tenant data). The key is hashed by the store, never an IP or an e-mail in clear; the
 * worker's `rate_limit.purge` removes a window an hour after it ends. UNLOGGED (migration 0017): a crash loses the
 * counters, which only opens a fresh window.
 */
export const rateLimitCounters = pgTable(
  'rate_limit_counters',
  {
    key: text('key').primaryKey(),
    hits: integer('hits').notNull(),
    windowEndsAt: timestampTz('window_ends_at').notNull(),
  },
  (t) => [
    check('rate_limit_counters_key_check', sql`char_length(${t.key}) <= 512`),
    check('rate_limit_counters_hits_check', sql`${t.hits} > 0`),
    index('rate_limit_counters_window_ends_at_idx').on(t.windowEndsAt),
  ],
);
