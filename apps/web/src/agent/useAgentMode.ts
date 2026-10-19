import { useLiveDashboard } from './live';
import type { AgentMode, AutomaticGate } from './mode';

/**
 * The agent's mode as the server gives it, or why there is none: `loading` until it answers, `unavailable` when it
 * fails, `empty` when no creator exists yet. Nothing here makes a mode up.
 */
export type AgentModeView =
  | { readonly source: 'live'; readonly mode: AgentMode; readonly automatic: AutomaticGate }
  | { readonly source: 'loading' | 'unavailable' | 'empty' };

/**
 * The one door to the agent's mode for the bar's pill: it reads the same `GET /v1/dashboard` as the Dashboard, so
 * both always say the same thing. No route writes the mode yet (`PUT /v1/agent/mode`, PR à part).
 */
export function useAgentMode(): AgentModeView {
  const live = useLiveDashboard();
  if (live.kind === 'live') return { source: 'live', mode: live.data.mode, automatic: live.data.automatic };
  return { source: live.kind };
}
