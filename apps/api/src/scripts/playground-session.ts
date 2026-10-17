import type { MediaDescription } from '@nirvana/contracts';
import type { Brief, ConversationTurn, LlmGateway, VoiceInput } from '@nirvana/llm';

import {
  assessTrap,
  checkVoiceOutput,
  describeSituation,
  isBlocked,
  screenMedia,
  type GuardSettings,
  type GuardViolation,
  type RatedMoment,
  type Situation,
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

/** The last answer and what it was written from: what a rating records, and what a comparison replays. */
interface PlaygroundExchange {
  readonly fanMessage: string;
  readonly turn: PlaygroundTurn;
  readonly moment: RatedMoment;
  readonly voiceInput?: VoiceInput;
}

interface VoiceComparison {
  readonly bubbles: readonly string[];
  readonly violations: readonly GuardViolation[];
  readonly isBlocked: boolean;
  readonly model?: string;
  readonly costUsd: number;
  readonly failure?: string;
}

export interface PlaygroundSession {
  /** His message, with the descriptions of the media he sends with it. */
  handleFanMessage(text: string, media?: readonly MediaDescription[]): Promise<PlaygroundTurn>;
  /** She sends one of her media (a teaser, or a locked paid one he can ask about). */
  sendCreatorMedia(description: MediaDescription, isLocked: boolean): void;
  /** Her answer as the team rewrote it: the conversation goes on from the corrected version. */
  replaceLastAnswer(text: string): void;
  /** Back to just before his n-th message (from 1); returns that message to send again, on a new branch. */
  branchAt(fanMessageNumber: number): { text: string; media: MediaDescription[] } | undefined;
  /** The same moment written by another voice model, side by side; the conversation does not change. */
  compareVoice(gateway: LlmGateway): Promise<VoiceComparison | undefined>;
  setSituation(patch: Partial<Situation>): void;
  /** The simulated clock: tests follow-ups, day and night, the sexualisation delay. */
  advance(ms: number): void;
  setFanNotes(notes: readonly string[]): void;
  reset(): void;
  readonly history: readonly ConversationTurn[];
  readonly fanNotes: readonly string[];
  readonly situation: Situation;
  readonly lastExchange: PlaygroundExchange | undefined;
}

export interface PlaygroundDeps {
  readonly gateway: LlmGateway;
  readonly creatorName: string;
  readonly personaSheet: string;
  readonly guardSettings: GuardSettings;
  /** Answers the team corrected earlier: given to the voice as her examples (they take precedence). */
  readonly voiceExamples?: readonly string[];
  readonly timeZone?: string;
  readonly now?: () => Date;
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

function withExamples(sheet: string, examples: readonly string[]): string {
  if (examples.length === 0) return sheet;
  return `${sheet}\n\nExemples de ses messages, corrigés par l'équipe :\n${examples.map((e) => `- ${e}`).join('\n')}`;
}

const failure = (attempts: readonly { model: string; outcome: string }[]): string =>
  attempts.map((a) => `${a.model}: ${a.outcome}`).join(', ');

/**
 * Same path as production (brain, then voice, then guards) with no connector at all: nothing can be sent.
 * A blocked answer is shown as a trace and never enters the history.
 */
export function createPlaygroundSession(deps: PlaygroundDeps): PlaygroundSession {
  const history: ConversationTurn[] = [];
  // In-memory fan notes until the fans module stores facts (P3-02).
  const fanNotes: string[] = [];
  const personaSheet = withExamples(deps.personaSheet, deps.voiceExamples ?? []);
  const startedAt = (deps.now ?? (() => new Date()))();
  let situation: Situation = {
    now: startedAt,
    timeZone: deps.timeZone ?? 'Europe/Paris',
    relationshipStartedAt: startedAt,
    spentCents: 0,
  };
  let lastExchange: PlaygroundExchange | undefined;

  return {
    history,
    fanNotes,
    get situation() {
      return situation;
    },
    get lastExchange() {
      return lastExchange;
    },

    reset() {
      history.length = 0;
      fanNotes.length = 0;
      lastExchange = undefined;
      situation = { ...situation, relationshipStartedAt: situation.now, spentCents: 0 };
    },

    setSituation(patch) {
      situation = { ...situation, ...patch };
    },

    advance(ms) {
      situation = { ...situation, now: new Date(situation.now.getTime() + ms) };
    },

    setFanNotes(notes) {
      fanNotes.splice(0, fanNotes.length, ...notes);
    },

    sendCreatorMedia(description, isLocked) {
      history.push({ from: 'creator', text: '', media: [{ description, isLocked }] });
    },

    replaceLastAnswer(text) {
      const last = history.at(-1);
      if (last?.from === 'creator' && last.media === undefined) history.pop();
      history.push({ from: 'creator', text });
    },

    branchAt(fanMessageNumber) {
      let seen = 0;
      const index = history.findIndex((t) => t.from === 'fan' && (seen += 1) === fanMessageNumber);
      const turn = history[index];
      if (turn === undefined) return undefined;
      history.splice(index);
      lastExchange = undefined;
      return { text: turn.text, media: (turn.media ?? []).map((m) => m.description) };
    },

    async compareVoice(gateway) {
      const input = lastExchange?.voiceInput;
      if (input === undefined) return undefined;
      const voice = await gateway.voice(input);
      const bubbles = voice.ok ? voice.value.output.bubbles : [];
      const violations = checkVoiceOutput(bubbles, deps.guardSettings);
      return {
        bubbles,
        violations,
        isBlocked: isBlocked(violations) || !voice.ok,
        ...(voice.ok && { model: voice.value.meta.model }),
        costUsd: voice.ok ? (voice.value.meta.costUsd ?? 0) : 0,
        ...(!voice.ok && { failure: failure(voice.error.attempts) }),
      };
    },

    async handleFanMessage(text, media = []) {
      history.push({ from: 'fan', text, media: media.map((description) => ({ description })) });
      const moment: RatedMoment = {
        history: [...history],
        fanNotes: fanNotes.join('\n'),
        situation: describeSituation(situation),
      };
      const screening = screenMedia(media);
      if (screening.mustHandoff) {
        const turn: PlaygroundTurn = {
          handoff: screening.flags,
          bubbles: [],
          violations: [],
          isBlocked: true,
          costUsd: 0,
          latencyMs: 0,
          isFallback: false,
        };
        lastExchange = { fanMessage: text, turn, moment };
        return turn;
      }
      const input = {
        creatorName: deps.creatorName,
        personaSheet,
        fanNotes: moment.fanNotes,
        situation: moment.situation,
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
      const voiceInput: VoiceInput = { ...input, history: [...history], brief: voiceBrief };
      const voice = await deps.gateway.voice(voiceInput);
      const bubbles = voice.ok ? voice.value.output.bubbles : [];
      const violations = checkVoiceOutput(bubbles, deps.guardSettings);
      const blocked = isBlocked(violations) || !voice.ok;
      if (!blocked) history.push({ from: 'creator', text: bubbles.join('\n') });

      const turn: PlaygroundTurn = {
        ...(trap.isTrap && { trap }),
        ...(brief && { brief }),
        ...(!brain.ok && { briefFailure: failure(brain.error.attempts) }),
        bubbles,
        ...(!voice.ok && { voiceFailure: failure(voice.error.attempts) }),
        violations,
        isBlocked: blocked,
        costUsd:
          (brain.ok ? (brain.value.meta.costUsd ?? 0) : 0) + (voice.ok ? (voice.value.meta.costUsd ?? 0) : 0),
        latencyMs: (brain.ok ? brain.value.meta.latencyMs : 0) + (voice.ok ? voice.value.meta.latencyMs : 0),
        ...(voice.ok && { model: voice.value.meta.model }),
        isFallback: voice.ok && voice.value.meta.isFallback,
      };
      lastExchange = { fanMessage: text, turn, moment: { ...moment, brief: voiceBrief }, voiceInput };
      return turn;
    },
  };
}
