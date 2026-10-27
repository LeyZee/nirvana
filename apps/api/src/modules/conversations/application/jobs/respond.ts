import { DraftIdSchema, newId, type HandoffCause, type JobPayload } from '@nirvana/contracts';

import type {
  Clock,
  ComposeInput,
  ComposeResult,
  Conversation,
  DraftComposer,
  DraftVoice,
  EventMeta,
  FanDirectory,
  HoldReason,
  JobLogger,
  Transaction,
  UnitOfWork,
} from '../../domain/ports';
import { closeAutomaticIfLocked } from '../automatic';
import { readProposedFacts } from '../facts';
import { appendEvent } from '../journal';

export interface RespondDeps {
  readonly uow: UnitOfWork;
  readonly clock: Clock;
  /** The voice version the server writes with now: an answer in automatic needs its lock open (ADR 0019). */
  readonly voice: DraftVoice;
  /** Her facts about the fan, read for the engine (P3-02). */
  readonly fans: Pick<FanDirectory, 'activeFacts'>;
  /** The engine; without it the draft stays empty and the operator writes it (P0-05 behaviour). */
  readonly composer?: DraftComposer;
}

/** Messages the engine reads. */
export const HISTORY_LIMIT = 40;

/** Holds that give the conversation to the chatters; the others put it back to `idle`. */
const HANDOFF_REASONS: readonly HoldReason[] = [
  'guard_blocked',
  'handoff',
  'budget_reached',
  'llm_unavailable',
];

/** The cause a hold implies when the engine gives none: alerts rank on it. */
export const DEFAULT_CAUSES: Partial<Record<HoldReason, HandoffCause>> = {
  guard_blocked: 'guard',
  budget_reached: 'budget',
  llm_unavailable: 'llm_unavailable',
};

const EMPTY_DRAFT: ComposeResult = { kind: 'draft', bubbles: [], softViolations: [], costUsd: 0 };

/** One line of her notes about the fan; a chatter's note reads as such, its dated key says nothing to the engine. */
export const noteLine = (fact: {
  readonly category: string;
  readonly key: string;
  readonly value: string;
}): string => (fact.category === 'operator_note' ? `Note : ${fact.value}` : `${fact.key} : ${fact.value}`);

const lastInboundKey = (conversation: Conversation): number => conversation.lastInboundAt?.getTime() ?? 0;

/** The conversation still waits for this answer: same state, no fan message since, nothing blocking. */
async function stillPending(tx: Transaction, conversation: Conversation | null, logger: JobLogger) {
  if (conversation === null) {
    logger.warn({}, 'respond: conversation not found');
    return false;
  }
  if (conversation.state !== 'pending') {
    logger.info({ state: conversation.state }, 'respond: nothing to answer');
    return false;
  }
  const blocked = await tx.gate.blockedReason(conversation);
  if (blocked !== null) {
    logger.info({ blocked }, 'respond: blocked');
    return false;
  }
  return true;
}

/**
 * `conversation.respond`, after the debounce (message-flow.md §1). Three steps, so that no lock is held while the
 * engine thinks (seconds): read the gates and the context; compose outside any transaction; re-lock and write,
 * unless the fan wrote again meanwhile (the next debounce answers) or a gate closed. Never sends anything: the
 * draft waits for an operator (copilot). Replayed after a crash, it finds the conversation past `pending`.
 */
export function createRespondJob({ uow, clock, voice, fans, composer }: RespondDeps) {
  return async (payload: JobPayload<'conversation.respond'>, logger: JobLogger): Promise<void> => {
    // Before the engine: if the lock closed (the live rate fell, the voice changed), automatic is over for her.
    const closed = await closeAutomaticIfLocked(uow, payload.creatorId, voice, {
      actor: 'system',
      correlationId: payload.correlationId,
      at: clock.now(),
    });
    if (closed) logger.info({}, 'respond: Automatique closed, back to the copilot');
    const draftId = newId(DraftIdSchema);
    const read = await uow.inTenant(payload.creatorId, async (tx) => {
      const conversation = await tx.conversations.lock(payload.conversationId);
      if (conversation === null || !(await stillPending(tx, conversation, logger))) return null;
      return {
        conversation,
        history: await tx.messages.history(conversation.id, HISTORY_LIMIT),
        stats: await tx.messages.fanStats(conversation.fanId),
        lastInbound: lastInboundKey(conversation),
      };
    });
    if (read === null) return;
    // Her facts come from the `fans` module, which reads them in its own transaction: outside the lock above.
    const notes = await fans.activeFacts(read.conversation.creatorId, read.conversation.fanId);
    const now = clock.now();
    const input: ComposeInput = {
      creatorId: read.conversation.creatorId,
      conversationId: read.conversation.id,
      fanId: read.conversation.fanId,
      draftId,
      correlationId: payload.correlationId,
      now,
      platformAccountId: read.conversation.platformAccountId,
      platformConversationId: read.conversation.platformConversationId,
      history: read.history,
      fan: { ...read.stats, notes: notes.map(noteLine) },
    };
    const source = read.history.findLast((message) => message.author === 'fan') ?? null;

    let result: ComposeResult;
    try {
      result = composer === undefined ? EMPTY_DRAFT : await composer.compose(input);
    } catch (error) {
      // The engine is expected to answer `held`; anything thrown counts as no model reachable.
      logger.warn({ err: error instanceof Error ? error.name : 'unknown' }, 'respond: composer failed');
      result = { kind: 'held', reason: 'llm_unavailable', detail: [], costUsd: 0 };
    }

    await uow.inTenant(payload.creatorId, async (tx) => {
      const conversation = await tx.conversations.lock(payload.conversationId);
      if (conversation === null || !(await stillPending(tx, conversation, logger))) return;
      if (lastInboundKey(conversation) !== read.lastInbound) {
        logger.info({ draftId }, 'respond: fan wrote again, result dropped');
        return;
      }
      const meta: EventMeta = { actor: 'ai', correlationId: payload.correlationId, at: clock.now() };
      if (result.kind === 'draft') {
        await tx.drafts.insert({
          id: draftId,
          conversationId: conversation.id,
          // One draft per fan message answered: a replay with the same last message cannot write a second one.
          idempotencyKey: `respond:${conversation.id}:${String(read.lastInbound)}`,
          createdAt: meta.at,
          bubbles: result.bubbles,
          softViolations: result.softViolations,
          ...(result.voice !== undefined && { voice: result.voice }),
          facts: readProposedFacts(result.factsProposed ?? [], source, now),
        });
        await appendEvent(
          tx,
          conversation,
          { type: 'draft_created', payload: { draftId, status: 'pending' } },
          meta,
        );
        logger.info(
          { draftId, bubbles: result.bubbles.length, costUsd: result.costUsd, mode: conversation.mode },
          'respond: draft created',
        );
        return;
      }
      if (HANDOFF_REASONS.includes(result.reason)) {
        const reason = [result.reason, ...result.detail].join(' : ').slice(0, 500);
        const cause = result.cause ?? DEFAULT_CAUSES[result.reason] ?? 'other';
        await appendEvent(
          tx,
          conversation,
          { type: 'handoff_requested', payload: { conversationId: conversation.id, cause, reason } },
          meta,
        );
      } else {
        await appendEvent(
          tx,
          conversation,
          {
            type: 'reply_skipped',
            payload: {
              reason: 'no_reply',
              detail: result.detail.map((line) => line.slice(0, 500)).slice(0, 20),
            },
          },
          meta,
        );
      }
      logger.info({ reason: result.reason, costUsd: result.costUsd }, 'respond: held');
    });
  };
}
