import { useMemo } from 'react';

import { fromApi } from './live';
import type { Dashboard, Period } from './model';
import { SAMPLE } from './sample';

import { useLiveDashboard } from '@/agent/live';
import type { AgentMode, AutomaticGate } from '@/agent/mode';

/** The sample's agent: copilot, Automatique closed on the live rate and the blind test. Invented figures. */
const SAMPLE_AGENT = {
  mode: 'copilot',
  automatic: {
    open: false,
    missing: [{ kind: 'live_rate', value: 64, target: 80 }, { kind: 'blind_test' }],
  },
} as const satisfies { mode: AgentMode; automatic: AutomaticGate };

/**
 * What the Dashboard can show:
 * - `loading` until the server answers;
 * - `live`, the server's data;
 * - `offline`, the server does not answer: no figure, nothing to act on, only that sentence;
 * - `sample`, no creator exists yet (first launch): the sample, marked « Exemple », whose control pilots nothing.
 */
export type DashboardView =
  | { readonly status: 'loading' }
  | { readonly status: 'offline'; readonly creatorName: string | null }
  | {
      readonly status: 'live' | 'sample';
      /** The creator the control writes for; null on the sample, which pilots nothing. */
      readonly creatorId: string | null;
      /** An operator's global switch holds every creator: Arrêt whatever she picks, until it is lifted. */
      readonly globalStop: boolean;
      /** When the server last answered (0 on the sample): a notice about a change holds until the next answer. */
      readonly readAt: number;
      readonly data: Dashboard;
      readonly mode: AgentMode;
      readonly automatic: AutomaticGate;
    };

/** The one door of the Dashboard to its data: `GET /v1/dashboard` for the period. */
export function useDashboard(period: Period, forCreator = false): DashboardView {
  const live = useLiveDashboard(period);
  const liveData = live.kind === 'live' ? live.data : undefined;
  const data = useMemo(
    () => (liveData === undefined ? null : fromApi(liveData, forCreator)),
    [liveData, forCreator],
  );
  switch (live.kind) {
    case 'loading':
      return { status: 'loading' };
    case 'unavailable':
      return { status: 'offline', creatorName: live.creatorName };
    case 'empty':
      return {
        status: 'sample',
        creatorId: null,
        globalStop: false,
        readAt: 0,
        data: SAMPLE,
        ...SAMPLE_AGENT,
      };
    case 'live':
      // The period's own read carries the mode too: the control follows the page it is on.
      return {
        status: 'live',
        creatorId: live.data.creator.id,
        globalStop: live.data.globalStop,
        readAt: live.readAt,
        data: data ?? fromApi(live.data),
        mode: live.data.mode,
        automatic: live.data.automatic,
      };
  }
}
