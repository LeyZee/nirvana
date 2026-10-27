import {
  ConversationDetailSchema,
  ConversationIdSchema,
  MeSchema,
  CreatorIdSchema,
  MessageViewSchema,
  newId,
  pageOf,
  ConversationSummarySchema,
  PlatformAccountIdSchema,
  TeamMemberIdSchema,
  type ConversationId,
  type CreatorId,
} from '@nirvana/contracts';
import { eq, schema } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createOwner } from '../auth';
import { createApp, type App } from '../composition-root';
import { createLogger } from '../logger';
import { buildServer, type Server } from '../server';

import { fixedComposer } from './support/composer';
import { testConfig } from './support/config';
import { DASHBOARD_ORIGIN, signIn } from './support/sign-in';

const NO_LOG = { info: () => undefined, warn: () => undefined };

describe('/v1/conversations', () => {
  let test: TestDb;
  let app: App;
  let server: Server;
  let ownerCookie: string;
  let operatorCookie: string;
  let creatorId: CreatorId;
  const conversationIds: ConversationId[] = [];

  async function call(method: 'GET' | 'POST', url: string, cookie: string, payload?: object) {
    return server.inject({
      method,
      url,
      headers: { cookie, origin: DASHBOARD_ORIGIN },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    const config = testConfig({ DATABASE_URL: test.appUrl, DATABASE_ADMIN_URL: test.adminUrl });
    app = await createApp(config, createLogger(config), { composer: fixedComposer });
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
      .values({ id: creatorId, displayName: 'Test', timezone: 'Europe/Paris' });
    await test.admin.db
      .insert(schema.platformAccounts)
      .values({ id: platformAccountId, creatorId, platform: 'reveal', handle: 'test-http' });
    for (const name of ['Julien', 'Marc']) {
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
      conversationIds.push(conversationId);
    }

    const owner = { email: 'owner@example.test', name: 'Owner', password: 'correct horse battery' };
    await createOwner(app.auth, app.db.db, owner);
    ownerCookie = await signIn(server, owner.email, owner.password);
    // An operator of another creator: same account flow, then the role and scope an owner would give.
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

  it('lists the conversations by cursor pages, most recent first', async () => {
    const first = await call('GET', `/v1/conversations?creatorId=${creatorId}&limit=1`, ownerCookie);
    expect(first.statusCode, first.body).toBe(200);
    const page1 = pageOf(ConversationSummarySchema).parse(first.json());
    expect(page1.items.map((item) => item.fanDisplayName)).toEqual(['Marc']);
    expect(page1.nextCursor).not.toBeNull();

    const second = await call(
      'GET',
      `/v1/conversations?creatorId=${creatorId}&limit=1&cursor=${page1.nextCursor ?? ''}`,
      ownerCookie,
    );
    const page2 = pageOf(ConversationSummarySchema).parse(second.json());
    expect(page2.items.map((item) => item.fanDisplayName)).toEqual(['Julien']);
    expect(page2.nextCursor).toBeNull();
  });

  it('shows a conversation with its open draft and its messages', async () => {
    const id = conversationIds[0]!;
    const detail = ConversationDetailSchema.parse(
      (await call('GET', `/v1/conversations/${id}?creatorId=${creatorId}`, ownerCookie)).json(),
    );
    expect(detail).toMatchObject({ state: 'awaiting_approval', unreadCount: 1, fanDisplayName: 'Julien' });
    expect(detail.openDrafts).toHaveLength(1);

    const messages = pageOf(MessageViewSchema).parse(
      (await call('GET', `/v1/conversations/${id}/messages?creatorId=${creatorId}`, ownerCookie)).json(),
    );
    expect(messages.items.map((message) => message.text)).toEqual(["Salut, c'est Julien"]);
  });

  it('refuses bubbles a hard guard blocks, then approves an edited draft once; a second decision is a conflict', async () => {
    const id = conversationIds[0]!;
    const detail = ConversationDetailSchema.parse(
      (await call('GET', `/v1/conversations/${id}?creatorId=${creatorId}`, ownerCookie)).json(),
    );
    const draftId = detail.openDrafts[0]!.id;
    const base = `/v1/conversations/${id}/drafts/${draftId}`;

    // A chatter's words pass the hard guards too (revue 09, G5), split over two bubbles or not.
    for (const bubbles of [['Je suis une IA'], ['Pour être honnête je suis une', 'IA']]) {
      const refused = await call('POST', `${base}/approve?creatorId=${creatorId}`, ownerCookie, { bubbles });
      expect(refused.statusCode, refused.body).toBe(422);
      expect(refused.json()).toMatchObject({
        error: { code: 'draft_unprocessable', details: { guards: ['ai_disclosure'] } },
      });
    }
    const [stillOpen] = await test.admin.db
      .select({ status: schema.drafts.status })
      .from(schema.drafts)
      .where(eq(schema.drafts.id, draftId));
    expect(stillOpen?.status).toBe('pending');

    const approved = await call('POST', `${base}/approve?creatorId=${creatorId}`, ownerCookie, {
      bubbles: ['Coucou Julien'],
    });
    expect(approved.statusCode, approved.body).toBe(204);
    const rejected = await call('POST', `${base}/reject?creatorId=${creatorId}`, ownerCookie, {});
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toMatchObject({ error: { code: 'draft_conflict' } });
  });

  it('takes over and releases a conversation', async () => {
    const id = conversationIds[1]!;
    const takeover = await call(
      'POST',
      `/v1/conversations/${id}/takeover?creatorId=${creatorId}`,
      ownerCookie,
      {},
    );
    expect(takeover.statusCode, takeover.body).toBe(204);
    const detail = ConversationDetailSchema.parse(
      (await call('GET', `/v1/conversations/${id}?creatorId=${creatorId}`, ownerCookie)).json(),
    );
    expect(detail).toMatchObject({ state: 'human', openDrafts: [] });
    // The outbox copy names the conversation, so a Telegram alert sent for it can be closed (ADR 0020).
    const published = await test.admin.db
      .select({ payload: schema.domainEvents.payload })
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.type, 'takeover_started'));
    expect(published.map((event) => event.payload)).toContainEqual(
      expect.objectContaining({ conversationId: id }),
    );
    const release = await call(
      'POST',
      `/v1/conversations/${id}/release?creatorId=${creatorId}`,
      ownerCookie,
      {},
    );
    expect(release.statusCode).toBe(204);
    const audit = await test.admin.db
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, id));
    expect(audit.map((entry) => entry.action)).toEqual(['conversation.takeover', 'conversation.release']);
  });

  it('keeps an operator out of a creator they do not handle', async () => {
    const response = await call('GET', `/v1/conversations?creatorId=${creatorId}`, operatorCookie);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'creator_forbidden' } });
  });

  it('lets a team chatter reach only the conversations routed to him, and a manager every one (ADR 0024)', async () => {
    const people = { chatter: 'chatter@example.test', manager: 'manager@example.test' } as const;
    const routed = conversationIds[0] ?? newId(ConversationIdSchema);
    const other = conversationIds[1] ?? newId(ConversationIdSchema);
    const cookies = { chatter: '', manager: '' };
    for (const teamRole of ['chatter', 'manager'] as const) {
      const email = people[teamRole];
      const { userId } = await createOwner(app.auth, app.db.db, {
        email,
        name: teamRole,
        password: 'correct horse battery',
      });
      await test.admin.db
        .update(schema.user)
        .set({ role: 'operator', creatorIds: [creatorId] })
        .where(eq(schema.user.id, userId));
      // Invented members (ADR 0010).
      await test.admin.db.insert(schema.teamMembers).values({
        id: newId(TeamMemberIdSchema),
        userId,
        teamRole,
        firstName: 'Prénom',
        lastName: 'Inventé',
        displayName: teamRole,
        country: 'BJ',
        timeZone: 'Africa/Porto-Novo',
        joinedOn: '2026-10-01',
      });
      if (teamRole === 'chatter') {
        await test.admin.db
          .update(schema.conversations)
          .set({ routedToUserId: userId })
          .where(eq(schema.conversations.id, routed));
      }
      cookies[teamRole] = await signIn(server, email, 'correct horse battery');
    }
    const { chatter, manager } = cookies;

    const me = MeSchema.parse((await call('GET', '/v1/me', chatter)).json());
    expect(me).toMatchObject({ creatorIds: [], routedCreatorIds: [creatorId], teamScope: 'self' });

    const list = pageOf(ConversationSummarySchema).parse(
      (await call('GET', `/v1/conversations?creatorId=${creatorId}`, chatter)).json(),
    );
    expect(list.items.map((item) => item.id)).toEqual([routed]);
    expect(
      (await call('GET', `/v1/conversations/${routed}?creatorId=${creatorId}`, chatter)).statusCode,
    ).toBe(200);
    for (const url of [
      `/v1/conversations/${other}?creatorId=${creatorId}`,
      `/v1/conversations/${other}/messages?creatorId=${creatorId}`,
      `/v1/conversations/${other}/events?creatorId=${creatorId}`,
    ]) {
      const refused = await call('GET', url, chatter);
      expect(refused.statusCode).toBe(403);
      expect(refused.json()).toMatchObject({ error: { code: 'conversation_forbidden' } });
    }
    expect(
      (await call('POST', `/v1/conversations/${other}/takeover?creatorId=${creatorId}`, chatter, {}))
        .statusCode,
    ).toBe(403);
    // The whole creator stays closed to him: her mode, her Dashboard.
    const mode = await call('POST', `/v1/conversations/${routed}/mode?creatorId=${creatorId}`, chatter, {
      mode: 'copilot',
    });
    expect(mode.json()).toMatchObject({ error: { code: 'creator_forbidden' } });
    expect((await call('GET', `/v1/dashboard?creatorId=${creatorId}&period=day`, chatter)).statusCode).toBe(
      403,
    );
    // He acts on the conversation routed to him.
    expect(
      (await call('POST', `/v1/conversations/${routed}/takeover?creatorId=${creatorId}`, chatter, {}))
        .statusCode,
    ).toBe(204);
    expect(
      (await call('POST', `/v1/conversations/${routed}/release?creatorId=${creatorId}`, chatter, {}))
        .statusCode,
    ).toBe(204);

    // « Rendre la main » ends the routing: the conversation is closed to him again.
    const after = await call('GET', `/v1/conversations/${routed}?creatorId=${creatorId}`, chatter);
    expect(after.statusCode).toBe(403);
    expect(after.json()).toMatchObject({ error: { code: 'conversation_forbidden' } });

    const all = pageOf(ConversationSummarySchema).parse(
      (await call('GET', `/v1/conversations?creatorId=${creatorId}`, manager)).json(),
    );
    expect(all.items).toHaveLength(2);
  });

  it('answers 404 for a conversation that does not exist and 400 for a bad cursor', async () => {
    const missing = await call(
      'GET',
      `/v1/conversations/${newId(CreatorIdSchema)}?creatorId=${creatorId}`,
      ownerCookie,
    );
    expect(missing.statusCode).toBe(404);
    const badCursor = await call('GET', `/v1/conversations?creatorId=${creatorId}&cursor=nope`, ownerCookie);
    expect(badCursor.statusCode).toBe(400);
  });
});
