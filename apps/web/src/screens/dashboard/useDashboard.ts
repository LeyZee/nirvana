import { useCallback, useState } from 'react';

import type { Dashboard, Todo } from './model';
import { SAMPLE } from './sample';

import type { AgentMode, AutomaticGate } from '@/agent/mode';
import { useAgentMode } from '@/agent/useAgentMode';

export interface DashboardView {
  readonly data: Dashboard;
  /** True while the screen runs on sample data: the « Exemple » badge stays visible. */
  readonly isSample: boolean;
  readonly todos: readonly Todo[];
  /** Marks a todo as handled. On sample data it only leaves the list. */
  readonly markDone: (id: string) => void;
  /** The agent's mode and whether Automatique may open, shared with the bar's pill (`useAgentMode`). */
  readonly mode: AgentMode;
  readonly automatic: AutomaticGate;
  /** Switches the agent. On sample data nothing leaves the screen. */
  readonly setMode: (mode: AgentMode) => void;
}

/**
 * The one door of the Dashboard to its data. Sample data until `GET /v1/dashboard` (PR 3): only this hook
 * changes when the route arrives, the screen does not.
 */
export function useDashboard(): DashboardView {
  const { mode, automatic, setMode } = useAgentMode();
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const markDone = useCallback((id: string) => {
    setDone((before) => new Set(before).add(id));
  }, []);
  return {
    data: SAMPLE,
    isSample: true,
    todos: SAMPLE.todos.filter((todo) => !done.has(todo.id)),
    markDone,
    mode,
    automatic,
    setMode,
  };
}
