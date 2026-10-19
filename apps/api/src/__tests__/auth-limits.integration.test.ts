import { eq, schema, sql } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createOwner } from '../auth';
import { createApp, type App } from '../composition-root';
import { createLogger } from '../logger';
import { buildServer, type Server } from '../server';

import { testConfig } from './support/config';
import { DASHBOARD_ORIGIN } from './support/sign-in';

const OWNER = { email: 'owner@example.test', name: 'Owner', password: 'correct horse battery' };

describe('client IP and sign-in limits (G6)', () => {
  let test: TestDb;
  let app: App;
  let direct: Server;
  let proxied: Server;

  const signIn = (
    server: Server,
    email: string,
    password: string,
    from: { remoteAddress: string; headers?: Record<string, string> },
  ) =>
    server.inject({
      method: 'POST',
      url: '/v1/auth/sign-in/email',
      payload: { email, password },
      remoteAddress: from.remoteAddress,
      headers: { origin: DASHBOARD_ORIGIN, ...from.headers },
    });

  const lastLoginIp = async () => {
    const [row] = await test.admin.db
      .select({ ip: schema.auditLog.ip })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, 'auth.login'))
      .orderBy(sql`${schema.auditLog.createdAt} desc`)
      .limit(1);
    return row?.ip;
  };

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    const config = testConfig({ DATABASE_URL: test.appUrl, DATABASE_ADMIN_URL: test.adminUrl });
    app = await createApp(config, createLogger(config));
    const server = (hops: string) => {
      const withHops = testConfig({
        DATABASE_URL: test.appUrl,
        DATABASE_ADMIN_URL: test.adminUrl,
        TRUST_PROXY_HOPS: hops,
      });
      return buildServer({
        config: withHops,
        logger: createLogger(withHops),
        routes: app.routes,
        readiness: app.readiness,
      });
    };
    direct = await server('0');
    proxied = await server('1');
    await createOwner(app.auth, app.db.db, OWNER);
  });

  afterAll(async () => {
    await direct.close();
    await proxied.close();
    await app.shutdown();
    await test.close();
  });

  it('records the client behind the proxy, never a header the client wrote', async () => {
    const response = await signIn(proxied, OWNER.email, OWNER.password, {
      remoteAddress: '10.0.0.2',
      headers: { 'x-forwarded-for': '203.0.113.7', 'x-nirvana-client-ip': '198.51.100.1' },
    });
    expect(response.statusCode).toBe(200);
    expect(await lastLoginIp()).toBe('203.0.113.7');
  });

  it('ignores x-forwarded-for when no proxy is declared', async () => {
    const response = await signIn(direct, OWNER.email, OWNER.password, {
      remoteAddress: '192.0.2.10',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    expect(response.statusCode).toBe(200);
    expect(await lastLoginIp()).toBe('192.0.2.10');
  });

  it('limits sign-ins per account across addresses, and only that account', async () => {
    const target = 'target@example.test';
    for (let i = 0; i < 10; i += 1) {
      const response = await signIn(direct, target, 'wrong password!', {
        remoteAddress: `192.0.2.${String(i + 20)}`,
      });
      expect(response.statusCode).toBe(401);
    }
    const blocked = await signIn(direct, target.toUpperCase(), 'wrong password!', {
      remoteAddress: '192.0.2.99',
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json<{ error: { code: string } }>().error.code).toBe('sign_in_limited');

    const other = await signIn(direct, 'other@example.test', 'wrong password!', {
      remoteAddress: '192.0.2.99',
    });
    expect(other.statusCode).toBe(401);
  });
});
