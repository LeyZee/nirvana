import type { MediaDescription } from '@nirvana/contracts';
import type { Brief, ConversationTurn, LlmGateway } from '@nirvana/llm';

import {
  assessTrap,
  checkVoiceOutput,
  isBlocked,
  screenMedia,
  type GuardSettings,
  type GuardViolation,
  type TrapAssessment,
} from '../modules/agent/index';

export interface PlaygroundTurn {
  /** Safety flags on his media: a human would take over, nothing is written. */
  readonly handoff?: readonly string[];
  readonly trap?: TrapAssessment;
  readonly brief?: Brief;
  readonly briefFailure?: string;
  readonly bubbles: readonly string[];
  readonly voiceFailure?: string;
  readonly violations: readonly GuardViolation[];
  readonly isBlocked: boolean;
  readonly costUsd: number;
  readonly latencyMs: number;
  readonly model?: string;
  readonly isFallback: boolean;
}

export interface PlaygroundSession {
  /** His message, with the descriptions of the media he sends with it. */
  handleFanMessage(text: string, media?: readonly MediaDescription[]): Promise<PlaygroundTurn>;
  /** She sends one of her media (a teaser, or a locked paid one he can ask about). */
  sendCreatorMedia(description: MediaDescription, isLocked: boolean): void;
  reset(): void;
  readonly history: readonly ConversationTurn[];
  readonly fanNotes: readonly string[];
}

export interface PlaygroundDeps {
  readonly gateway: LlmGateway;
  readonly creatorName: string;
  readonly personaSheet: string;
  readonly guardSettings: GuardSettings;
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

/**
 * Same path as production (brain, then voice, then guards) with no connector at all: nothing can be sent.
 * A blocked answer is shown as a trace and never enters the history.
 */
export function createPlaygroundSession(deps: PlaygroundDeps): PlaygroundSession {
  const history: ConversationTurn[] = [];
  // In-memory fan notes until the fans module stores facts (designed by the Extension thread's fiche).
  const fanNotes: string[] = [];

  return {
    history,
    fanNotes,

    reset() {
      history.length = 0;
      fanNotes.length = 0;
    },

    sendCreatorMedia(description, isLocked) {
      history.push({ from: 'creator', text: '', media: [{ description, isLocked }] });
    },

    async handleFanMessage(text, media = []) {
      history.push({ from: 'fan', text, media: media.map((description) => ({ description })) });
      const screening = screenMedia(media);
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
      const input = {
        creatorName: deps.creatorName,
        personaSheet: deps.personaSheet,
        fanNotes: fanNotes.join('\n'),
        history,
      };
      const brain = await deps.gateway.brain(input);
      const brief = brain.ok ? brain.value.output : undefined;
      if (brief) {
        for (const fact of brief.factsProposed)
          fanNotes.push(`${fact.category} / ${fact.key} : ${fact.value} (${fact.kind})`);
      }
      // A trap overrides whatever the brain suggested: she does not play along (agent/domain/traps.ts).
      const trap = assessTrap({ fanText: text, media, ...(brief && { brain: brief }) });
      const voiceBrief: Brief =
        trap.replyBrief === undefined
          ? (brief ?? NEUTRAL_BRIEF)
          : {
              ...(brief ?? NEUTRAL_BRIEF),
              action: 'reply',
              replyBrief: trap.replyBrief,
              toneHints: [...(trap.toneHints ?? [])],
            };
      const voice = await deps.gateway.voice({ ...input, brief: voiceBrief });
      const bubbles = voice.ok ? voice.value.output.bubbles : [];
      const violations = checkVoiceOutput(bubbles, deps.guardSettings);
      const blocked = isBlocked(violations) || !voice.ok;
      if (!blocked) history.push({ from: 'creator', text: bubbles.join('\n') });

      return {
        ...(trap.isTrap && { trap }),
        ...(brief && { brief }),
        ...(!brain.ok && {
          briefFailure: brain.error.attempts.map((a) => `${a.model}: ${a.outcome}`).join(', '),
        }),
        bubbles,
        ...(!voice.ok && {
          voiceFailure: voice.error.attempts.map((a) => `${a.model}: ${a.outcome}`).join(', '),
        }),
        violations,
        isBlocked: blocked,
        costUsd:
          (brain.ok ? (brain.value.meta.costUsd ?? 0) : 0) + (voice.ok ? (voice.value.meta.costUsd ?? 0) : 0),
        latencyMs: (brain.ok ? brain.value.meta.latencyMs : 0) + (voice.ok ? voice.value.meta.latencyMs : 0),
        ...(voice.ok && { model: voice.value.meta.model }),
        isFallback: voice.ok && voice.value.meta.isFallback,
      };
    },
  };
}
