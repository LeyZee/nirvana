import { randomUUID } from 'node:crypto';

import {
  CreatorIdSchema,
  DomainError,
  DraftIdSchema,
  JOB_PAYLOADS,
  newId,
  PlatformAccountIdSchema,
  UserIdSchema,
  type ConversationId,
  type CreatorId,
  type DraftId,
  type ExternalMessage,
  type PlatformAccountId,
  type SendResult,
} from '@nirvana/contracts';
import { eq, schema, sql } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { runOnce } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';

import { createJobQueue, defineTask, type JobQueue } from '../jobs';
import { createLogger } from '../logger';
import {
  createConversationsModule,
  type Clock,
  type ConversationsModule,
  type OutboundSender,
} from '../modules/conversations';
import { createFansModule } from '../modules/fans';

const T0 = new Date('2026-10-17T20:00:00.000Z');
const NO_LOG = { info: () => undefined, warn: () => undefined };
const USER = UserIdSchema.parse('0199f2a0-0000-7000-8000-000000000001');

/** A clock the test moves by hand. */
class TestClock implements Clock {
  current = T0;
  now(): Date {
    return this.current;
  }
  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1_000);
  }
}

/** Records every bubble; fails the next `failures` sends with an unknown outcome. */
class FakeSender implements OutboundSender {
  readonly sent: { key: string; text: string }[] = [];
  failures = 0;

  sendText(_conversation: unknown, text: string, key: string): Promise<SendResult> {
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new DomainError('connector_timeout', 'timeout'));
    }
    this.sent.push({ key, text });
    return Promise.resolve({
      messageRef: { platform: 'reveal', id: `out-${key}` },
      sentAt: new Date().toISOString(),
    });
  }
  sendMedia(): Promise<SendResult> {
    return Promise.reject(new Error('not used'));
  }
  verifySent(): Promise<{ status: 'not_found' }> {
    return Promise.resolve({ status: 'not_found' });
  }
}

const JobRowSchema = z.object({
  task_identifier: z.string(),
  run_at: z.coerce.date(),
  queue_name: z.string().nullable(),
  key: z.string().nullable(),
});

