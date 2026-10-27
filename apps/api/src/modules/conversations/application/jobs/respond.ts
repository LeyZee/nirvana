import {
  DESIRE_SIGNALS_MAX,
  DraftIdSchema,
  jobKeyFor,
  newId,
  queueNameFor,
  type HandoffCause,
  type JobPayload,
} from '@nirvana/contracts';

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
import { deferredRespondAt } from '../../domain/rules';
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

/** The reason of the handoff when the second pass after a wait wrote nothing. */
const WAITED_NO_REPLY = 'waited_no_reply';

const EMPTY_DRAFT: ComposeResult = { kind: 'draft', bubbles: [], softViolations: [], costUsd: 0 };

/** One line of her notes about the fan; a chatter's note reads as such, its dated key says nothing to the engine. */
export const noteLine = (fact: {
  readonly category: string;
  readonly key: string;
  readonly value: string;
}): string => (fact.category === 'operator_note' ? `Note : ${fact.value}` : `${fact.key} : ${fact.value}`);

const lastInboundKey = (conversation: Conversation): number => conversation.lastInboundAt?.getTime() ?? 0;

/** Longest signal name kept in `desire_scored`. */
const DESIRE_SIGNAL_MAX_LENGTH = 64;

/**
 * Journals the engine's desire score with the result it came with (P3-12), only when it moved: an unchanged score
 * writes nothing, not even its time, so that the projection is the last `desire_scored` and a rebuild finds it exactly.
 */
async function recordDesire(
  tx: Transaction,
  conversation: Conversation,
  result: ComposeResult,
  meta: EventMeta,
): Promise<Conversation> {
  const desire = result.desire;
  if (desire === undefined || desire.score === conversation.desireScore) return conversation;
  return appendEvent(
    tx,
    conversation,
    {
      type: 'desire_scored',
      payload: {
        before: conversation.desireScore,
        score: desire.score,
        signals: desire.signals
          .slice(0, DESIRE_SIGNALS_MAX)
          .map((signal) => signal.slice(0, DESIRE_SIGNAL_MAX_LENGTH)),
        weightsVersion: desire.weightsVersion,
      },
    },
    meta,
  );
}

/** Why the second pass after a wait has nothing to do: he wrote since (another job answers), or she did. */
function waitedOver(conversation: Conversation, waitedFor: Date): string | null {
  if (conversation.state !== 'idle') return `state ${conversation.state}`;
  if (conversation.lastInboundAt?.getTime() !== waitedFor.getTime()) return 'fan_wrote';
  const answered = conversation.lastOutboundAt;
  return answered !== null && answered.getTime() >= waitedFor.getTime() ? 'answered' : null;
}

/**
 * The conversation still waits for this answer: same state, no fan message since, nothing blocking. The second pass
 * after a wait (P3-11) finds it at rest, his message still the last one and still unanswered.
 */
async function stillPending(
  tx: Transaction,
  conversation: Conversation | null,
  logger: JobLogger,
  waitedFor: Date | null = null,
) {
  if (conversation === null) {
    logger.warn({}, 'respond: conversation not found');
    return false;
  }
  if (waitedFor !== null) {
    const over = waitedOver(conversation, waitedFor);
    if (over !== null) {
      logger.info({ over }, 'respond: the wait is over');
      return false;
    }
  } else if (conversation.state !== 'pending') {
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
    const waitedFor = payload.waitedFor === undefined ? null : new Date(payload.waitedFor);
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
      if (conversation === null || !(await stillPending(tx, conversation, logger, waitedFor))) return null;
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
      ...(waitedFor !== null && { waited: 1 }),
      ...(read.conversation.desireScore !== null &&
        read.conversation.desireAt !== null && {
          desire: { score: read.conversation.desireScore, at: read.conversation.desireAt },
        }),
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
      const locked = await tx.conversations.lock(payload.conversationId);
      if (locked === null || !(await stillPending(tx, locked, logger, waitedFor))) return;
      if (lastInboundKey(locked) !== read.lastInbound) {
        logger.info({ draftId }, 'respond: fan wrote again, result dropped');
        return;
      }
      const meta: EventMeta = { actor: 'ai', correlationId: payload.correlationId, at: clock.now() };
      const conversation = await recordDesire(tx, locked, result, meta);
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
      // After a wait, nothing written is nothing to wait for any more: a human answers him (P3-11).
      if (HANDOFF_REASONS.includes(result.reason) || waitedFor !== null) {
        const held = waitedFor !== null && !HANDOFF_REASONS.includes(result.reason);
        const reason = [held ? WAITED_NO_REPLY : result.reason, ...result.detail].join(' : ').slice(0, 500);
        const cause = result.cause ?? DEFAULT_CAUSES[result.reason] ?? 'other';
        await appendEvent(
          tx,
          conversation,
          { type: 'handoff_requested', payload: { conversationId: conversation.id, cause, reason } },
          meta,
        );
      } else {
        // She chose to wait (« attends, je reviens »): her answer is tried once more, unless he writes first.
        const retryAt =
          conversation.lastInboundAt === null ? null : deferredRespondAt(result.retryAt, meta.at);
        await appendEvent(
          tx,
          conversation,
          {
            type: 'reply_skipped',
            payload: {
              reason: 'no_reply',
              detail: result.detail.map((line) => line.slice(0, 500)).slice(0, 20),
              ...(retryAt !== null && { retryAt: retryAt.toISOString() }),
            },
          },
          meta,
        );
        if (retryAt !== null && conversation.lastInboundAt !== null) {
          await tx.jobs.enqueue(
            'conversation.respond',
            {
              creatorId: conversation.creatorId,
              conversationId: conversation.id,
              correlationId: payload.correlationId,
              waitedFor: conversation.lastInboundAt.toISOString(),
            },
            {
              queueName: queueNameFor(conversation.id),
              // His next message replaces it: the debounce answers that one instead.
              jobKey: jobKeyFor('conversation.respond', conversation.id),
              runAt: retryAt,
            },
          );
        }
      }
      logger.info({ reason: result.reason, costUsd: result.costUsd }, 'respond: held');
    });
  };
}
