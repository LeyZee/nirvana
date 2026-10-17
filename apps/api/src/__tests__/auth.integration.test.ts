import { eq, schema, sql } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createOwner } from '../auth';
import { createApp, type App } from '../composition-root';
import { createLogger } from '../logger';
import { buildServer, type Server } from '../server';

import { testConfig } from './support/config';
import { DASHBOARD_ORIGIN, signIn } from './support/sign-in';

const OWNER = { email: 'owner@example.test', name: 'Owner', password: 'correct horse battery' };
const OPERATOR = { email: 'operator@example.test', name: 'Operator', password: 'staple battery horse' };

describe('dashboard authentication (P0-07a)', () => {
  let test: TestDb;
  let app: App;
  let server: Server;

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    const config = testConfig({ DATABASE_URL: test.appUrl, DATABASE_ADMIN_URL: test.adminUrl });
    app = await createApp(config, createLogger(config));
    const ownerOnly: FastifyPluginAsyncZod = (routes) => {
      routes.post('/owner-only', { preHandler: app.requireRole('owner') }, () => ({ ok: true }));
      return Promise.resolve();
    };
    server = await buildServer({
      config,
      logger: createLogger(config),
      routes: [...app.routes, ownerOnly],
      readiness: app.readiness,
    });
    await createOwner(app.auth, app.db.db, OWNER);
    const { userId } = await createOwner(app.auth, app.db.db, OPERATOR);
    await test.admin.db.update(schema.user).set({ role: 'operator' }).where(eq(schema.user.id, userId));
  });

  afterAll(async () => {
    await server.close();
    await app.shutdown();
    await test.close();
  });

  it('answers 401 without a session', async () => {
    const response = await server.inject({ method: 'GET', url: '/v1/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('session_unauthenticated');
  });

  it('signs in, tells who is signed in, and records the login', async () => {
    const cookie = await signIn(server, OWNER.email, OWNER.password);
    const me = await server.inject({ method: 'GET', url: '/v1/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: OWNER.email, role: 'owner', creatorIds: [] });
    expect(me.json<{ id: string }>().id).toMatch(/^[0-9a-f-]{36}$/);

    const logins = await test.admin.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, 'auth.login'));
    expect(logins.length).toBeGreaterThanOrEqual(1);
  });

  it('sets the session cookie HttpOnly and SameSite=Lax, and keeps the token out of the body', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/sign-in/email',
      payload: { email: OWNER.email, password: OWNER.password },
      headers: { origin: DASHBOARD_ORIGIN },
    });
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    // The token lives in the cookie only, never in a body the page's JavaScript can read.
    expect(response.json()).not.toHaveProperty('token');
    expect(response.json()).toMatchObject({ user: { email: OWNER.email } });
  });

  it('refuses a wrong password', async () => {
    await expect(signIn(server, OWNER.email, 'not the password at all')).rejects.toThrow(/401/);
  });

  it('answers 403 to an operator on an owner route, 200 to the owner', async () => {
    const operator = await signIn(server, OPERATOR.email, OPERATOR.password);
    const owner = await signIn(server, OWNER.email, OWNER.password);
    const call = (cookie: string, origin = DASHBOARD_ORIGIN) =>
      server.inject({ method: 'POST', url: '/v1/owner-only', headers: { cookie, origin } });

    const refused = await call(operator);
    expect(refused.statusCode).toBe(403);
    expect(refused.json<{ error: { code: string } }>().error.code).toBe('role_forbidden');
    expect((await call(owner)).statusCode).toBe(200);
    // Signed in but from another site: the Origin check comes first.
    expect((await call(owner, 'https://evil.example')).statusCode).toBe(403);
  });

  it('has no public sign-up', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/sign-up/email',
      payload: { email: 'intruder@example.test', name: 'X', password: 'a long enough password' },
      headers: { origin: DASHBOARD_ORIGIN },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    const users = await test.admin.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'intruder@example.test'));
    expect(users).toEqual([]);
  });

  it('signs out and the session stops working', async () => {
    const cookie = await signIn(server, OWNER.email, OWNER.password);
    const out = await server.inject({
      method: 'POST',
      url: '/v1/auth/sign-out',
      headers: { cookie, origin: DASHBOARD_ORIGIN },
    });
    expect(out.statusCode).toBe(200);
    expect((await server.inject({ method: 'GET', url: '/v1/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('asks for the password again before touching an AI key with a session older than 10 minutes', async () => {
    const cookie = await signIn(server, OWNER.email, OWNER.password);
    const headers = { cookie, origin: DASHBOARD_ORIGIN };
    const remove = () => server.inject({ method: 'DELETE', url: '/v1/settings/providers/xai', headers });
    expect((await remove()).statusCode).toBe(200);

    await test.admin.db.execute(
      sql`update "session" set created_at = now() - interval '11 minutes' where user_id = (select id from "user" where email = ${OWNER.email})`,
    );
    const stale = await remove();
    expect(stale.statusCode).toBe(403);
    expect(stale.json<{ error: { code: string } }>().error.code).toBe('reauthentication_forbidden');
    // Reading stays open; only connecting, replacing and removing a key ask again.
    expect((await server.inject({ method: 'GET', url: '/v1/settings/providers', headers })).statusCode).toBe(
      200,
    );

    const fresh = await signIn(server, OWNER.email, OWNER.password);
    const again = await server.inject({
      method: 'DELETE',
      url: '/v1/settings/providers/xai',
      headers: { cookie: fresh, origin: DASHBOARD_ORIGIN },
    });
    expect(again.statusCode).toBe(200);
  });

  it('refuses a second account with the same email and a short password', async () => {
    await expect(createOwner(app.auth, app.db.db, OWNER)).rejects.toThrow(/existe déjà/);
    await expect(
      createOwner(app.auth, app.db.db, { email: 'short@example.test', name: 'S', password: 'short' }),
    ).rejects.toThrow(/trop court/);
  });
});
