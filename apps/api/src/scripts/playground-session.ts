import type { Brief, ConversationTurn, LlmGateway } from '@nirvana/llm';

import { checkVoiceOutput, isBlocked, type GuardSettings, type GuardViolation } from '../modules/agent/index';

export interface PlaygroundTurn {
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
  handleFanMessage(text: string): Promise<PlaygroundTurn>;
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

    async handleFanMessage(text) {
      history.push({ from: 'fan', text });
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
      const voice = await deps.gateway.voice({ ...input, brief: brief ?? NEUTRAL_BRIEF });
      const bubbles = voice.ok ? voice.value.output.bubbles : [];
      const violations = checkVoiceOutput(bubbles, deps.guardSettings);
      const blocked = isBlocked(violations) || !voice.ok;
      if (!blocked) history.push({ from: 'creator', text: bubbles.join('\n') });

      return {
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
