import type { HandoffCause, MediaDescription, MediaFlag, Result } from '@nirvana/contracts';
import type { ConversationTurn, LlmFailure, LlmGateway } from '@nirvana/llm';

import { holdDecision, type HoldDecision } from '../domain/hold';
import { handoffCauseOf } from '../domain/traps';

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
    /** The media the message carries (photo, video, voice note), as `conversations` read them. */
    readonly media?: readonly HistoryMedia[];
  }[];
  readonly fan: {
    readonly notes: readonly string[];
    readonly spentMinor: number;
    readonly firstMessageAt: Date | null;
  };
}

interface HistoryMedia {
  readonly kind: string;
  readonly platformMediaId?: string;
  /** Behind a price: nobody can open it to look. */
  readonly isLocked?: boolean;
}

/** One media of his to look at: what the platform calls it, in the conversation it came in. */
export interface MediaToSee {
  readonly creatorId: string;
  readonly conversationId: string;
  readonly platformMediaId: string;
  readonly kind: 'image' | 'video';
}

/** The vision seen by the composer: the file fetched from the platform, then described (`media` module). */
export interface MediaSight {
  see(media: MediaToSee): Promise<Result<MediaDescription, string>>;
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
      /** Why a human must answer, when the vision knows it: the alert ranks on it. */
      readonly cause?: HandoffCause;
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
  /** Without it, any media of his goes to a human: nothing is answered unseen. */
  readonly sight?: MediaSight;
}

const failureDetail = (error: LlmFailure): readonly string[] =>
  error.attempts.map((a) => `${a.model}: ${a.outcome}`);

const UNSEEN = (detail: readonly string[] = []): AgentComposeResult => ({
  kind: 'held',
  reason: 'handoff',
  detail: ['media_unscreened', ...detail],
  costUsd: 0,
});

/**
 * Every media he sent since her last answer, described before anything is written (minor, consent, weapon:
 * vision obligatoire). A media nobody can see (no vision wired, locked, a voice note, a message with nothing in
 * it, a failed description) goes to a human: nothing is answered on a caption alone (revue 09, B2).
 */
async function seeHisMedia(
  sight: MediaSight | undefined,
  input: AgentComposeInput,
  sinceAnswer: AgentComposeInput['history'],
): Promise<
  { readonly unseen: AgentComposeResult } | { readonly seen: readonly (readonly MediaDescription[])[] }
> {
  if (sinceAnswer.some((m) => m.text.trim() === '' && (m.media?.length ?? 0) === 0))
    return { unseen: UNSEEN() };
  if (sinceAnswer.every((m) => (m.media?.length ?? 0) === 0)) return { seen: sinceAnswer.map(() => []) };
  if (sight === undefined) return { unseen: UNSEEN() };
  const seen: MediaDescription[][] = [];
  for (const message of sinceAnswer) {
    const toSee: MediaToSee[] = [];
    for (const m of message.media ?? []) {
      if (m.isLocked === true) return { unseen: UNSEEN(['locked']) };
      if ((m.kind !== 'image' && m.kind !== 'video') || m.platformMediaId === undefined) {
        return { unseen: UNSEEN([m.kind]) };
      }
      const { kind, platformMediaId } = m;
      toSee.push({ creatorId: input.creatorId, conversationId: input.conversationId, platformMediaId, kind });
    }
    const described: MediaDescription[] = [];
    for (const result of await Promise.all(toSee.map((m) => sight.see(m)))) {
      if (!result.ok) return { unseen: UNSEEN([result.error]) };
      described.push(result.value);
    }
    seen.push(described);
  }
  return { seen };
}

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
      if (voiceUnavailable(deps.gateway)) {
        return { kind: 'held', reason: 'llm_unavailable', detail: ['no voice key'], costUsd: 0 };
      }
      const looked = await seeHisMedia(deps.sight, input, sinceAnswer);
      if ('unseen' in looked) return looked.unseen;
      const media = looked.seen.flat();
      const history: ConversationTurn[] = input.history.map((m, i) => {
        const described = i > lastAnswer ? (looked.seen[i - lastAnswer - 1] ?? []) : [];
        return {
          from: m.direction === 'inbound' ? 'fan' : 'creator',
          text: m.text,
          ...(described.length > 0 && { media: described.map((description) => ({ description })) }),
        };
      });
      // What he wrote since her last answer: the traps read it as one message.
      const fanText = sinceAnswer.map((m) => m.text).join('\n');
      const composed = await composeTurn(deps.gateway, deps.persona, {
        history,
        fanText,
        media,
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
        const flags = media.flatMap((d): MediaFlag[] => d.flags);
        return {
          kind: 'held',
          reason: 'handoff',
          cause: handoffCauseOf(flags),
          detail: composed.handoff,
          costUsd,
        };
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
