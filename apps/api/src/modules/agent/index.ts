/** Public entry point of the `agent` module (ADR 0002). Other modules import this file only. */
export {
  checkVoiceOutput,
  DEFAULT_GUARD_SETTINGS,
  isBlocked,
  type GuardSettings,
  type GuardViolation,
} from './domain/guards';
export { assessTrap, screenMedia, type TrapAssessment } from './domain/traps';

export interface AgentModule {
  readonly name: 'agent';
}

/** Builds the module. Its dependencies arrive as arguments once the module has any (coding.md). */
export function createAgentModule(): AgentModule {
  return { name: 'agent' };
}
