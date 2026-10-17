import { checkVoiceOutput, type GuardCode, type GuardSettings } from '../domain/guards';

/**
 * The hard guards on bubbles a chatter rewrote before approving (revue 09, G5): the same blocking reading as the
 * voice's output, bubble by bubble and as one unmasked message. Soft guards (length, count, tics) are the
 * chatter's call. Matched by shape by the `BubbleGuard` port of `conversations` (approval answers 422).
 */
export interface AgentBubbleGuard {
  check(bubbles: readonly string[]): { readonly isBlocked: boolean; readonly codes: readonly GuardCode[] };
}

export function createBubbleGuard(settings: GuardSettings): AgentBubbleGuard {
  return {
    check(bubbles) {
      const codes = checkVoiceOutput(bubbles, settings)
        .filter((v) => v.severity === 'blocking')
        .map((v) => v.code);
      return { isBlocked: codes.length > 0, codes: [...new Set(codes)] };
    },
  };
}
