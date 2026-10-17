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
      /** Absent when no model is known: no voice is better than a false one on the live rate (ADR 0019). */
      readonly voice?: { readonly voicePrompt: string; readonly voiceModel: string };
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
  /** Her clock (day and night, the time she answers at), from the creator of the conversation. */
  readonly timeZoneOf: (creatorId: string) => Promise<string>;
  /** Version of the voice prompt, written on each draft with the model that answered (ADR 0019). */
  readonly voicePrompt: string;
}

const failureDetail = (error: LlmFailure): readonly string[] =>
  error.attempts.map((a) => `${a.model}: ${a.outcome}`);

// The fan's photos and videos do not reach the composer yet (history carries text only), and every media of his
// must be seen before she answers (minor, consent, weapon): a message without text goes to a human.
// TODO(P3-06): pass his media to the screening once `HistoryMessage` carries them.

/** No voice model with a key, main or fallback: no call is worth making. */
function voiceUnavailable(gateway: LlmGateway): boolean {
  const voice = gateway.health().roles.find((r) => r.role === 'voice');
  return voice === undefined || (!voice.hasKey && voice.fallback?.hasKey !== true);
}

export function createDraftComposer(deps: DraftComposerDeps): AgentDraftComposer {
  return {
    async compose(input) {
      const lastAnswer = input.history.findLastIndex((m) => m.direction === 'outbound');
      const sinceAnswer = input.history.slice(lastAnswer + 1);
      if (sinceAnswer.some((m) => m.text.trim() === '')) {
        return { kind: 'held', reason: 'handoff', detail: ['media_unscreened'], costUsd: 0 };
      }
      if (voiceUnavailable(deps.gateway)) {
        return { kind: 'held', reason: 'llm_unavailable', detail: ['no voice key'], costUsd: 0 };
      }
      const history: ConversationTurn[] = input.history.map((m) => ({
        from: m.direction === 'inbound' ? 'fan' : 'creator',
        text: m.text,
      }));
      // What he wrote since her last answer: the traps read it as one message.
      const fanText = sinceAnswer.map((m) => m.text).join('\n');
      const composed = await composeTurn(deps.gateway, deps.persona, {
        history,
        fanText,
        media: [],
        fanNotes: input.fan.notes.join('\n'),
        situation: {
          now: input.now,
          timeZone: await deps.timeZoneOf(input.creatorId),
          relationshipStartedAt: input.fan.firstMessageAt ?? input.now,
          spentCents: input.fan.spentMinor,
        },
        trace: { creatorId: input.creatorId, conversationId: input.conversationId, draftId: input.draftId },
        // Safety first: a possible minor or distress hands over even when he is testing her, and without the
        // brain's reading of the risks nobody knows, so the voice does not write either.
        skipVoice: (brief) => brief === undefined || holdDecision(brief).kind !== 'answer',
      });
      const { costUsd } = composed;
      if (composed.handoff !== undefined) {
        return { kind: 'held', reason: 'handoff', detail: composed.handoff, costUsd };
      }
      if (composed.brief === undefined) {
        const failure = composed.briefFailure;
        const reason = failure?.code === 'budget_reached' ? 'budget_reached' : 'llm_unavailable';
        return { kind: 'held', reason, detail: failure === undefined ? [] : failureDetail(failure), costUsd };
      }
      const decision: HoldDecision = holdDecision(composed.brief);
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
        ...(composed.model !== undefined && {
          voice: { voicePrompt: deps.voicePrompt, voiceModel: composed.model },
        }),
      };
    },
  };
}
