import type { JSX } from 'react';

import { SubNav } from '@/shell/layout';

/** Équipe's screens (ADR 0024 : Planning, Rapports, Membres, Annonces), those that exist today. */
export function TeamNav(): JSX.Element {
  return (
    <SubNav
      label="Équipe"
      items={[
        { to: '/equipe/planning', label: 'Planning' },
        { to: '/equipe/membres', label: 'Membres' },
      ]}
    />
  );
}
