import {
  ConversationDetailSchema,
  CreatorIdSchema,
  MessageViewSchema,
  newId,
  pageOf,
  ConversationSummarySchema,
  PlatformAccountIdSchema,
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

  it('approves an edited draft once; a second decision on it is a conflict', async () => {
    const id = conversationIds[0]!;
    const detail = ConversationDetailSchema.parse(
      (await call('GET', `/v1/conversations/${id}?creatorId=${creatorId}`, ownerCookie)).json(),
    );
    const draftId = detail.openDrafts[0]!.id;
    const base = `/v1/conversations/${id}/drafts/${draftId}`;

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
