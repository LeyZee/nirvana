import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadPrompt, type LlmGateway } from '@nirvana/llm';

import type { FansModule } from '../fans';

import { DEFAULT_GUARD_SETTINGS as SHARED_GUARD_SETTINGS } from './domain/guards';
import { createBubbleGuard, type AgentBubbleGuard } from './infra/bubble-guard';
import { voiceExamples } from './infra/calibration-record';
import { withExamples } from './infra/compose';
import {
  createDraftComposer,
  type AgentDraftComposer,
  type DraftComposerDeps,
  type MediaSight,
} from './infra/draft-composer';
import { createFanLimits } from './infra/fan-limits';
import { createJsonlCalibrationStore } from './infra/jsonl-calibration-store';
import { guardSettingsOf, readPersonaFile } from './infra/persona-file';

/** Public entry point of the `agent` module (ADR 0002). Other modules import this file only. */
export {
  checkVoiceOutput,
  DEFAULT_GUARD_SETTINGS,
  isBlocked,
  type GuardSettings,
  type GuardViolation,
} from './domain/guards';
export type { TrapAssessment } from './domain/traps';
/** @public The policy, read by `pnpm evals` on the same path as a real fan (and by the composer at P6-01). */
export { holdDecision } from './domain/hold';
export { withoutOrders } from './domain/injection';
/** @public */
export { offerDecision, offerSignals, type OfferContext } from './domain/policy';
export { describeSituation, isNight, isTimeZone, nextLocalTime, type Situation } from './domain/situation';
export {
  parseRejection,
  rateReport,
  REJECT_REASON_LABELS,
  REJECT_REASONS,
  suggestDestination,
  RATE_TARGET,
  versionLabel,
  type Verdict,
} from './domain/calibration';
export {
  replayableTests,
  voiceExamples,
  type CalibrationRecord,
  type CalibrationStore,
  type RatedMoment,
} from './infra/calibration-record';
export { createJsonlCalibrationStore } from './infra/jsonl-calibration-store';
export { asSent, composeTurn, withExamples } from './infra/compose';
export { guardSettingsOf, readPersonaFile, type PersonaForModels } from './infra/persona-file';

export type { AgentDraftComposer } from './infra/draft-composer';
/** @public Wired by the composition root with the connector's `FetchMedia` (P3-04). */
export type { MediaSight } from './infra/draft-composer';
/** @public Wired by the composition root with the connector's `FetchMedia` (P3-04). */
export { createMediaSight, type FetchMedia } from './infra/media-sight';
/** @public The `BubbleGuard` port of `conversations`, matched by shape. */
export type { AgentBubbleGuard } from './infra/bubble-guard';

export interface DraftComposerStartOptions {
  readonly gateway: LlmGateway;
  /** A persona YAML (PersonaSchema); the real one lives outside the repository (ADR 0010). */
  readonly personaPath: string;
  /** The playground's ratings: her corrected answers become the voice's examples here too. */
  readonly trainingDir: string;
  /** Her clock, read for each draft: the creator's time zone. */
  readonly timeZoneOf: (creatorId: string) => Promise<string>;
  /** His media seen before she answers; without it, any media goes to a human. */
  readonly sight?: MediaSight;
  /** His limits: nothing is written to a stopped fan, and a risk sets them itself (P3-02). */
  readonly fans?: Pick<FansModule, 'flags' | 'setFlag' | 'clearFlag'>;
  /** A note of hers kept out of the prompt (it looked like an order): a chatter's real note would vanish unseen. */
  readonly onDroppedNotes?: DraftComposerDeps['onDroppedNotes'];
}

/** Reads the persona and the corrected answers, then builds the composer behind `conversation.respond`. */
export async function startDraftComposer(options: DraftComposerStartOptions): Promise<AgentDraftComposer> {
  const today = new Date().toISOString().slice(0, 10);
  const persona = readPersonaFile(await readFile(options.personaPath, 'utf8'), 'Messa', today);
  const records = await createJsonlCalibrationStore(join(options.trainingDir, 'ratings.jsonl')).list();
  return createDraftComposer({
    gateway: options.gateway,
    persona: {
      creatorName: persona.creatorName,
      personaSheet: withExamples(persona.personaSheet, voiceExamples(records)),
      guardSettings: guardSettingsOf(persona),
      splitMessages: persona.splitMessages,
    },
    timeZoneOf: options.timeZoneOf,
    voicePrompt: loadPrompt('voice').header.version,
    ...(options.sight !== undefined && { sight: options.sight }),
    ...(options.fans !== undefined && { limits: createFanLimits(options.fans) }),
    ...(options.onDroppedNotes !== undefined && { onDroppedNotes: options.onDroppedNotes }),
  });
}

/**
 * The hard guards for the bubbles a chatter rewrote, with her disgusts and forbidden words.
 * @public Wired by the composition root once `conversations` has its `BubbleGuard` port (revue 09, G5).
 */
export async function startBubbleGuard(options: { readonly personaPath: string }): Promise<AgentBubbleGuard> {
  const today = new Date().toISOString().slice(0, 10);
  const persona = readPersonaFile(await readFile(options.personaPath, 'utf8'), 'Messa', today);
  return createBubbleGuard(guardSettingsOf(persona));
}

/**
 * The hard guards every creator shares (never an AI, no meeting, no contact), without her persona's own limits.
 * @public The composition root's fallback when her persona is unreadable or is the demo one in production.
 */
export function startSharedBubbleGuard(): AgentBubbleGuard {
  return createBubbleGuard(SHARED_GUARD_SETTINGS);
}

export interface AgentModule {
  readonly name: 'agent';
}

/** Builds the module. Its dependencies arrive as arguments once the module has any (coding.md). */
export function createAgentModule(): AgentModule {
  return { name: 'agent' };
}
