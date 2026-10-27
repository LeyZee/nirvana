import type { TeamMember } from '@nirvana/contracts';
import type { JSX, ReactNode } from 'react';

import { initialOf, STATUS_LABELS, STATUS_TONES } from './model';

import { Panel } from '@/shell/layout';

/** The pieces the list, the sheet and the add panel share. */

/** The member's initial, on his planning colour once he has one. */
export function Avatar({ member, large = false }: { member: TeamMember; large?: boolean }): JSX.Element {
  return (
    <span
      className={large ? 'nv-avatar tm-avatar' : 'nv-avatar nv-avatar--sm tm-avatar'}
      style={member.color === null ? undefined : { '--tm-color': member.color }}
      data-color={member.color === null ? undefined : 'true'}
      aria-hidden="true"
    >
      {initialOf(member.displayName)}
    </span>
  );
}

export function StatusPill({ member }: { member: TeamMember }): JSX.Element {
  return (
    <span className={`nv-status tm-status tm-status--${STATUS_TONES[member.status]}`}>
      <span className="nv-status__dot" />
      {STATUS_LABELS[member.status]}
    </span>
  );
}

export function Notice({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <Panel className="nv-coming">
      <div className="nv-coming__in tm-notice">
        <h2>{title}</h2>
        <p>{text}</p>
        {children}
      </div>
    </Panel>
  );
}
