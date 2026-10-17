import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';

import { pillOf } from '@/agent/mode';
import { useAgentMode } from '@/agent/useAgentMode';

/**
 * What the agent does right now, read-only, in the bar of every screen. The control itself lives on the
 * Dashboard (one control, decided 17/10): the pill only opens it.
 */
export function AgentPill(): JSX.Element {
  const { mode } = useAgentMode();
  const pill = pillOf(mode);
  return (
    <Link
      to="/"
      className="nv-rail__agent"
      data-tone={pill.tone}
      title={`Agent : ${pill.label}. Le changer sur le Dashboard.`}
      aria-label={`Agent : ${pill.label}. Ouvrir le Dashboard pour le changer.`}
    >
      <span
        className={`nv-dot nv-tone--${pill.tone}${pill.live ? ' nv-dot--live' : ''}`}
        aria-hidden="true"
      />
      {pill.label}
    </Link>
  );
}
