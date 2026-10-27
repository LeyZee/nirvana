import { sql } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createOwner } from '../auth';
import { createApp, type App } from '../composition-root';
import { createLogger } from '../logger';
import { postgresRateLimitStore, purgeRateLimitCounters } from '../rate-limit-store';
import { buildServer, type Server } from '../server';

import { testConfig } from './support/config';
import { DASHBOARD_ORIGIN } from './support/sign-in';

const PER_MINUTE = 4;

describe('rate limits shared by every API instance (ADR 0027)', () => {
  let test: TestDb;
  let app: App;
  let first: Server;
  let second: Server;

  const me = (server: Server, remoteAddress: string) =>
    server.inject({ method: 'GET', url: '/v1/me', remoteAddress });

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    const config = testConfig({
      DATABASE_URL: test.appUrl,
      DATABASE_ADMIN_URL: test.adminUrl,
      RATE_LIMIT_PER_MINUTE: String(PER_MINUTE),
    });
    app = await createApp(config, createLogger(config));
    // Two instances of the API, as two containers behind the proxy: same routes, same store, no shared memory.
    const instance = () =>
      buildServer({
        config,
        logger: createLogger(config),
        routes: app.routes,
        readiness: app.readiness,
        rateLimitStore: postgresRateLimitStore(app.db.db),
      });
    first = await instance();
    second = await instance();
    await createOwner(app.auth, app.db.db, {
      email: 'owner@example.test',
      name: 'Owner',
      password: 'correct horse battery',
    });
  });

  beforeEach(async () => {
    await test.admin.db.execute(sql`delete from rate_limit_counters`);
  });

  afterAll(async () => {
    await first.close();
    await second.close();
    await app.shutdown();
    await test.close();
  });

  it('counts one client across both instances, and the limit does not double', async () => {
    for (let i = 0; i < PER_MINUTE; i += 1) {
      const response = await me(i % 2 === 0 ? first : second, '192.0.2.1');
      expect(response.statusCode).toBe(401);
    }
    const limited = await me(first, '192.0.2.1');
    expect(limited.statusCode).toBe(429);
    expect(limited.json<{ error: { code: string } }>().error.code).toBe('rate_limited');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect((await me(second, '192.0.2.1')).statusCode).toBe(429);

    expect((await me(second, '192.0.2.2')).statusCode).toBe(401);
  });

  it('starts a client again at one once its window has ended', async () => {
    for (let i = 0; i <= PER_MINUTE; i += 1) await me(first, '192.0.2.3');
    expect((await me(first, '192.0.2.3')).statusCode).toBe(429);

    await test.admin.db.execute(
      sql`update rate_limit_counters set window_ends_at = now() - interval '1 second'`,
    );
    const again = await me(second, '192.0.2.3');
    expect(again.statusCode).toBe(401);
    expect(again.headers['x-ratelimit-remaining']).toBe(String(PER_MINUTE - 1));
  });

  it('keeps a limiter of its own apart from the API-wide one (sign-ins per account)', async () => {
    const signIn = (server: Server, remoteAddress: string) =>
      server.inject({
        method: 'POST',
        url: '/v1/auth/sign-in/email',
        payload: { email: 'target@example.test', password: 'wrong password!' },
        remoteAddress,
        headers: { origin: DASHBOARD_ORIGIN },
      });
    // Ten tries per account, from addresses that each stay under the API-wide limit, split across both instances.
    for (let i = 0; i < 10; i += 1) {
      expect((await signIn(i % 2 === 0 ? first : second, `198.51.100.${String(i)}`)).statusCode).toBe(401);
    }
    const blocked = await signIn(second, '198.51.100.50');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json<{ error: { code: string } }>().error.code).toBe('sign_in_limited');
  });

  it('stores neither an IP nor an e-mail in clear', async () => {
    await me(first, '203.0.113.9');
    const { rows } = await test.admin.db.execute<{ key: string }>(sql`select key from rate_limit_counters`);
    expect(rows.length).toBeGreaterThan(0);
    for (const { key } of rows) {
      expect(key).not.toContain('203.0.113.9');
      expect(key).not.toContain('@');
    }
  });

  it('purges the counters whose window ended over an hour ago, and only those', async () => {
    await test.admin.db.execute(
      sql`insert into rate_limit_counters (key, hits, window_ends_at) values
          ('old', 3, now() - interval '2 hours'), ('recent', 1, now() - interval '5 minutes'), ('live', 1, now() + interval '1 minute')`,
    );
    expect(await purgeRateLimitCounters(app.db.db)).toBe(1);
    const { rows } = await test.admin.db.execute<{ key: string }>(
      sql`select key from rate_limit_counters order by key`,
    );
    expect(rows.map((row) => row.key)).toEqual(['live', 'recent']);
  });
});
