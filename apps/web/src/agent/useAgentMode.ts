import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { isSelectable, type AgentMode, type AutomaticGate } from './mode';

interface AgentControl {
  readonly mode: AgentMode;
  readonly automatic: AutomaticGate;
}

/**
 * Sample state until the server serves the mode and its gate (ADR 0019, fil Bilan): copilot, Automatique closed
 * on the live rate and the blind test. Invented figures, shown with the « Exemple » badge of the Dashboard.
 */
const SAMPLE: AgentControl = {
  mode: 'copilot',
  automatic: {
    open: false,
    missing: [{ kind: 'live_rate', value: 64, target: 80 }, { kind: 'blind_test' }],
  },
};

const KEY = ['agent', 'control'] as const;

export interface AgentModeView extends AgentControl {
  /** True while the state is the sample: nothing leaves the screen. */
  readonly isSample: boolean;
  /** Switches the agent. Automatique is refused unless the gate is open; Arrêt is confirmed by the caller. */
  readonly setMode: (mode: AgentMode) => void;
}

/**
 * The one door to the agent's mode, shared by the Dashboard control and the bar's pill: both read the same cache,
 * so a switch on one shows on the other at once.
 */
export function useAgentMode(): AgentModeView {
  const client = useQueryClient();
  const { data = SAMPLE } = useQuery({ queryKey: KEY, queryFn: () => SAMPLE, staleTime: Infinity });
  const setMode = useCallback(
    (mode: AgentMode) => {
      client.setQueryData<AgentControl>(KEY, (before = SAMPLE) =>
        isSelectable(mode, before.automatic) ? { ...before, mode } : before,
      );
    },
    [client],
  );
  return { ...data, isSample: true, setMode };
}
