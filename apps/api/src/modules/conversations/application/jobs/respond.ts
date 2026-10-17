import { DraftIdSchema, newId, type JobPayload } from '@nirvana/contracts';

import type { Clock, EventMeta, JobLogger, UnitOfWork } from '../../domain/ports';
import { appendEvent } from '../journal';

export interface RespondDeps {
  readonly uow: UnitOfWork;
  readonly clock: Clock;
}

/**
 * `conversation.respond`, after the debounce (message-flow.md §1). Re-reads the entry gates, then writes a draft.
 * The draft is empty until the engine arrives (P3); `supervision` is told through the outbox (`draft_created`).
 * Replayed after a crash, it finds the conversation already past `pending` and does nothing.
 */
export function createRespondJob({ uow, clock }: RespondDeps) {
  return (payload: JobPayload<'conversation.respond'>, logger: JobLogger): Promise<void> =>
    uow.inTenant(payload.creatorId, async (tx) => {
      const conversation = await tx.conversations.lock(payload.conversationId);
      if (conversation === null) {
        logger.warn({ conversationId: payload.conversationId }, 'respond: conversation not found');
        return;
      }
      if (conversation.state !== 'pending') {
        logger.info({ state: conversation.state }, 'respond: nothing to answer');
        return;
      }
      const blocked = await tx.gate.blockedReason(conversation);
      if (blocked !== null) {
        logger.info({ blocked }, 'respond: blocked');
        return;
      }
      const draftId = newId(DraftIdSchema);
      const meta: EventMeta = { actor: 'ai', correlationId: payload.correlationId, at: clock.now() };
      await tx.drafts.insert({
        id: draftId,
        conversationId: conversation.id,
        // One draft per fan message answered: a replay with the same last message cannot write a second one.
        idempotencyKey: `respond:${conversation.id}:${String(conversation.lastInboundAt?.getTime() ?? 0)}`,
        createdAt: meta.at,
      });
      await appendEvent(
        tx,
        conversation,
        { type: 'draft_created', payload: { draftId, status: 'pending' } },
        meta,
      );
      logger.info({ draftId, mode: conversation.mode }, 'respond: draft created');
    });
}
