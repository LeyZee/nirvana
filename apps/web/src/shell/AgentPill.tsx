import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';

import { pillOf } from '@/agent/mode';
import { useAgentMode } from '@/agent/useAgentMode';

const TITLE = {
  unavailable: 'Le serveur ne répond pas : mode de l’agent inconnu. Ouvrir le Dashboard.',
  empty: 'Aucune créatrice encore : pas d’agent à suivre. Ouvrir le Dashboard.',
} as const;

/**
 * What the agent does right now, read-only, in the bar of every screen. The control itself lives on the
 * Dashboard (one control, decided 17/10): the pill only opens it. It shows the server's mode only: « Inconnu » when
 * the server does not answer or no creator exists, nothing while it is asked.
 */
export function AgentPill(): JSX.Element {
  const view = useAgentMode();
  const stalled = view.source === 'live' ? view.stalled : null;
  const pill = pillOf(view.source === 'live' ? view.mode : null, stalled === null);
  const label = view.source === 'loading' ? 'Agent' : pill.label;
  const title =
    view.source === 'unavailable' || view.source === 'empty'
      ? TITLE[view.source]
      : stalled !== null && view.source === 'live' && view.mode !== 'stop'
        ? `Agent : ${label}, mais rien ne tourne : ${stalled}. Voir le Dashboard.`
        : `Agent : ${label}. Le changer sur le Dashboard.`;
  return (
    <Link to="/" className="nv-rail__agent" data-tone={pill.tone} title={title} aria-label={title}>
      <span
        className={`nv-dot${pill.tone === 'unknown' ? '' : ` nv-tone--${pill.tone}`}${pill.live ? ' nv-dot--live' : ''}`}
        aria-hidden="true"
      />
      {label}
    </Link>
  );
}
