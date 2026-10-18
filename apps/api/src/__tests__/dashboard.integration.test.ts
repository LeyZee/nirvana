import {
  ConversationDetailSchema,
  CreatorIdSchema,
  DashboardSchema,
  EventIdSchema,
  MessageIdSchema,
  newId,
  PlatformAccountIdSchema,
  type ConversationId,
  type CreatorId,
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
  let ownerCookie: string;
  let operatorCookie: string;
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
    const platformAccountId = newId(PlatformAccountIdSchema);
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

  it('computes the dashboard of one creator from her conversations', async () => {
    const response = await call(`/v1/dashboard?creatorId=${creatorId}&period=week`, ownerCookie);
    expect(response.statusCode, response.body).toBe(200);
    const dashboard = DashboardSchema.parse(response.json());

    expect(dashboard.creator).toMatchObject({ name: 'Lina', timezone: 'America/Montreal' });
    expect(dashboard.period).toBe('week');
    expect(dashboard.mode).toBe('copilot');
    expect(dashboard.liveRate).toEqual({ rate: 50, target: 80, decided: 2, threeWeeksAgo: null });
    expect(dashboard.automatic).toEqual({
      open: false,
      missing: [
        { kind: 'live_rate', value: null, target: 80 },
        { kind: 'decided_drafts', value: 0, target: 100 },
        { kind: 'blind_test' },
      ],
    });
    expect(dashboard.reveal).toMatchObject({ connected: true, conversations: 3 });
    expect(dashboard.guards.today.minor).toBe(1);
    expect(dashboard.budget).toMatchObject({ cap: 20, alertAt: 16, costPerEuroSold: null });
    expect(dashboard.todos.map((t) => [t.title, t.kind, t.tone])).toEqual([['Leo', 'minor', 'bad']]);
    expect(dashboard.fans.map((f) => [f.name, f.spent, f.byAgent])).toEqual([['Julien', 25, 25]]);
  });
});
