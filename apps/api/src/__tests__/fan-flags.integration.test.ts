import {
  FanFlagsViewSchema,
  FanIdSchema,
  newId,
  PlatformAccountIdSchema,
  type CreatorId,
  type FanId,
} from '@nirvana/contracts';
import { and, eq, schema, withAdmin } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createOwner } from '../auth';
import { createApp, type App } from '../composition-root';
import { createLogger } from '../logger';
import { buildServer, type Server } from '../server';

import { testConfig } from './support/config';
import { DASHBOARD_ORIGIN, signIn } from './support/sign-in';

const OWNER = { email: 'owner@example.test', name: 'Owner', password: 'correct horse battery' };
const OPERATOR = { email: 'operator@example.test', name: 'Operator', password: 'staple battery horse' };
const CREATOR = { email: 'creator@example.test', name: 'Creator', password: 'battery staple horse' };

describe('fan flags (GET and PUT /v1/fans/:id/flags)', () => {
  let test: TestDb;
  let app: App;
  let server: Server;
  let owner: string;
  let operator: string;
  let creator: string;
  let operatorId: string;
  let anna: CreatorId;
  let bea: CreatorId;
  let fan: FanId;

  const url = (fanId: string, creatorId: string) => `/v1/fans/${fanId}/flags?creatorId=${creatorId}`;
  const get = (cookie: string, creatorId: string = anna) =>
    server.inject({ method: 'GET', url: url(fan, creatorId), headers: { cookie } });
  const put = (cookie: string, payload: object, creatorId: string = anna) =>
    server.inject({
      method: 'PUT',
      url: url(fan, creatorId),
      headers: { cookie, origin: DASHBOARD_ORIGIN },
      payload,
    });
  const eventsOf = (type: 'fan_flag_set' | 'fan_flag_cleared') =>
    test.admin.db
      .select()
      .from(schema.domainEvents)
      .where(and(eq(schema.domainEvents.creatorId, anna), eq(schema.domainEvents.type, type)));

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
    anna = (await app.modules.persona.creators.create({ displayName: 'Anna' })).id;
    bea = (await app.modules.persona.creators.create({ displayName: 'Bea' })).id;
    // An invented fan of Anna (ADR 0010).
    const accountId = newId(PlatformAccountIdSchema);
    fan = newId(FanIdSchema);
    await withAdmin(test.admin.db, async (tx) => {
      await tx
        .insert(schema.platformAccounts)
        .values({ id: accountId, creatorId: anna, platform: 'reveal', handle: 'anna-demo' });
      await tx.insert(schema.fans).values({
        id: fan,
        creatorId: anna,
        platformAccountId: accountId,
        platformFanId: 'fan-1',
        displayName: 'Basile',
      });
    });
    operatorId = (await createOwner(app.auth, app.db.db, OPERATOR)).userId;
    await test.admin.db
      .update(schema.user)
      .set({ role: 'operator', creatorIds: [anna] })
      .where(eq(schema.user.id, operatorId));
    const { userId: creatorUserId } = await createOwner(app.auth, app.db.db, CREATOR);
    await test.admin.db
      .update(schema.user)
      .set({ role: 'creator', creatorIds: [anna] })
      .where(eq(schema.user.id, creatorUserId));
    owner = await signIn(server, OWNER.email, OWNER.password);
    operator = await signIn(server, OPERATOR.email, OPERATOR.password);
    creator = await signIn(server, CREATOR.email, CREATOR.password);
  });

  afterAll(async () => {
    await server.close();
    await app.shutdown();
    await test.close();
  });

  it('reads his limits, none at first', async () => {
    expect((await server.inject({ method: 'GET', url: url(fan, anna) })).statusCode).toBe(401);
    const read = await get(operator);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ fanId: fan, flags: {} });
  });

  it('lets a chatter set and lift a limit, authored by the session, once per change', async () => {
    const frozen = await put(operator, {
      flag: 'salesFrozen',
      set: true,
      freezeReason: 'distress',
      reason: '  Va mal  ',
    });
    expect(frozen.statusCode).toBe(200);
    const since = frozen.json<{ flags: { salesFrozen: { since: string } } }>().flags.salesFrozen.since;
    expect(frozen.json()).toEqual({ fanId: fan, flags: { salesFrozen: { reason: 'distress', since } } });
    // The same freeze again keeps its start and writes nothing.
    expect(
      (await put(operator, { flag: 'salesFrozen', set: true, freezeReason: 'distress' })).json(),
    ).toEqual({
      fanId: fan,
      flags: { salesFrozen: { reason: 'distress', since } },
    });
    expect((await put(owner, { flag: 'spendingLimitMinor', set: true, limitMinor: 5000 })).statusCode).toBe(
      200,
    );
    expect((await put(owner, { flag: 'ageConfirmedAt', set: true })).statusCode).toBe(200);
    const lifted = await put(operator, { flag: 'salesFrozen', set: false });
    expect(lifted.statusCode).toBe(200);
    expect(lifted.json<{ flags: object }>().flags).not.toHaveProperty('salesFrozen');
    const after = FanFlagsViewSchema.parse((await get(operator)).json()).flags;
    expect(Object.keys(after).sort()).toEqual(['ageConfirmedAt', 'spendingLimitMinor']);
    expect(after.spendingLimitMinor).toBe(5000);

    const set = await eventsOf('fan_flag_set');
    expect(set).toHaveLength(3);
    const first = set.find((event) => event.actor === `human:${operatorId}`);
    expect(first?.payload).toMatchObject({ fanId: fan, flag: 'salesFrozen', reason: 'Va mal' });
    const cleared = await eventsOf('fan_flag_cleared');
    expect(cleared.map((event) => event.actor)).toEqual([`human:${operatorId}`]);
  });

  it('refuses the creator, another creator, an unknown fan and a malformed request', async () => {
    // A creator never sees her fans' data (ADR 0023), not even his limits.
    expect((await get(creator)).statusCode).toBe(403);
    expect((await put(creator, { flag: 'fragile', set: true })).statusCode).toBe(403);
    expect((await put(operator, { flag: 'fragile', set: true }, bea)).statusCode).toBe(403);
    // The owner sees every creator, but Anna's fan is not Bea's.
    expect((await put(owner, { flag: 'fragile', set: true }, bea)).statusCode).toBe(404);
    expect((await get(owner, bea)).statusCode).toBe(404);
    expect((await put(owner, { flag: 'salesFrozen', set: true })).statusCode).toBe(400);
    expect((await put(owner, { flag: 'spendingLimitMinor', set: true, limitMinor: -1 })).statusCode).toBe(
      400,
    );
    expect((await put(owner, { flag: 'fragile', set: true, reason: '   ' })).statusCode).toBe(400);
    expect((await get(owner)).json<{ flags: object }>().flags).not.toHaveProperty('fragile');
  });
});
