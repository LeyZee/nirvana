import {
  ConversationDetailSchema,
  CreatorIdSchema,
  DashboardSchema,
  DraftIdSchema,
  EventIdSchema,
  KillSwitchIdSchema,
  MessageIdSchema,
  newId,
  PlatformAccountIdSchema,
  type ConversationId,
  type CreatorId,
  type PlatformAccountId,
} from '@nirvana/contracts';
import { eq, schema, sql } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { loadPrompt } from '@nirvana/llm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createOwner } from '../auth';
import { createApp, type App } from '../composition-root';
import { createLogger } from '../logger';
import type { DraftComposer } from '../modules/conversations';
import { buildServer, type Server } from '../server';

import { testConfig } from './support/config';
import { DASHBOARD_ORIGIN, signIn } from './support/sign-in';

const NO_LOG = { info: () => undefined, warn: () => undefined };

/** Drafts written by the configured voice version: they count for the live rate. */
const versionedComposer: DraftComposer = {
  compose: () =>
    Promise.resolve({
      kind: 'draft',
      bubbles: ['Coucou toi ✨'],
      softViolations: [],
      costUsd: 0,
      voice: { voicePrompt: loadPrompt('voice').header.version, voiceModel: 'grok-4.7' },
    }),
};

describe('GET /v1/dashboard', () => {
  let test: TestDb;
  let app: App;
  let server: Server;
  let creatorId: CreatorId;
  let platformAccountId: PlatformAccountId;
  let ownerCookie: string;
  let operatorCookie: string;
  let creatorCookie: string;
  const conversations = new Map<string, ConversationId>();

  const call = (url: string, cookie?: string) =>
    server.inject({
      method: 'GET',
      url,
      headers: { origin: DASHBOARD_ORIGIN, ...(cookie !== undefined && { cookie }) },
    });
  const post = (url: string, payload: object) =>
    server.inject({
      method: 'POST',
      url,
      payload,
      headers: { cookie: ownerCookie, origin: DASHBOARD_ORIGIN },
    });

  async function openDraft(conversationId: ConversationId): Promise<string> {
    const detail = ConversationDetailSchema.parse(
      (await call(`/v1/conversations/${conversationId}?creatorId=${creatorId}`, ownerCookie)).json(),
    );
    const draft = detail.openDrafts[0];
    if (draft === undefined) throw new Error('no open draft');
    return draft.id;
  }

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    const config = testConfig({ DATABASE_URL: test.appUrl, DATABASE_ADMIN_URL: test.adminUrl });
    app = await createApp(config, createLogger(config), { composer: versionedComposer });
    server = await buildServer({
      config,
      logger: createLogger(config),
      routes: app.routes,
      readiness: app.readiness,
    });

    creatorId = newId(CreatorIdSchema);
    platformAccountId = newId(PlatformAccountIdSchema);
    await test.admin.db
      .insert(schema.creators)
      .values({ id: creatorId, displayName: 'Lina', timezone: 'America/Montreal' });
    await test.admin.db.insert(schema.platformAccounts).values({
      id: platformAccountId,
      creatorId,
      platform: 'reveal',
      handle: 'test-dashboard',
      sessionState: 'valid',
      lastPollAt: new Date(),
    });
    for (const name of ['Julien', 'Marc', 'Leo']) {
      const { conversationId } = await app.modules.conversations.ingestMessage({
        creatorId,
        platformAccountId,
        platformConversationId: `c-${name}`,
        platformFanId: `f-${name}`,
        fanDisplayName: name,
        message: {
          ref: { platform: 'reveal', id: `m-${name}` },
          conversationRef: { platform: 'reveal', id: `c-${name}` },
          direction: 'inbound',
          text: `Salut, c'est ${name}`,
          media: [],
          priceMinor: null,
          currency: null,
          isPaid: false,
          createdAt: new Date().toISOString(),
        },
        correlationId: 'seed',
      });
      await app.modules.conversations.jobs.respond(
        { creatorId, conversationId, correlationId: 'seed' },
        NO_LOG,
      );
      conversations.set(name, conversationId);
    }

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
    const herself = { email: 'creator@example.test', name: 'Lina', password: 'correct horse battery' };
    const { userId: herId } = await createOwner(app.auth, app.db.db, herself);
    await test.admin.db
      .update(schema.user)
      .set({ role: 'creator', creatorIds: [creatorId] })
      .where(eq(schema.user.id, herId));
    creatorCookie = await signIn(server, herself.email, herself.password);

    // Julien's draft goes out as written, Marc's after an edit: one of two without a change.
    const julien = conversations.get('Julien')!;
    const marc = conversations.get('Marc')!;
    const leo = conversations.get('Leo')!;
    const base = (id: ConversationId, draftId: string) => `/v1/conversations/${id}/drafts/${draftId}`;
    expect(
      (await post(`${base(julien, await openDraft(julien))}/approve?creatorId=${creatorId}`, {})).statusCode,
    ).toBe(204);
    expect(
      (
        await post(`${base(marc, await openDraft(marc))}/approve?creatorId=${creatorId}`, {
          bubbles: ['Coucou Marc'],
        })
      ).statusCode,
    ).toBe(204);

    // Leo may be a minor: the agent handed him over.
    expect((await post(`/v1/conversations/${leo}/takeover?creatorId=${creatorId}`, {})).statusCode).toBe(204);
    await test.admin.db.execute(sql`
      insert into conversation_events (id, creator_id, conversation_id, seq, type, payload, actor, correlation_id)
      select ${newId(EventIdSchema)}::uuid, ${creatorId}::uuid, ${leo}::uuid, max(seq) + 1, 'handoff_requested',
             ${JSON.stringify({ conversationId: leo, cause: 'minor' })}::jsonb, 'ai', 'seed'
      from conversation_events where conversation_id = ${leo}::uuid`);

    // Julien unlocked a paid message the agent sent.
    await test.admin.db.insert(schema.messages).values({
      id: newId(MessageIdSchema),
      creatorId,
      platformAccountId,
      conversationId: julien,
      platformMessageId: 'paid-1',
      direction: 'outbound',
      author: 'ai',
      text: 'Pour toi',
      priceMinor: 2_500,
      currency: 'EUR',
      isPaid: true,
      platformCreatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await server.close();
    await app.shutdown();
    await test.close();
  });

  it('asks for a session and for a creator of your own', async () => {
    expect((await call(`/v1/dashboard?creatorId=${creatorId}`)).statusCode).toBe(401);
    const forbidden = await call(`/v1/dashboard?creatorId=${creatorId}`, operatorCookie);
    expect(forbidden.statusCode).toBe(403);
    expect((await call(`/v1/dashboard?creatorId=${newId(CreatorIdSchema)}`, ownerCookie)).statusCode).toBe(
      404,
    );
  });

  it('counts the jobs the worker gave up on or has no task for, hers and those of no creator only', async () => {
    const dead = async () => {
      const response = await call(`/v1/dashboard?creatorId=${creatorId}&period=week`, ownerCookie);
      return DashboardSchema.parse(response.json()).jobs.dead;
    };
    const before = (await dead()) ?? 0;
    for (const payload of [{ creatorId }, { creatorId: '0190a000-0000-7000-8000-000000000000' }, {}]) {
      await test.admin.db.execute(sql`
        select graphile_worker.add_job('conversation.respond', ${JSON.stringify(payload)}::json,
          max_attempts => 1, run_at => now() + interval '1 day')`);
      await test.admin.db.execute(sql`
        update graphile_worker._private_jobs set attempts = max_attempts, last_error = 'test'
        where id = (select max(id) from graphile_worker._private_jobs)`);
    }
    expect(await dead()).toBe(before + 2);

    // No worker task takes `fans.refresh_summary` yet: due for an hour, it never spends an attempt.
    for (const [task, runAt] of [
      ['fans.refresh_summary', sql`now() - interval '1 hour'`],
      ['fans.refresh_summary', sql`now()`],
      ['conversation.respond', sql`now() - interval '1 hour'`],
    ] as const) {
      await test.admin.db.execute(sql`
        select graphile_worker.add_job(${task}, ${JSON.stringify({ creatorId })}::json, run_at => ${runAt})`);
    }
    expect(await dead()).toBe(before + 3);
  });

  it('computes the dashboard of one creator from her conversations', async () => {
    const response = await call(`/v1/dashboard?creatorId=${creatorId}&period=week`, ownerCookie);
    expect(response.statusCode, response.body).toBe(200);
    const dashboard = DashboardSchema.parse(response.json());

    expect(dashboard.creator).toMatchObject({ name: 'Lina', timezone: 'America/Montreal' });
    expect(dashboard.period).toBe('week');
    expect(dashboard.mode).toBe('copilot');
    expect(dashboard.globalStop).toBe(false);
    // No key in the environment nor in Services: the screen says « Clé manquante », not a breakdown.
    expect(dashboard.voice).toMatchObject({ ok: false, keyMissing: true });
    expect(dashboard.liveRate).toEqual({ rate: 50, target: 80, decided: 2, threeWeeksAgo: null });
    expect(dashboard.automatic).toEqual({
      open: false,
      missing: [
        { kind: 'live_rate', value: 50, target: 80 },
        { kind: 'decided_drafts', value: 2, target: 100 },
        { kind: 'blind_test' },
      ],
    });
    expect(dashboard.reveal).toMatchObject({ connected: true, conversations: 3 });
    expect(dashboard.guards.today.minor).toBe(1);
    expect(dashboard.budget).toMatchObject({ cap: 20, alertAt: 16, costPerEuroSold: null });
    expect(dashboard.todos.map((t) => [t.title, t.kind, t.tone])).toEqual([['Leo', 'minor', 'bad']]);
    expect(dashboard.fans.map((f) => [f.name, f.spent, f.byAgent])).toEqual([['Julien', 25, 25]]);
  });

  it('shows a creator her aggregates, never a conversation nor a fan', async () => {
    const response = await call(`/v1/dashboard?creatorId=${creatorId}&period=week`, creatorCookie);
    expect(response.statusCode, response.body).toBe(200);
    const dashboard = DashboardSchema.parse(response.json());
    expect(dashboard.todos).toEqual([]);
    expect(dashboard.fans).toEqual([]);
    expect(response.body).not.toContain('Leo');
    expect(response.body).not.toContain('Julien');
    expect(dashboard.reveal).toMatchObject({ connected: true, conversations: 3 });
    expect(dashboard.guards.today.minor).toBe(1);
    expect(dashboard.budget.spentToday).toBeNull();
    expect(dashboard.jobs.dead).toBeNull();
  });

  it('asks a human to look at a send that failed for good', async () => {
    // Marc's approved draft could not leave: the conversation stops in `error` and nothing retries it.
    const marc = conversations.get('Marc')!;
    await test.admin.db.execute(sql`
      insert into conversation_events (id, creator_id, conversation_id, seq, type, payload, actor, correlation_id)
      select ${newId(EventIdSchema)}::uuid, ${creatorId}::uuid, ${marc}::uuid, max(seq) + 1, 'send_failed',
             ${JSON.stringify({ draftId: newId(DraftIdSchema), idempotencyKey: 'seed', attempt: 1, isFinal: true })}::jsonb,
             'system', 'seed'
      from conversation_events where conversation_id = ${marc}::uuid`);
    await test.admin.db.execute(sql`update conversations set state = 'error' where id = ${marc}::uuid`);

    const dashboard = DashboardSchema.parse(
      (await call(`/v1/dashboard?creatorId=${creatorId}`, ownerCookie)).json(),
    );
    expect(dashboard.todos.map((t) => [t.title, t.kind, t.tone])).toEqual([
      ['Leo', 'minor', 'bad'],
      ['Marc', 'send_failed', 'warn'],
    ]);
  });

  it('shows a message left with nothing under way for 30 minutes, except while she is stopped or Reveal unread (P3-11)', async () => {
    const longAgo = new Date(Date.now() - 40 * 60_000);
    const seed = async (name: string, at: Date): Promise<ConversationId> => {
      const { conversationId } = await app.modules.conversations.ingestMessage({
        creatorId,
        platformAccountId,
        platformConversationId: `c-${name}`,
        platformFanId: `f-${name}`,
        fanDisplayName: name,
        message: {
          ref: { platform: 'reveal', id: `m-${name}` },
          conversationRef: { platform: 'reveal', id: `c-${name}` },
          direction: 'inbound',
          text: `Coucou, c'est ${name}`,
          media: [],
          priceMinor: null,
          currency: null,
          isPaid: false,
          createdAt: at.toISOString(),
        },
        correlationId: 'seed',
      });
      return conversationId;
    };
    const setState = (id: ConversationId, state: string, at: Date, lastOutboundAt: Date | null = null) =>
      test.admin.db.execute(sql`
        update conversations set state = ${state}, last_inbound_at = ${at.toISOString()}::timestamptz,
               last_outbound_at = ${lastOutboundAt?.toISOString() ?? null}::timestamptz
        where id = ${id}::uuid`);
    // Nico rests unanswered; Sami's respond never ended; Ines was answered; Theo just wrote.
    const later = new Date(longAgo.getTime() + 60_000);
    await setState(await seed('Nico', longAgo), 'idle', longAgo);
    await setState(await seed('Sami', later), 'pending', later);
    await setState(await seed('Ines', longAgo), 'idle', longAgo, later);
    await seed('Theo', new Date());

    const read = async () =>
      DashboardSchema.parse((await call(`/v1/dashboard?creatorId=${creatorId}`, ownerCookie)).json()).todos;
    const todos = await read();
    expect(todos.map((t) => [t.title, t.kind, t.tone])).toEqual([
      ['Leo', 'minor', 'bad'],
      ['Nico', 'unanswered', 'warn'],
      ['Sami', 'unanswered', 'warn'],
      ['Marc', 'send_failed', 'warn'],
    ]);
    expect(todos[1]?.waitingMinutes).toBeGreaterThanOrEqual(39);

    // An expired Reveal session, then her kill switch, say it all: the net stays quiet, the rest still waits.
    const sessionIs = (state: 'valid' | 'expired') =>
      test.admin.db
        .update(schema.platformAccounts)
        .set({ sessionState: state })
        .where(eq(schema.platformAccounts.id, platformAccountId));
    await sessionIs('expired');
    expect((await read()).map((t) => t.kind)).toEqual(['minor', 'send_failed']);
    await sessionIs('valid');
    await test.admin.db.insert(schema.killSwitches).values({
      id: newId(KillSwitchIdSchema),
      scope: 'creator',
      scopeId: creatorId,
      creatorId,
      active: true,
      reason: 'test',
      setBy: 'test',
    });
    expect((await read()).map((t) => t.kind)).toEqual(['minor', 'send_failed']);
  });
});
