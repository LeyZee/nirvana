import type { JSX } from 'react';

import { SubNav } from '@/shell/layout';

/**
 * Suivi's views (ADR 0024, P4-01): the conversations, and the history of the alerts beside them, a sub-view and no new
 * tab of the rail. Without a count: the history is no inbox, what asks for a hand is in « À traiter ».
 */
export function SuiviNav(): JSX.Element {
  return (
    <SubNav
      label="Suivi"
      items={[
        { to: '/suivi', label: 'Conversations' },
        { to: '/suivi/alertes', label: 'Historique des alertes' },
      ]}
    />
  );
}
