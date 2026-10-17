import type { MediaDescription } from '@nirvana/contracts';
import type { Brief, ConversationTurn, LlmFailure, LlmGateway, VoiceInput } from '@nirvana/llm';

import {
  asSent,
  checkVoiceOutput,
  composeTurn,
  withExamples,
  isBlocked,
  type GuardSettings,
  type GuardViolation,
  type RatedMoment,
  type Situation,
  type TrapAssessment,
} from '../../agent/index';

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
  /** False: her answer is shown as one message, as the fan would get it (`behavior.split_messages`). */
  readonly splitMessages?: boolean;
  /** Answers the team corrected earlier: given to the voice as her examples (they take precedence). */
  readonly voiceExamples?: readonly string[];
  readonly timeZone?: string;
  readonly now?: () => Date;
}

/** Why nothing was written, for the trace: the daily cap, or each model that failed. */
const failure = (error: LlmFailure): string =>
  error.code === 'budget_reached'
    ? 'plafond du jour atteint'
    : error.attempts.map((a) => `${a.model}: ${a.outcome}`).join(', ');

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
      // Her answer is the text turn after his last message; a media she sent since stays after it.
      const lastFan = history.findLastIndex((t) => t.from === 'fan');
      const answer = history.findIndex(
        (t, i) => i > lastFan && t.from === 'creator' && t.media === undefined,
      );
      if (answer === -1) history.splice(lastFan + 1, 0, { from: 'creator', text });
      else history.splice(answer, 1, { from: 'creator', text });
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
      const written = voice.ok ? voice.value.output.bubbles : [];
      const violations = checkVoiceOutput(written, deps.guardSettings);
      const bubbles = asSent(written, deps.splitMessages);
      return {
        bubbles,
        violations,
        isBlocked: isBlocked(violations) || !voice.ok,
        ...(voice.ok && { model: voice.value.meta.model }),
        costUsd: voice.ok ? (voice.value.meta.costUsd ?? 0) : 0,
        ...(!voice.ok && { failure: failure(voice.error) }),
      };
    },

    async handleFanMessage(text, media = []) {
      history.push({ from: 'fan', text, media: media.map((description) => ({ description })) });
      const moment: RatedMoment = {
        history: [...history],
        fanNotes: fanNotes.join('\n'),
        situation,
      };
      const composed = await composeTurn(
        deps.gateway,
        {
          creatorName: deps.creatorName,
          personaSheet,
          guardSettings: deps.guardSettings,
          ...(deps.splitMessages !== undefined && { splitMessages: deps.splitMessages }),
        },
        { history: [...history], fanText: text, media, fanNotes: moment.fanNotes, situation },
      );
      // In-memory fan notes until the fans module stores facts (P3-02).
      for (const fact of composed.brief?.factsProposed ?? [])
        fanNotes.push(`${fact.category} / ${fact.key} : ${fact.value} (${fact.kind})`);
      if (!composed.isBlocked) history.push({ from: 'creator', text: composed.bubbles.join('\n') });

      const turn: PlaygroundTurn = {
        ...(composed.handoff !== undefined && { handoff: composed.handoff }),
        ...(composed.trap !== undefined && { trap: composed.trap }),
        ...(composed.brief !== undefined && { brief: composed.brief }),
        ...(composed.briefFailure !== undefined && { briefFailure: failure(composed.briefFailure) }),
        bubbles: composed.bubbles,
        ...(composed.voiceFailure !== undefined && { voiceFailure: failure(composed.voiceFailure) }),
        violations: composed.violations,
        isBlocked: composed.isBlocked,
        costUsd: composed.costUsd,
        latencyMs: composed.latencyMs,
        ...(composed.model !== undefined && { model: composed.model }),
        isFallback: composed.isFallback,
      };
      lastExchange = {
        fanMessage: text,
        turn,
        moment: composed.voiceBrief === undefined ? moment : { ...moment, brief: composed.voiceBrief },
        ...(composed.voiceInput !== undefined && { voiceInput: composed.voiceInput }),
      };
      return turn;
    },
  };
}
