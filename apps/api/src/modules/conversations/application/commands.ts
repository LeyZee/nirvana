import {
  ConversationIdSchema,
  DomainError,
  jobKeyFor,
  MessageIdSchema,
  newId,
  queueNameFor,
  type ConversationId,
  type ConversationMode,
  type CreatorId,
  type DraftId,
  type ExternalMessage,
  type PlatformAccountId,
  type UserId,
} from '@nirvana/contracts';

import { ConversationNotFound } from '../domain/errors';
import type { Clock, Conversation, EventMeta, FanDirectory, Transaction, UnitOfWork } from '../domain/ports';
import { rebuildProjection, type ConversationProjection } from '../domain/projection';
import { debounceFor } from '../domain/rules';
import { MAX_SEND_ATTEMPTS } from '../domain/state-machine';

import { appendEvent, lockDraftFor, setDraftStatus } from './journal';

interface IngestMessage {
  readonly creatorId: CreatorId;
  readonly platformAccountId: PlatformAccountId;
  /** The platform's ids for the conversation and its fan, opaque to the core. */
  readonly platformConversationId: string;
  readonly platformFanId: string;
  readonly fanDisplayName: string;
  readonly message: ExternalMessage;
  readonly correlationId: string;
}

interface IngestResult {
  readonly conversationId: ConversationId;
  /** `false` when the platform message was already known: nothing was written. */
  readonly isNew: boolean;
}

/** Who acts and in which conversation, for every dashboard command. */
interface ConversationCommand {
  readonly creatorId: CreatorId;
  readonly conversationId: ConversationId;
  readonly userId: UserId;
  readonly correlationId: string;
}

export interface ConversationCommands {
  ingestMessage(input: IngestMessage): Promise<IngestResult>;
  approveDraft(input: ConversationCommand & { draftId: DraftId; bubbles?: readonly string[] }): Promise<void>;
  rejectDraft(input: ConversationCommand & { draftId: DraftId; reason?: string }): Promise<void>;
  expireDraft(
    input: Omit<ConversationCommand, 'userId'> & { draftId: DraftId; reason: string },
  ): Promise<void>;
  takeover(input: ConversationCommand & { reason?: string }): Promise<void>;
  release(input: ConversationCommand): Promise<void>;
  setMode(input: ConversationCommand & { mode: ConversationMode }): Promise<void>;
  /** Recomputes the projection columns from the journal (ADR 0007) and saves them. */
  rebuildProjection(creatorId: CreatorId, conversationId: ConversationId): Promise<ConversationProjection>;
}

export interface CommandDeps {
  readonly uow: UnitOfWork;
  readonly clock: Clock;
  readonly fans: FanDirectory;
}

const NEW_FAN_MESSAGE = 'Nouveau message du fan';
const TAKEN_OVER = 'Conversation reprise par un humain';

export async function lockConversation(tx: Transaction, id: ConversationId): Promise<Conversation> {
  const conversation = await tx.conversations.lock(id);
  if (conversation === null) throw new ConversationNotFound();
  return conversation;
}

/** Expires every draft still open: they answer a conversation that has moved on. */
async function expireOpenDrafts(
  tx: Transaction,
  conversation: Conversation,
  reason: string,
  meta: EventMeta,
): Promise<Conversation> {
  let current = conversation;
  for (const draft of await tx.drafts.openFor(conversation.id)) {
    current = await appendEvent(
      tx,
      current,
      { type: 'draft_expired', payload: { draftId: draft.id, status: 'expired', reason } },
      meta,
    );
    await setDraftStatus(tx, draft, 'expired', { decidedBy: null, at: meta.at });
  }
  return current;
}

