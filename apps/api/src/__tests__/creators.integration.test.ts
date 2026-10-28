import {
  AgentHoursViewSchema,
  CreatorIdSchema,
  newId,
  DEFAULT_AGENT_HOURS,
  nextReplyOpening,
  reopenJobKey,
  SUGGESTED_REPLY_SLOTS,
  type AgentHours,
} from '@nirvana/contracts';
import { eq, schema, sql } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';

import { createOwner } from '../auth';
import { createApp, type App } from '../composition-root';
import { createLogger } from '../logger';
import { buildServer, type Server } from '../server';

import { testConfig } from './support/config';
import { DASHBOARD_ORIGIN, signIn } from './support/sign-in';

const OWNER = { email: 'owner@example.test', name: 'Owner', password: 'correct horse battery' };
const OPERATOR = { email: 'operator@example.test', name: 'Operator', password: 'staple battery horse' };

describe('creators (GET /v1/creators, pnpm creator:create)', () => {
  let test: TestDb;
  let app: App;
  let server: Server;

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    const config = testConfig({ DATABASE_URL: test.appUrl, DATABASE_ADMIN_URL: test.adminUrl });
    app = await createApp(config, createLogger(config));
    server = await buildServer({
      config,
      logger: createLogger(config),
      routes: app.routes,
      readiness: app.readiness,
    });
    await createOwner(app.auth, app.db.db, OWNER);
  });

  async function reopenJobs(creatorId: string) {
    const result = await test.admin.db.execute(
      sql`select run_at, payload from graphile_worker._private_jobs where key = ${reopenJobKey(creatorId)}`,
    );
    return z.array(z.object({ run_at: z.coerce.date(), payload: z.unknown() })).parse(result.rows);
  }

  afterAll(async () => {
    await server.close();
    await app.shutdown();
    await test.close();
  });

  it('creates a creator with an audit line, Paris time by default, and refuses a made-up zone', async () => {
    const creator = await app.modules.persona.creators.create({ displayName: '  Zoé  ' });
    expect(creator).toMatchObject({ displayName: 'Zoé', timezone: 'Europe/Paris' });
    const audit = await test.admin.db
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, creator.id));
    expect(audit).toEqual([{ action: 'creator.create' }]);
    await expect(
      app.modules.persona.creators.create({ displayName: 'X', timezone: 'Europe/Atlantis' }),
    ).rejects.toThrow();
  });

  it('lists every creator to the owner and only their own to an operator', async () => {
    const anna = await app.modules.persona.creators.create({ displayName: 'Anna' });
    await app.modules.persona.creators.create({ displayName: 'Bea', timezone: 'Europe/Brussels' });
    const { userId } = await createOwner(app.auth, app.db.db, OPERATOR);
    await test.admin.db
      .update(schema.user)
      .set({ role: 'operator', creatorIds: [anna.id] })
      .where(eq(schema.user.id, userId));

    expect((await server.inject({ method: 'GET', url: '/v1/creators' })).statusCode).toBe(401);
    const owner = await server.inject({
      method: 'GET',
      url: '/v1/creators',
      headers: { cookie: await signIn(server, OWNER.email, OWNER.password) },
    });
    expect(owner.json<{ creators: { displayName: string }[] }>().creators.map((c) => c.displayName)).toEqual([
      'Anna',
      'Bea',
      'Zoé',
    ]);
    const operator = await server.inject({
      method: 'GET',
      url: '/v1/creators',
      headers: { cookie: await signIn(server, OPERATOR.email, OPERATOR.password) },
    });
    expect(operator.json()).toEqual({
      creators: [{ id: anna.id, displayName: 'Anna', timezone: 'Europe/Paris' }],
    });
  });

  it('creates her once when the same form is sent twice at the same time (recette 28/10)', async () => {
    const id = newId(CreatorIdSchema);
    const [first, second] = await Promise.all([
      app.modules.persona.creators.create({ id, displayName: 'Inès' }),
      app.modules.persona.creators.create({ id, displayName: 'Inès' }),
    ]);
    expect(first).toEqual(second);
    expect(first.id).toBe(id);
    const rows = await test.admin.db.select().from(schema.creators).where(eq(schema.creators.id, id));
    expect(rows).toHaveLength(1);
    const audit = await test.admin.db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, id));
    expect(audit).toHaveLength(1);
    // The same id with another name is not a replay: 409, and she keeps her name.
    const cookie = await signIn(server, OWNER.email, OWNER.password);
    const other = await server.inject({
      method: 'POST',
      url: '/v1/creators',
      headers: { cookie, origin: DASHBOARD_ORIGIN },
      payload: { id, displayName: 'Inès B' },
    });
    expect(other.statusCode).toBe(409);
    expect(other.json<{ error: { code: string } }>().error.code).toBe('creator_conflict');
    const [kept] = await test.admin.db.select().from(schema.creators).where(eq(schema.creators.id, id));
    expect(kept?.displayName).toBe('Inès');
  });

  it('lets the owner alone read and set her hours (P3-14), with a recent sign-in, back to the defaults on null', async () => {
    const nora = await app.modules.persona.creators.create({
      displayName: 'Nora',
      timezone: 'Europe/Brussels',
    });
    const url = `/v1/creators/${nora.id}/agent-hours`;
    const owner = { cookie: await signIn(server, OWNER.email, OWNER.password), origin: DASHBOARD_ORIGIN };
    const operator = {
      cookie: await signIn(server, OPERATOR.email, OPERATOR.password),
      origin: DASHBOARD_ORIGIN,
    };
    const slots: AgentHours = {
      ...DEFAULT_AGENT_HOURS,
      reply: { mode: 'slots', slots: [...SUGGESTED_REPLY_SLOTS] },
    };
    const read = async () => {
      const response = await server.inject({ method: 'GET', url, headers: owner });
      expect(response.statusCode).toBe(200);
      return AgentHoursViewSchema.parse(response.json());
    };
    const put = (headers: Record<string, string>, hours: unknown) =>
      server.inject({ method: 'PUT', url, headers, payload: { hours } });

    expect(await read()).toEqual({
      hours: DEFAULT_AGENT_HOURS,
      isDefault: true,
      invalidStored: false,
      timeZone: 'Europe/Brussels',
    });
    expect((await server.inject({ method: 'GET', url, headers: operator })).statusCode).toBe(403);
    expect((await put(operator, slots)).statusCode).toBe(403);

    const set = await put(owner, slots);
    expect(set.statusCode).toBe(200);
    expect(AgentHoursViewSchema.parse(set.json())).toEqual({
      hours: slots,
      isDefault: false,
      invalidStored: false,
      timeZone: 'Europe/Brussels',
    });
    // The fans her old hours put off wait for her next opening under the new ones: 9:00 in Brussels at the latest.
    const [moved] = await reopenJobs(nora.id);
    expect(moved?.run_at.getTime()).toBe(
      nextReplyOpening(slots, 'Europe/Brussels', moved?.run_at ?? new Date()).getTime(),
    );
    expect(await read()).toMatchObject({ isDefault: false, hours: slots });

    // Two slots of one day that overlap: refused, the stored hours kept.
    const [monday] = SUGGESTED_REPLY_SLOTS;
    const overlapping = {
      ...slots,
      reply: { mode: 'slots', slots: [monday, { ...monday, startMinute: 600 }] },
    };
    expect((await put(owner, overlapping)).statusCode).toBe(400);
    expect((await read()).hours).toEqual(slots);

    const missing = '0199f2a0-0000-7000-8000-0000000000ff';
    const unknown = await server.inject({
      method: 'PUT',
      url: `/v1/creators/${missing}/agent-hours`,
      headers: owner,
      payload: { hours: null },
    });
    expect([unknown.statusCode, unknown.json<{ error: { code: string } }>().error.code]).toEqual([
      404,
      'creator_not_found',
    ]);

    expect((await put(owner, null)).statusCode).toBe(200);
    expect(await read()).toMatchObject({ hours: DEFAULT_AGENT_HOURS, isDefault: true, invalidStored: false });
    // Back to always open: those who wait are answered now, not at the opening the old hours gave.
    const [now] = await reopenJobs(nora.id);
    expect(now?.run_at.getTime()).toBeLessThanOrEqual(Date.now());
    expect(now?.payload).toMatchObject({ creatorId: nora.id });
    const audit = await test.admin.db
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, nora.id));
    expect(audit.map((line) => line.action)).toEqual([
      'creator.create',
      'creator.agent_hours',
      'creator.agent_hours',
    ]);

    // A change asks for the password again after 10 minutes; reading does not.
    await test.admin.db.execute(
      sql`update "session" set created_at = now() - interval '11 minutes' where user_id = (select id from "user" where email = ${OWNER.email})`,
    );
    const stale = await put(owner, slots);
    expect([stale.statusCode, stale.json<{ error: { code: string } }>().error.code]).toEqual([
      403,
      'reauthentication_forbidden',
    ]);
    expect((await read()).isDefault).toBe(true);
  });

  it('says when her stored hours no longer read, and follows the defaults', async () => {
    const iris = await app.modules.persona.creators.create({ displayName: 'Iris' });
    // Hours a later contract would refuse: every slot switched off.
    await test.admin.db
      .update(schema.creators)
      .set({ agentHours: { reply: { mode: 'slots', slots: [] }, followUpQuiet: {}, night: {} } })
      .where(eq(schema.creators.id, iris.id));
    const owner = { cookie: await signIn(server, OWNER.email, OWNER.password), origin: DASHBOARD_ORIGIN };
    const response = await server.inject({
      method: 'GET',
      url: `/v1/creators/${iris.id}/agent-hours`,
      headers: owner,
    });
    expect(AgentHoursViewSchema.parse(response.json())).toEqual({
      hours: DEFAULT_AGENT_HOURS,
      isDefault: true,
      invalidStored: true,
      timeZone: 'Europe/Paris',
    });
  });
});
