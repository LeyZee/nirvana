import type { ConversationTurn, LlmFailure, LlmGateway } from '@nirvana/llm';

import { holdDecision, type HoldDecision } from '../domain/hold';

import { composeTurn, type ComposerPersona } from './compose';

/**
 * The agent seen by `conversation.respond` (conversations' `DraftComposer` port, matched by shape: `agent` does
 * not import `conversations`). The draft waits for a human: the composer never sends anything.
 */
export interface AgentComposeInput {
  readonly creatorId: string;
  readonly conversationId: string;
  readonly draftId: string;
  readonly now: Date;
  readonly history: readonly {
    readonly direction: 'inbound' | 'outbound';
    readonly text: string;
    readonly at: Date;
  }[];
  readonly fan: {
    readonly notes: readonly string[];
    readonly spentMinor: number;
    readonly firstMessageAt: Date | null;
  };
}

type AgentComposeResult =
  | {
      readonly kind: 'draft';
      readonly bubbles: readonly string[];
      readonly softViolations: readonly string[];
      readonly costUsd: number;
    }
  | {
      readonly kind: 'held';
      readonly reason: 'guard_blocked' | 'handoff' | 'budget_reached' | 'llm_unavailable' | 'no_reply';
      readonly detail: readonly string[];
      readonly costUsd: number;
    };

export interface AgentDraftComposer {
  compose(input: AgentComposeInput): Promise<AgentComposeResult>;
}

export interface DraftComposerDeps {
  readonly gateway: LlmGateway;
  readonly persona: ComposerPersona;
  /** Her clock: day and night, the time she answers at. */
  readonly timeZone: string;
}

const failureDetail = (error: LlmFailure): readonly string[] =>
  error.attempts.map((a) => `${a.model}: ${a.outcome}`);

/** No voice model with a key, main or fallback: no call is worth making. */
function voiceUnavailable(gateway: LlmGateway): boolean {
  const voice = gateway.health().roles.find((r) => r.role === 'voice');
  return voice === undefined || (!voice.hasKey && voice.fallback?.hasKey !== true);
}

export function createDraftComposer(deps: DraftComposerDeps): AgentDraftComposer {
  return {
    async compose(input) {
      if (voiceUnavailable(deps.gateway)) {
        return { kind: 'held', reason: 'llm_unavailable', detail: ['no voice key'], costUsd: 0 };
      }
      const history: ConversationTurn[] = input.history.map((m) => ({
        from: m.direction === 'inbound' ? 'fan' : 'creator',
        text: m.text,
      }));
      // What he wrote since her last answer: the traps read it as one message.
      const lastAnswer = input.history.findLastIndex((m) => m.direction === 'outbound');
      const fanText = input.history
        .slice(lastAnswer + 1)
        .map((m) => m.text)
        .join('\n');
      const composed = await composeTurn(deps.gateway, deps.persona, {
        history,
        fanText,
        media: [],
        fanNotes: input.fan.notes.join('\n'),
        situation: {
          now: input.now,
          timeZone: deps.timeZone,
          relationshipStartedAt: input.fan.firstMessageAt ?? input.now,
          spentCents: input.fan.spentMinor,
        },
        trace: { creatorId: input.creatorId, conversationId: input.conversationId, draftId: input.draftId },
        // Safety first: a possible minor or distress hands over even when he is testing her.
        skipVoice: (brief) => brief !== undefined && holdDecision(brief).kind !== 'answer',
      });
      const { costUsd } = composed;
      if (composed.handoff !== undefined) {
        return { kind: 'held', reason: 'handoff', detail: composed.handoff, costUsd };
      }
      const decision: HoldDecision =
        composed.brief === undefined ? { kind: 'answer' } : holdDecision(composed.brief);
      if (decision.kind !== 'answer') {
        return { kind: 'held', reason: decision.kind, detail: decision.detail, costUsd };
      }
      if (composed.voiceFailure !== undefined) {
        const reason = composed.voiceFailure.code === 'budget_reached' ? 'budget_reached' : 'llm_unavailable';
        return { kind: 'held', reason, detail: failureDetail(composed.voiceFailure), costUsd };
      }
      const blocking = composed.violations.filter((v) => v.severity === 'blocking');
      if (blocking.length > 0) {
        return { kind: 'held', reason: 'guard_blocked', detail: blocking.map((v) => v.code), costUsd };
      }
      return {
        kind: 'draft',
        bubbles: composed.bubbles,
        softViolations: composed.violations.map((v) => v.code),
        costUsd,
      };
    },
  };
}
