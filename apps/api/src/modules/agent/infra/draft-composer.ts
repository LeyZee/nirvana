import type { FanFlags, HandoffCause, MediaDescription, MediaFlag, Result } from '@nirvana/contracts';
import type { ConversationTurn, LlmFailure, LlmGateway } from '@nirvana/llm';

import { holdDecision, protectionFor, protectionWhileAnswering, type HoldDecision } from '../domain/hold';
import { withoutOrders } from '../domain/injection';
import type { OfferLimits } from '../domain/policy';
import { handoffCauseOf } from '../domain/traps';

import { composeTurn, type ComposerPersona, type OfferInput } from './compose';
import type { FanLimits } from './fan-limits';

/**
 * The agent seen by `conversation.respond` (conversations' `DraftComposer` port, matched by shape: `agent` does
 * not import `conversations`). The draft waits for a human: the composer never sends anything.
 */
export interface AgentComposeInput {
  readonly creatorId: string;
  readonly conversationId: string;
  readonly fanId: string;
  readonly draftId: string;
  /** Carried to the events the policy writes (a limit set on a risk). */
  readonly correlationId: string;
  readonly now: Date;
  /** Where the conversation lives on the platform: the connector fetches his media there. */
  readonly platformAccountId?: string;
  readonly platformConversationId?: string;
  readonly history: readonly {
    readonly direction: 'inbound' | 'outbound';
    readonly text: string;
    readonly at: Date;
    /** Its id on the platform: a media link expires, a fresh one is read on the message. */
    readonly platformMessageId?: string;
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

/** One media of his to look at: what the platform calls it, in the message and conversation it came in. */
export interface MediaToSee {
  readonly creatorId: string;
  readonly conversationId: string;
  readonly platformAccountId: string;
  readonly platformConversationId: string;
  readonly platformMessageId: string;
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
      /** What the brief read about the fan; `conversations` keeps the categories it knows (P3-02). */
      readonly factsProposed: readonly {
        readonly category: string;
        readonly key: string;
        readonly value: string;
        readonly kind: 'declared' | 'inferred';
        readonly confidence: number;
      }[];
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
  /** His limits: read before anything is written, set on a detected risk (P3-02). */
  readonly limits?: FanLimits;
  /** Her pace of scripts (`PersonaForModels.offerLimits`): without it, or without his limits, she offers nothing. */
  readonly offerLimits?: OfferLimits;
  /**
   * When a script was last offered to him, bought or not: Reveal's script history (ADR 0018, P6-01). Without it
   * the cooldown cannot be read, so she offers nothing.
   */
  readonly lastOfferAt?: (creatorId: string, fanId: string) => Promise<Date | null>;
  /** Lines of her notes kept out of the prompt for looking like an order: counted, never their text. */
  readonly onDroppedNotes?: (event: { readonly conversationId: string; readonly count: number }) => void;
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
 * it, a failed or uncertain description) goes to a human: nothing is answered on a caption alone (revue 09, B2).
 * Looked at before the voice key is checked: a possible minor ranks as such even when no voice could answer.
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
  const { platformAccountId, platformConversationId } = input;
  if (platformAccountId === undefined || platformConversationId === undefined) {
    return { unseen: UNSEEN(['no_platform_ref']) };
  }
  const seen: MediaDescription[][] = [];
  for (const message of sinceAnswer) {
    const toSee: MediaToSee[] = [];
    const { platformMessageId } = message;
    for (const m of message.media ?? []) {
      if (m.isLocked === true) return { unseen: UNSEEN(['locked']) };
      if (m.kind !== 'image' && m.kind !== 'video') return { unseen: UNSEEN([m.kind]) };
      if (m.platformMediaId === undefined || platformMessageId === undefined) {
        return { unseen: UNSEEN(['no_platform_ref']) };
      }
      toSee.push({
        creatorId: input.creatorId,
        conversationId: input.conversationId,
        platformAccountId,
        platformConversationId,
        platformMessageId,
        platformMediaId: m.platformMediaId,
        kind: m.kind,
      });
    }
    const described: MediaDescription[] = [];
    for (const result of await Promise.all(toSee.map((m) => sight.see(m)))) {
      if (!result.ok) return { unseen: UNSEEN([result.error]) };
      // Described but not seen (black, blurred, cut) or seen without certainty: a minor could hide there.
      if (result.value.notVisible) return { unseen: UNSEEN(['not_visible']) };
      if (result.value.confidenceLow) return { unseen: UNSEEN(['confidence_low']) };
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

type Held = Extract<AgentComposeResult, { kind: 'held' }>;

const HANDOFF: Held = { kind: 'held', reason: 'handoff', detail: [], costUsd: 0 };

/**
 * A handoff on a risk also sets his limits until a human decides (P3-02): a possible minor is no longer
 * age-confirmed, distress or a threat stops everything written to him. The handoff goes out even when the limits
 * could not be saved: the chatter sees it in the detail.
 */
async function protect(
  limits: FanLimits | undefined,
  input: AgentComposeInput,
  signs: readonly string[],
  held: Held,
) {
  const protection = protectionFor(signs);
  if (limits === undefined || protection.because.length === 0) return held;
  try {
    await limits.protect(input.creatorId, input.fanId, protection, input.correlationId, input.now);
    return held;
  } catch {
    return { ...held, detail: [...held.detail, 'limits_not_saved'] };
  }
}

/**
 * Nothing is written to a fan a human stopped, or the policy did: a new message of his goes to a chatter.
 * Otherwise his limits, when there are any to read, for the offer.
 */
async function stopped(
  limits: FanLimits | undefined,
  input: AgentComposeInput,
): Promise<{ readonly held: Held } | { readonly flags: FanFlags | undefined }> {
  if (limits === undefined) return { flags: undefined };
  try {
    const flags = await limits.flags(input.creatorId, input.fanId);
    return flags.doNotContact === true ? { held: { ...HANDOFF, detail: ['do_not_contact'] } } : { flags };
  } catch {
    // His limits unknown, nothing is written: a chatter answers.
    return { held: { ...HANDOFF, detail: ['limits_unreadable'] } };
  }
}

/** What the policy needs to let her offer; any of it unknown, there is no offer to decide on (fail closed). */
async function offerInput(
  deps: DraftComposerDeps,
  input: AgentComposeInput,
  flags: FanFlags | undefined,
): Promise<OfferInput | undefined> {
  if (flags === undefined || deps.offerLimits === undefined || deps.lastOfferAt === undefined)
    return undefined;
  try {
    const lastOfferAt = await deps.lastOfferAt(input.creatorId, input.fanId);
    return { now: input.now, lastOfferAt, hasNoBudget: false, flags, limits: deps.offerLimits };
  } catch {
    return undefined;
  }
}

async function keepWhileAnswering(
  limits: FanLimits | undefined,
  input: AgentComposeInput,
  risks: readonly string[],
): Promise<Held | null> {
  const protection = protectionWhileAnswering(risks);
  if (limits === undefined || protection.because.length === 0) return null;
  try {
    await limits.protect(input.creatorId, input.fanId, protection, input.correlationId, input.now);
    return null;
  } catch {
    return { ...HANDOFF, detail: [...protection.because, 'limits_not_saved'] };
  }
}

export function createDraftComposer(deps: DraftComposerDeps): AgentDraftComposer {
  return {
    async compose(input) {
      const stop = await stopped(deps.limits, input);
      if ('held' in stop) return stop.held;
      const lastAnswer = input.history.findLastIndex((m) => m.direction === 'outbound');
      const sinceAnswer = input.history.slice(lastAnswer + 1);
      const looked = await seeHisMedia(deps.sight, input, sinceAnswer);
      if ('unseen' in looked) return looked.unseen;
      const media = looked.seen.flat();
      const flags = media.flatMap((d): MediaFlag[] => d.flags);
      if (flags.length > 0) {
        const held: Held = { ...HANDOFF, cause: handoffCauseOf(flags), detail: flags };
        return protect(deps.limits, input, flags, held);
      }
      if (voiceUnavailable(deps.gateway)) {
        return { kind: 'held', reason: 'llm_unavailable', detail: ['no voice key'], costUsd: 0 };
      }
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
      const offer = await offerInput(deps, input, stop.flags);
      const composed = await composeTurn(deps.gateway, deps.persona, {
        history,
        fanText,
        media,
        fanNotes: input.fan.notes.join('\n'),
        ...(offer !== undefined && { offer }),
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
      if (composed.droppedNotes !== undefined) {
        deps.onDroppedNotes?.({ conversationId: input.conversationId, count: composed.droppedNotes.length });
      }
      if (composed.handoff !== undefined) {
        return protect(deps.limits, input, composed.handoff, {
          ...HANDOFF,
          detail: composed.handoff,
          costUsd,
        });
      }
      if (composed.brief === undefined) {
        const failure = composed.briefFailure;
        const reason = failure?.code === 'budget_reached' ? 'budget_reached' : 'llm_unavailable';
        return { kind: 'held', reason, detail: failure === undefined ? [] : failureDetail(failure), costUsd };
      }
      const decision: HoldDecision = holdDecision(composed.brief);
      if (decision.kind === 'handoff') {
        const held: Held = { ...HANDOFF, detail: decision.detail, costUsd };
        return protect(deps.limits, input, composed.brief.risks, held);
      }
      // He said he cannot pay: whatever is written now, the policy remembers it for his next messages. Not
      // saved, a chatter answers: the next message would forget it.
      const kept = await keepWhileAnswering(deps.limits, input, composed.brief.risks);
      if (kept !== null) return { ...kept, costUsd };
      if (decision.kind === 'no_reply')
        return { kind: 'held', reason: 'no_reply', detail: decision.detail, costUsd };
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
        factsProposed: withoutOrders(composed.brief.factsProposed),
        ...(composed.model !== undefined && {
          voice: { voicePrompt: deps.voicePrompt, voiceModel: composed.model },
        }),
      };
    },
  };
}
