import type { ConversationState, DraftStatus } from '@nirvana/contracts';

/** Default wait after the last fan message before answering, so that three messages get one answer. */
export const DEFAULT_DEBOUNCE_SECONDS = 45;
const MIN_DEBOUNCE_SECONDS = 30;
const MAX_DEBOUNCE_SECONDS = 90;

/** The persona may set its own pace; it stays within the bounds message-flow.md §1 gives. */
export function debounceFor(persona?: { readonly debounceSeconds?: number }): number {
  const wanted = persona?.debounceSeconds ?? DEFAULT_DEBOUNCE_SECONDS;
  return Math.min(MAX_DEBOUNCE_SECONDS, Math.max(MIN_DEBOUNCE_SECONDS, wanted));
}

export interface SendCheck {
  readonly draftStatus: DraftStatus;
  readonly draftCreatedAt: Date;
  readonly conversationState: ConversationState;
  /** The latest fan message, if any. */
  readonly lastInboundAt: Date | null;
}

/**
 * Invariant 3 of message-flow.md §8: a draft leaves only if it was approved, the conversation is sending it, and
 * no fan message arrived after it was written (the answer would ignore it).
 */
export function canSend(check: SendCheck): boolean {
  const isApproved = check.draftStatus === 'approved' || check.draftStatus === 'edited';
  const isStale = check.lastInboundAt !== null && check.lastInboundAt > check.draftCreatedAt;
  return isApproved && check.conversationState === 'sending' && !isStale;
}

/** One key per bubble, so a retried send never posts the same bubble twice (invariant 4). */
export function bubbleIdempotencyKey(draftId: string, index: number): string {
  return `${draftId}:${String(index)}`;
}
