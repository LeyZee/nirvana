import {
  AgentModeResultSchema,
  ApiErrorSchema,
  CreatorIdSchema,
  DashboardSchema,
  newId,
  PlatformAccountIdSchema,
  type ConversationId,
  type CreatorId,
} from '@nirvana/contracts';
import { and, eq, schema } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createOwner } from '../auth';
import { createApp, type App } from '../composition-root';
import { createLogger } from '../logger';
import { setKillSwitch } from '../ops';
import { buildServer, type Server } from '../server';

import { testConfig } from './support/config';
import { DASHBOARD_ORIGIN, signIn } from './support/sign-in';

describe('PUT /v1/agent/mode', () => {
  let test: TestDb;
  let app: App;
  let server: Server;
  let creatorId: CreatorId;
  let conversationId: ConversationId;
  let ownerCookie: string;
  let operatorCookie: string;

  const send = (method: 'PUT' | 'POST' | 'GET', url: string, payload?: object, cookie = ownerCookie) =>
    server.inject({
      method,
      url,
      ...(payload !== undefined && { payload }),
      headers: { cookie, origin: DASHBOARD_ORIGIN },
    });
  const setMode = (mode: string, cookie = ownerCookie) =>
    send('PUT', '/v1/agent/mode', { creatorId, mode }, cookie);
  const dashboard = async () =>
    DashboardSchema.parse((await send('GET', `/v1/dashboard?creatorId=${creatorId}`)).json());
  const dashboardMode = async () => (await dashboard()).mode;
  const creatorSwitches = () =>
    test.admin.db
      .select({ active: schema.killSwitches.active, setBy: schema.killSwitches.setBy })
      .from(schema.killSwitches)
      .where(and(eq(schema.killSwitches.scope, 'creator'), eq(schema.killSwitches.scopeId, creatorId)))
      .orderBy(schema.killSwitches.setAt);

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

    creatorId = newId(CreatorIdSchema);
    const platformAccountId = newId(PlatformAccountIdSchema);
    await test.admin.db
      .insert(schema.creators)
      .values({ id: creatorId, displayName: 'Lina', timezone: 'Europe/Paris' });
    await test.admin.db.insert(schema.platformAccounts).values({
      id: platformAccountId,
      creatorId,
      platform: 'reveal',
      handle: 'test-agent-mode',
      sessionState: 'valid',
    });
    ({ conversationId } = await app.modules.conversations.ingestMessage({
      creatorId,
      platformAccountId,
      platformConversationId: 'c-julien',
      platformFanId: 'f-julien',
      fanDisplayName: 'Julien',
      message: {
        ref: { platform: 'reveal', id: 'm-julien' },
        conversationRef: { platform: 'reveal', id: 'c-julien' },
        direction: 'inbound',
        text: 'Salut',
        media: [],
        priceMinor: null,
        currency: null,
        isPaid: false,
        createdAt: new Date().toISOString(),
      },
      correlationId: 'seed',
    }));

    const owner = { email: 'owner@example.test', name: 'Owner', password: 'correct horse battery' };
    await createOwner(app.auth, app.db.db, owner);
    ownerCookie = await signIn(server, owner.email, owner.password);
    const operator = { email: 'operator@example.test', name: 'Operator', password: 'correct horse battery' };
    const { userId } = await createOwner(app.auth, app.db.db, operator);
    await test.admin.db
      .update(schema.user)
      .set({ role: 'operator', creatorIds: [newId(CreatorIdSchema)] })
      .where(eq(schema.user.id, userId));
    operatorCookie = await signIn(server, operator.email, operator.password);
  });

  afterAll(async () => {
    await server.close();
    await app.shutdown();
    await test.close();
  });

  it('refuses Automatique while ADR 0019 keeps it locked, and writes nothing', async () => {
    const response = await setMode('auto');
    expect(response.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(response.json()).error.code).toBe('agent_mode_conflict');
    expect(await creatorSwitches()).toEqual([]);
  });

  it('refuses a creator outside the operator’s list', async () => {
    expect((await setMode('stop', operatorCookie)).statusCode).toBe(403);
    expect(await creatorSwitches()).toEqual([]);
  });

  it('Arrêt sets her kill switch at once, with its event and its audit line', async () => {
    const response = await setMode('stop');
    expect(response.statusCode).toBe(200);
    expect(AgentModeResultSchema.parse(response.json())).toEqual({ mode: 'stop', globalStop: false });
    expect(await dashboardMode()).toBe('stop');

    const switches = await creatorSwitches();
    expect(switches).toHaveLength(1);
    expect(switches[0]?.active).toBe(true);
    expect(switches[0]?.setBy).toMatch(/^human:/);
    const [event] = await test.admin.db
      .select()
      .from(schema.domainEvents)
      .where(
        and(
          eq(schema.domainEvents.creatorId, creatorId),
          eq(schema.domainEvents.type, 'kill_switch_toggled'),
        ),
      );
    expect(event?.payload).toMatchObject({ scope: 'creator', scopeId: creatorId, active: true });
    const [audit] = await test.admin.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, 'kill_switch.on'));
    expect(audit).toMatchObject({ entity: 'kill_switch', entityId: creatorId });

    // A second Arrêt changes nothing: one row per change, not per click.
    expect((await setMode('stop')).json()).toEqual({ mode: 'stop', globalStop: false });
    expect(await creatorSwitches()).toHaveLength(1);
  });

  it('Copilote lifts the switch and brings a conversation in Automatique back to the copilot', async () => {
    const toAuto = await send('POST', `/v1/conversations/${conversationId}/mode?creatorId=${creatorId}`, {
      mode: 'auto',
    });
    expect(toAuto.statusCode).toBe(204);

    const response = await setMode('copilot');
    expect(response.json()).toEqual({ mode: 'copilot', globalStop: false });
    expect(await dashboardMode()).toBe('copilot');
    expect((await creatorSwitches()).map((s) => s.active)).toEqual([true, false]);
    const [conversation] = await test.admin.db
      .select({ mode: schema.conversations.mode })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId));
    expect(conversation?.mode).toBe('copilot');
  });

  it('answers Arrêt to Copilote while the global switch stays on', async () => {
    await setKillSwitch(test.admin.db, { active: true, scope: 'global', scopeId: null, reason: 'test' });
    expect((await setMode('copilot')).json()).toEqual({ mode: 'stop', globalStop: true });
    // The Dashboard, reloaded, says the same and why.
    expect(await dashboard()).toMatchObject({ mode: 'stop', globalStop: true });
    await setKillSwitch(test.admin.db, { active: false, scope: 'global', scopeId: null, reason: 'test' });
    expect(await dashboardMode()).toBe('copilot');
  });

  it('applies clicks sent together one after the other', async () => {
    const before = (await creatorSwitches()).length;
    const modes = ['stop', 'copilot', 'stop', 'copilot', 'stop', 'stop', 'copilot', 'stop'];
    const responses = await Promise.all(modes.map((mode) => setMode(mode)));
    expect(responses.every((r) => r.statusCode === 200)).toBe(true);

    // Serialised: every new row flips the one before it, and the latest row is the mode now shown.
    const rows = (await creatorSwitches()).slice(before - 1).map((s) => s.active);
    for (let i = 1; i < rows.length; i += 1) expect(rows[i]).toBe(!rows[i - 1]);
    expect(await dashboardMode()).toBe(rows.at(-1) === true ? 'stop' : 'copilot');
  });
});