export function createConversationCommands({ uow, clock, fans }: CommandDeps): ConversationCommands {
  const humanMeta = (input: { userId: UserId; correlationId: string }): EventMeta => ({
    actor: `human:${input.userId}`,
    correlationId: input.correlationId,
    at: clock.now(),
  });

  return {
    async ingestMessage(input) {
      const at = clock.now();
      const { message } = input;
      const isInbound = message.direction === 'inbound';
      // Its own transaction, before the conversation's: idempotent, and keeps `fans` behind its index.
      const fan = await fans.upsertFanByPlatformId({
        creatorId: input.creatorId,
        platformAccountId: input.platformAccountId,
        platformFanId: input.platformFanId,
        displayName: input.fanDisplayName,
        seenAt: at,
      });
      return uow.inTenant(input.creatorId, async (tx) => {
        let conversation = await tx.conversations.lockOrCreate({
          id: newId(ConversationIdSchema),
          creatorId: input.creatorId,
          platformAccountId: input.platformAccountId,
          fanId: fan.id,
          platformConversationId: input.platformConversationId,
        });
        const messageId = newId(MessageIdSchema);
        // An outbound message we did not send ourselves was written by someone on the platform.
        const author = isInbound ? 'fan' : 'human';
        const isNew = await tx.messages.insertIfNew({
          id: messageId,
          conversationId: conversation.id,
          platformAccountId: input.platformAccountId,
          platformMessageId: message.ref.id,
          direction: message.direction,
          author,
          text: message.text,
          priceMinor: message.priceMinor,
          currency: message.currency,
          isPaid: message.isPaid,
          platformCreatedAt: new Date(message.createdAt),
          draftId: null,
        });
        if (!isNew) return { conversationId: conversation.id, isNew: false };

        const meta: EventMeta = {
          actor: isInbound ? 'fan' : 'system',
          correlationId: input.correlationId,
          at,
        };
        conversation = await appendEvent(
          tx,
          conversation,
          {
            type: 'message_received',
            payload: {
              messageId,
              platformMessageId: message.ref.id,
              direction: message.direction,
              author,
              // Media are matched to `media_assets` by the media module (P3-04).
              mediaIds: [],
            },
          },
          meta,
        );
        if (isInbound) {
          conversation = await expireOpenDrafts(tx, conversation, NEW_FAN_MESSAGE, {
            ...meta,
            actor: 'system',
          });
          if (conversation.state === 'pending') {
            // Debounce: each new message replaces the pending job, so a burst gets one answer (ADR 0006).
            await tx.jobs.enqueue(
              'conversation.respond',
              {
                creatorId: input.creatorId,
                conversationId: conversation.id,
                correlationId: input.correlationId,
              },
              {
                queueName: queueNameFor(conversation.id),
                jobKey: jobKeyFor('conversation.respond', conversation.id),
                runAt: new Date(at.getTime() + debounceFor() * 1_000),
              },
            );
          }
        }
        return { conversationId: conversation.id, isNew: true };
      });
    },

    approveDraft(input) {
      return uow.inTenant(input.creatorId, async (tx) => {
        const conversation = await lockConversation(tx, input.conversationId);
        const isEdited = input.bubbles !== undefined;
        const status = isEdited ? 'edited' : 'approved';
        const draft = await lockDraftFor(tx, conversation, input.draftId, status);
        const bubbles = input.bubbles ?? draft.bubbles;
        if (bubbles.length === 0 || bubbles.some((bubble) => bubble.trim() === '')) {
          throw new DomainError('draft_invalid', 'Le brouillon est vide');
        }
        const meta = humanMeta(input);
        await appendEvent(
          tx,
          conversation,
          {
            type: isEdited ? 'draft_edited' : 'draft_approved',
            payload: {
              draftId: draft.id,
              status,
              decidedBy: input.userId,
              ...(isEdited ? { editedBubbles: [...bubbles] } : {}),
            },
          },
          meta,
        );
        await setDraftStatus(tx, draft, status, {
          decidedBy: meta.actor,
          at: meta.at,
          ...(isEdited ? { finalBubbles: bubbles } : {}),
        });
        await tx.jobs.enqueue(
          'conversation.send',
          {
            creatorId: input.creatorId,
            conversationId: conversation.id,
            draftId: draft.id,
            correlationId: input.correlationId,
          },
          { queueName: queueNameFor(conversation.id), maxAttempts: MAX_SEND_ATTEMPTS },
        );
      });
    },

    rejectDraft(input) {
      return uow.inTenant(input.creatorId, async (tx) => {
        const conversation = await lockConversation(tx, input.conversationId);
        const draft = await lockDraftFor(tx, conversation, input.draftId, 'rejected');
        const meta = humanMeta(input);
        await appendEvent(
          tx,
          conversation,
          {
            type: 'draft_rejected',
            payload: {
              draftId: draft.id,
              status: 'rejected',
              decidedBy: input.userId,
              ...(input.reason === undefined ? {} : { reason: input.reason }),
            },
          },
          meta,
        );
        await setDraftStatus(tx, draft, 'rejected', { decidedBy: meta.actor, at: meta.at });
      });
    },

    expireDraft(input) {
      return uow.inTenant(input.creatorId, async (tx) => {
        const conversation = await lockConversation(tx, input.conversationId);
        const draft = await lockDraftFor(tx, conversation, input.draftId, 'expired');
        const meta: EventMeta = { actor: 'system', correlationId: input.correlationId, at: clock.now() };
        await appendEvent(
          tx,
          conversation,
          { type: 'draft_expired', payload: { draftId: draft.id, status: 'expired', reason: input.reason } },
          meta,
        );
        await setDraftStatus(tx, draft, 'expired', { decidedBy: null, at: meta.at });
      });
    },

    takeover(input) {
      return uow.inTenant(input.creatorId, async (tx) => {
        const meta = humanMeta(input);
        let conversation = await lockConversation(tx, input.conversationId);
        // Before the state changes: a draft is expired from the state it was written for.
        conversation = await expireOpenDrafts(tx, conversation, TAKEN_OVER, { ...meta, actor: 'system' });
        await appendEvent(
          tx,
          conversation,
          {
            type: 'takeover_started',
            payload: {
              userId: input.userId,
              ...(input.reason === undefined ? {} : { reason: input.reason }),
            },
          },
          meta,
        );
        await tx.audit.record({
          userId: input.userId,
          action: 'conversation.takeover',
          entityId: conversation.id,
          details: { correlationId: input.correlationId },
        });
      });
    },

    release(input) {
      return uow.inTenant(input.creatorId, async (tx) => {
        const conversation = await lockConversation(tx, input.conversationId);
        await appendEvent(
          tx,
          conversation,
          { type: 'takeover_ended', payload: { userId: input.userId } },
          humanMeta(input),
        );
        await tx.audit.record({
          userId: input.userId,
          action: 'conversation.release',
          entityId: conversation.id,
          details: { correlationId: input.correlationId },
        });
      });
    },

    setMode(input) {
      return uow.inTenant(input.creatorId, async (tx) => {
        const conversation = await lockConversation(tx, input.conversationId);
        if (conversation.mode === input.mode) return;
        await appendEvent(
          tx,
          conversation,
          { type: 'mode_changed', payload: { userId: input.userId, mode: input.mode } },
          humanMeta(input),
        );
      });
    },

    rebuildProjection(creatorId, conversationId) {
      return uow.inTenant(creatorId, async (tx) => {
        await lockConversation(tx, conversationId);
        const projection = rebuildProjection(await tx.events.list(conversationId));
        await tx.conversations.saveProjection(conversationId, projection);
        return projection;
      });
    },
  };
}
