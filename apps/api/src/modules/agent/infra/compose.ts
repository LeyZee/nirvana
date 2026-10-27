import type { MediaDescription } from '@nirvana/contracts';
import type { Brief, CallTrace, ConversationTurn, LlmFailure, LlmGateway, VoiceInput } from '@nirvana/llm';

import { checkVoiceOutput, isBlocked, type GuardSettings, type GuardViolation } from '../domain/guards';
import { screenNotes } from '../domain/injection';
import { describeSituation, type Situation } from '../domain/situation';
import { assessTrap, screenMedia, type TrapAssessment } from '../domain/traps';

/** Who she is for the models: one persona, read by the composition root. */
export interface ComposerPersona {
  readonly creatorName: string;
  readonly personaSheet: string;
  readonly guardSettings: GuardSettings;
  /** False: her answer goes out as one message (`behavior.split_messages`). Absent: as the voice wrote it. */
  readonly splitMessages?: boolean;
}

/** What the fan receives: her bubbles, or one message when she does not split hers. */
export function asSent(bubbles: readonly string[], splitMessages = true): readonly string[] {
  return splitMessages || bubbles.length <= 1 ? bubbles : [bubbles.join('\n')];
}

export interface ComposeTurnInput {
  /** The conversation so far, his last message(s) included, oldest first. */
  readonly history: readonly ConversationTurn[];
  /** His last message(s) since her last answer: what the traps read. */
  readonly fanText: string;
  readonly media: readonly MediaDescription[];
  readonly fanNotes: string;
  readonly situation: Situation;
  readonly trace?: CallTrace;
  /** Read once the brain has spoken: true stops before the voice (a handoff, nothing to answer), at no cost. */
  readonly skipVoice?: (brief: Brief | undefined) => boolean;
}

/** One answer, from the brain to the guards: the same path for the playground and for a real fan. */
export interface ComposedTurn {
  /** Safety flags on his media: a human takes over, nothing was written. */
  readonly handoff?: readonly string[];
  readonly trap?: TrapAssessment;
  /** Lines of her notes shaped like an order: kept out of the prompt (agent/domain/injection.ts). */
  readonly droppedNotes?: readonly string[];
  readonly brief?: Brief;
  readonly briefFailure?: LlmFailure;
  /** What the voice was asked to write: kept for a comparison or a rating. */
  readonly voiceBrief?: Brief;
  readonly voiceInput?: VoiceInput;
  readonly bubbles: readonly string[];
  readonly voiceFailure?: LlmFailure;
  readonly violations: readonly GuardViolation[];
  readonly isBlocked: boolean;
  readonly costUsd: number;
  readonly latencyMs: number;
  readonly model?: string;
  readonly isFallback: boolean;
  /** `skipVoice` stopped it: no voice call was made. */
  readonly isSkipped?: boolean;
}

/** Answers the team corrected in the playground, given to the voice as her examples (they take precedence). */
export function withExamples(sheet: string, examples: readonly string[]): string {
  if (examples.length === 0) return sheet;
  return `${sheet}\n\nExemples de ses messages, corrigés par l'équipe :\n${examples.map((e) => `- ${e}`).join('\n')}`;
}

/** His messages before the ones she is answering: the history without its last run of fan turns. */
function earlierFanTexts(history: readonly ConversationTurn[]): string[] {
  let end = history.length;
  while (end > 0 && history[end - 1]?.from === 'fan') end -= 1;
  return history
    .slice(0, end)
    .filter((turn) => turn.from === 'fan')
    .map((turn) => turn.text);
}

const NEUTRAL_BRIEF: Brief = {
  intent: 'other',
  sentiment: 'neutral',
  factsProposed: [],
  kycMissing: [],
  risks: [],
  action: 'reply',
  replyBrief: 'Lui répondre dans la continuité de la conversation.',
  toneHints: [],
};

/** Brain, then voice, then guards. Writes nothing and sends nothing: the caller decides what the answer becomes. */
export async function composeTurn(
  gateway: LlmGateway,
  persona: ComposerPersona,
  input: ComposeTurnInput,
): Promise<ComposedTurn> {
  const screening = screenMedia(input.media);
  if (screening.mustHandoff) {
    return {
      handoff: screening.flags,
      bubbles: [],
      violations: [],
      isBlocked: true,
      costUsd: 0,
      latencyMs: 0,
      isFallback: false,
    };
  }
  const notes = screenNotes(input.fanNotes);
  const base = {
    creatorName: persona.creatorName,
    personaSheet: persona.personaSheet,
    fanNotes: notes.kept,
    situation: describeSituation(input.situation),
    history: input.history,
    ...(input.trace !== undefined && { trace: input.trace }),
  };
  const brain = await gateway.brain(base);
  const brief = brain.ok ? brain.value.output : undefined;
  // A trap overrides whatever the brain suggested: she does not play along (agent/domain/traps.ts).
  const trap = assessTrap({
    fanText: input.fanText,
    earlierFanTexts: earlierFanTexts(input.history),
    media: input.media,
    ...(brief && { brain: brief }),
  });
  const voiceBrief: Brief =
    trap.replyBrief === undefined
      ? (brief ?? NEUTRAL_BRIEF)
      : {
          ...(brief ?? NEUTRAL_BRIEF),
          action: 'reply',
          replyBrief: trap.replyBrief,
          toneHints: [...(trap.toneHints ?? [])],
        };
  const brainCostUsd = brain.ok ? (brain.value.meta.costUsd ?? 0) : 0;
  const brainLatencyMs = brain.ok ? brain.value.meta.latencyMs : 0;
  if (input.skipVoice?.(brief) === true) {
    return {
      ...(trap.isTrap && { trap }),
      ...(notes.dropped.length > 0 && { droppedNotes: notes.dropped }),
      ...(brief && { brief }),
      ...(!brain.ok && { briefFailure: brain.error }),
      bubbles: [],
      violations: [],
      isBlocked: true,
      costUsd: brainCostUsd,
      latencyMs: brainLatencyMs,
      isFallback: false,
      isSkipped: true,
    };
  }
  const voiceInput: VoiceInput = { ...base, brief: voiceBrief };
  const voice = await gateway.voice(voiceInput);
  const written = voice.ok ? voice.value.output.bubbles : [];
  // Checked as written: the length and count guards read the voice's bubbles, not the joined message.
  const violations = checkVoiceOutput(written, persona.guardSettings);
  const bubbles = asSent(written, persona.splitMessages);
  return {
    ...(trap.isTrap && { trap }),
    ...(notes.dropped.length > 0 && { droppedNotes: notes.dropped }),
    ...(brief && { brief }),
    ...(!brain.ok && { briefFailure: brain.error }),
    voiceBrief,
    voiceInput,
    bubbles,
    ...(!voice.ok && { voiceFailure: voice.error }),
    violations,
    isBlocked: isBlocked(violations) || !voice.ok,
    costUsd: brainCostUsd + (voice.ok ? (voice.value.meta.costUsd ?? 0) : 0),
    latencyMs: brainLatencyMs + (voice.ok ? voice.value.meta.latencyMs : 0),
    ...(voice.ok && { model: voice.value.meta.model }),
    isFallback: voice.ok && voice.value.meta.isFallback,
  };
}