describe('conversations module (P0-05)', () => {
  let test: TestDb;
  let queue: JobQueue;
  let clock: TestClock;
  let sender: FakeSender;
  let conversations: ConversationsModule;
  let creatorId: CreatorId;
  let platformAccountId: PlatformAccountId;
  let messageCounter = 0;

  function fanMessage(
    conversation: string,
    text = 'coucou',
    id = `m-${String(++messageCounter)}`,
  ): ExternalMessage {
    return {
      ref: { platform: 'reveal', id },
      conversationRef: { platform: 'reveal', id: conversation },
      direction: 'inbound',
      text,
      media: [],
      priceMinor: null,
      currency: null,
      isPaid: false,
      createdAt: clock.now().toISOString(),
    };
  }

  function ingest(conversation: string, message = fanMessage(conversation)) {
    return conversations.ingestMessage({
      creatorId,
      platformAccountId,
      platformConversationId: conversation,
      platformFanId: `fan-${conversation}`,
      fanDisplayName: 'Julien',
      message,
      correlationId: 'test',
    });
  }

  async function respond(conversationId: ConversationId): Promise<DraftId> {
    await conversations.jobs.respond({ creatorId, conversationId, correlationId: 'test' }, NO_LOG);
    const [draft] = await test.admin.db
      .select()
      .from(schema.drafts)
      .where(eq(schema.drafts.conversationId, conversationId))
      .orderBy(sql`${schema.drafts.createdAt} desc`)
      .limit(1);
    if (draft === undefined) throw new Error('no draft');
    return DraftIdSchema.parse(draft.id);
  }

  const command = (conversationId: ConversationId) => ({
    creatorId,
    conversationId,
    userId: USER,
    correlationId: 'test',
  });

  async function events(conversationId: ConversationId): Promise<string[]> {
    const rows = await test.admin.db
      .select({ type: schema.conversationEvents.type })
      .from(schema.conversationEvents)
      .where(eq(schema.conversationEvents.conversationId, conversationId))
      .orderBy(schema.conversationEvents.seq);
    return rows.map((row) => row.type);
  }

  async function conversationRow(conversationId: ConversationId) {
    const [row] = await test.admin.db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId));
    if (row === undefined) throw new Error('no conversation');
    return row;
  }

  async function jobs(task: string) {
    const result = await test.admin.db.execute(
      sql`select task_identifier, run_at, queue_name, key from graphile_worker.jobs where task_identifier = ${task}`,
    );
    return z.array(JobRowSchema).parse(result.rows);
  }

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    // Creates Graphile's schema, which `public.enqueue_job` writes to.
    queue = await createJobQueue(test.admin.pool);
    creatorId = newId(CreatorIdSchema);
    platformAccountId = newId(PlatformAccountIdSchema);
    await test.admin.db
      .insert(schema.creators)
      .values({ id: creatorId, displayName: 'Test', timezone: 'Europe/Paris' });
    await test.admin.db
      .insert(schema.platformAccounts)
      .values({ id: platformAccountId, creatorId, platform: 'reveal', handle: 'test' });
  });

  afterAll(async () => {
    await queue.close();
    await test.close();
  });

  beforeEach(() => {
    clock = new TestClock();
    sender = new FakeSender();
    conversations = createConversationsModule({
      db: test.app.db,
      fans: createFansModule({ db: test.app.db }),
      sender,
      requireRole: () => () => Promise.resolve(),
      clock,
    });
  });

  it('ingests the same platform message once, however often it arrives', async () => {
    const message = fanMessage('c-idem');
    const results = [];
    for (let i = 0; i < 3; i += 1) results.push(await ingest('c-idem', message));
    expect(results.map((result) => result.isNew)).toEqual([true, false, false]);
    const conversationId = results[0]!.conversationId;

    const messages = await test.admin.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId));
    expect(messages).toHaveLength(1);
    expect(await events(conversationId)).toEqual(['message_received']);
    const respondJobs = (await jobs('conversation.respond')).filter((job) =>
      job.key?.endsWith(conversationId),
    );
    expect(respondJobs).toHaveLength(1);
    expect(await conversationRow(conversationId)).toMatchObject({ state: 'pending', unreadCount: 1 });
  });

  it('answers a burst of three messages once, after the last one and the debounce', async () => {
    const { conversationId } = await ingest('c-burst');
    clock.advance(10);
    await ingest('c-burst');
    clock.advance(10);
    await ingest('c-burst');

    const pending = (await jobs('conversation.respond')).filter((job) => job.key?.endsWith(conversationId));
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ queue_name: `conv:${conversationId}` });
    expect(pending[0]!.run_at.toISOString()).toBe(new Date(T0.getTime() + (20 + 45) * 1_000).toISOString());

    // Bring it forward and let Graphile run what is due: one job, one draft.
    await test.admin.db.execute(
      sql`update graphile_worker._private_jobs set run_at = now() where key = ${pending[0]!.key}`,
    );
    const logger = createLogger({ LOG_LEVEL: 'silent' });
    await runOnce({
      pgPool: test.admin.pool,
      taskList: {
        'conversation.respond': defineTask(
          'conversation.respond',
          JOB_PAYLOADS['conversation.respond'],
          logger,
          (payload) => conversations.jobs.respond(payload, NO_LOG),
        ),
      },
    });
    expect(await events(conversationId)).toEqual([
      'message_received',
      'message_received',
      'message_received',
      'draft_created',
    ]);
    expect(await conversationRow(conversationId)).toMatchObject({
      state: 'awaiting_approval',
      unreadCount: 3,
    });
  });

  it('refuses a forbidden transition without writing anything', async () => {
    const { conversationId } = await ingest('c-forbidden');
    const draftId = await respond(conversationId);
    await conversations.rejectDraft({ ...command(conversationId), draftId, reason: 'Trop direct' });
    const before = await events(conversationId);

    await expect(
      conversations.approveDraft({ ...command(conversationId), draftId, bubbles: ['Coucou'] }),
    ).rejects.toMatchObject({ code: 'draft_conflict' });
    await expect(conversations.release(command(conversationId))).rejects.toMatchObject({
      code: 'transition_conflict',
    });
    expect(await events(conversationId)).toEqual(before);
    expect(await conversationRow(conversationId)).toMatchObject({ state: 'idle' });
  });

  it('writes no state without its event: a failure later in the transaction undoes both', async () => {
    const { conversationId } = await ingest('c-atomic');
    const draftId = await respond(conversationId);
    const before = { events: await events(conversationId), row: await conversationRow(conversationId) };

    // Approving writes the event, the state and the draft, then enqueues the send: make that last step fail.
    await test.admin.db.execute(sql`revoke execute on function public.enqueue_job from nirvana_app`);
    try {
      await expect(
        conversations.approveDraft({ ...command(conversationId), draftId, bubbles: ['Coucou'] }),
      ).rejects.toThrow();
    } finally {
      await test.admin.db.execute(sql`grant execute on function public.enqueue_job to nirvana_app`);
    }

    expect(await events(conversationId)).toEqual(before.events);
    expect(await conversationRow(conversationId)).toEqual(before.row);
    const [draft] = await test.admin.db.select().from(schema.drafts).where(eq(schema.drafts.id, draftId));
    expect(draft).toMatchObject({ status: 'pending', finalBubbles: null });
  });

  it('sends approved bubbles once each, resumes after a failure, and goes back to idle', async () => {
    const { conversationId } = await ingest('c-send');
    const draftId = await respond(conversationId);
    await conversations.approveDraft({ ...command(conversationId), draftId, bubbles: ['Coucou', 'Ça va ?'] });
    expect(await conversationRow(conversationId)).toMatchObject({ state: 'sending' });

    sender.failures = 1;
    const payload = { creatorId, conversationId, draftId, correlationId: 'test' };
    await expect(conversations.jobs.send(payload, NO_LOG, 1)).rejects.toThrow('timeout');
    await conversations.jobs.send(payload, NO_LOG, 2);
    // A replay of a finished send changes nothing.
    await conversations.jobs.send(payload, NO_LOG, 3);

    expect(sender.sent.map((bubble) => bubble.text)).toEqual(['Coucou', 'Ça va ?']);
    expect(await events(conversationId)).toEqual([
      'message_received',
      'draft_created',
      'draft_edited',
      'send_attempted',
      'send_failed',
      'send_attempted',
      'message_sent',
      'send_attempted',
      'message_sent',
      'send_verified',
    ]);
    expect(await conversationRow(conversationId)).toMatchObject({ state: 'idle', unreadCount: 0 });
    const outbox = await test.admin.db.select({ type: schema.domainEvents.type }).from(schema.domainEvents);
    expect(outbox.map((row) => row.type)).toEqual(expect.arrayContaining(['draft_created', 'message_sent']));
  });

  it('expires an approved draft when the fan writes again before it leaves', async () => {
    const { conversationId } = await ingest('c-stale');
    const draftId = await respond(conversationId);
    await conversations.approveDraft({ ...command(conversationId), draftId, bubbles: ['Coucou'] });
    clock.advance(5);
    await ingest('c-stale');

    await conversations.jobs.send({ creatorId, conversationId, draftId, correlationId: 'test' }, NO_LOG, 1);
    expect(sender.sent).toEqual([]);
    expect((await events(conversationId)).slice(-2)).toEqual(['message_received', 'draft_expired']);
    expect(await conversationRow(conversationId)).toMatchObject({ state: 'pending' });
  });

  it('goes to error after the last failed attempt, and a human release brings it back', async () => {
    const { conversationId } = await ingest('c-error');
    const draftId = await respond(conversationId);
    await conversations.approveDraft({ ...command(conversationId), draftId, bubbles: ['Coucou'] });
    sender.failures = 3;
    const payload = { creatorId, conversationId, draftId, correlationId: 'test' };
    for (const attempt of [1, 2]) {
      await expect(conversations.jobs.send(payload, NO_LOG, attempt)).rejects.toThrow();
    }
    await conversations.jobs.send(payload, NO_LOG, 3);
    expect(await conversationRow(conversationId)).toMatchObject({ state: 'error' });
    await conversations.release(command(conversationId));
    expect(await conversationRow(conversationId)).toMatchObject({ state: 'idle' });
  });

  it('rebuilds the projection from a journal of 20 varied events', async () => {
    const { conversationId } = await ingest('c-rebuild');
    clock.advance(1);
    await ingest('c-rebuild');
    let draftId = await respond(conversationId);
    await conversations.rejectDraft({ ...command(conversationId), draftId, reason: 'Non' });
    clock.advance(1);
    await ingest('c-rebuild');
    draftId = await respond(conversationId);
    await conversations.approveDraft({ ...command(conversationId), draftId, bubbles: ['Un', 'Deux'] });
    await conversations.jobs.send({ creatorId, conversationId, draftId, correlationId: 'test' }, NO_LOG, 1);
    await conversations.setMode({ ...command(conversationId), mode: 'auto' });
    clock.advance(1);
    await ingest('c-rebuild');
    await conversations.takeover({ ...command(conversationId), reason: 'Je prends' });
    clock.advance(1);
    await ingest('c-rebuild');
    await conversations.release(command(conversationId));
    clock.advance(1);
    await ingest('c-rebuild');
    clock.advance(1);
    await ingest('c-rebuild');
    await respond(conversationId);

    const journal = await events(conversationId);
    expect(journal.length).toBeGreaterThanOrEqual(20);
    const projected = await conversationRow(conversationId);

    await test.admin.db.execute(sql`
      update conversations set state = 'error', mode = 'copilot', unread_count = 99,
        last_inbound_at = null, last_outbound_at = null
      where id = ${conversationId}`);
    const rebuilt = await conversations.rebuildProjection(creatorId, conversationId);

    const keys = ['state', 'mode', 'lastInboundAt', 'lastOutboundAt', 'unreadCount'] as const;
    const pick = (row: typeof projected) => Object.fromEntries(keys.map((key) => [key, row[key]]));
    expect(rebuilt).toEqual(pick(projected));
    expect(pick(await conversationRow(conversationId))).toEqual(pick(projected));
    expect(projected).toMatchObject({ state: 'awaiting_approval', mode: 'auto' });
  });

  async function killSwitch(scope: 'global' | 'creator', active: boolean) {
    await test.admin.db.insert(schema.killSwitches).values({
      id: randomUUID(),
      scope,
      scopeId: scope === 'global' ? null : creatorId,
      creatorId: scope === 'global' ? null : creatorId,
      active,
      reason: 'test',
      setBy: 'system',
    });
  }

  it('refuses an approval while a kill switch is on, and leaves the draft pending', async () => {
    const { conversationId } = await ingest('c-kill-approve');
    const draftId = await respond(conversationId);
    const queued = (await jobs('conversation.send')).length;
    await killSwitch('global', true);
    try {
      await expect(
        conversations.approveDraft({ ...command(conversationId), draftId, bubbles: ['Coucou'] }),
      ).rejects.toMatchObject({ code: 'kill_switch_conflict' });
      const [draft] = await test.admin.db.select().from(schema.drafts).where(eq(schema.drafts.id, draftId));
      expect(draft?.status).toBe('pending');
      expect(await jobs('conversation.send')).toHaveLength(queued);
    } finally {
      await test.admin.db.delete(schema.killSwitches);
    }
  });

  it('sends nothing once a kill switch is on, even for a draft approved before it, nor after it is lifted', async () => {
    const { conversationId } = await ingest('c-kill-send');
    const draftId = await respond(conversationId);
    await conversations.approveDraft({ ...command(conversationId), draftId, bubbles: ['Un', 'Deux'] });
    await killSwitch('creator', true);
    const payload = { creatorId, conversationId, draftId, correlationId: 'test' };
    try {
      await conversations.jobs.send(payload, NO_LOG, 1);
      expect(sender.sent.filter((send) => send.key.startsWith(draftId))).toEqual([]);
      expect((await events(conversationId)).at(-1)).toBe('draft_expired');
      expect(await conversationRow(conversationId)).toMatchObject({ state: 'idle' });

      await killSwitch('creator', false);
      await conversations.jobs.send(payload, NO_LOG, 2);
      expect(sender.sent.filter((send) => send.key.startsWith(draftId))).toEqual([]);
    } finally {
      await test.admin.db.delete(schema.killSwitches);
    }
  });

  it('does not answer while a kill switch is on', async () => {
    const { conversationId } = await ingest('c-kill');
    await test.admin.db.insert(schema.killSwitches).values({
      id: randomUUID(),
      scope: 'creator',
      scopeId: creatorId,
      creatorId,
      active: true,
      reason: 'test',
      setBy: 'system',
    });
    try {
      await conversations.jobs.respond({ creatorId, conversationId, correlationId: 'test' }, NO_LOG);
      expect(await events(conversationId)).toEqual(['message_received']);
    } finally {
      await test.admin.db.delete(schema.killSwitches);
    }
  });
});
