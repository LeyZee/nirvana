/** Public entry point of the `agent` module (ADR 0002). Other modules import this file only. */
export {
  checkVoiceOutput,
  DEFAULT_GUARD_SETTINGS,
  isBlocked,
  type GuardSettings,
  type GuardViolation,
} from './domain/guards';
export { assessTrap, screenMedia, type TrapAssessment } from './domain/traps';
export { describeSituation, isTimeZone, nextLocalTime, type Situation } from './domain/situation';
export {
  parseRejection,
  rateReport,
  REJECT_REASON_LABELS,
  REJECT_REASONS,
  suggestDestination,
  VALIDATION_TARGET,
  versionLabel,
  type Verdict,
} from './domain/calibration';
export {
  replayableTests,
  voiceExamples,
  type CalibrationRecord,
  type RatedMoment,
} from './infra/calibration-record';
export { createJsonlCalibrationStore } from './infra/jsonl-calibration-store';

export interface AgentModule {
  readonly name: 'agent';
}

/** Builds the module. Its dependencies arrive as arguments once the module has any (coding.md). */
export function createAgentModule(): AgentModule {
  return { name: 'agent' };
}
