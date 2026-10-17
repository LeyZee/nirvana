import type { JSX } from 'react';

import { ComingSoon, Page, PageHeader } from '@/shell/layout';

/* Sections whose screens come with later work: each says what it will show and what brings it. */

export function DashboardPage(): JSX.Element {
  return (
    <Page>
      <PageHeader eyebrow="Messalina sur Reveal" title="Dashboard" />
      <ComingSoon
        title="L’agent, puis ce qui t’attend"
        what="L’état de l’agent et ce qui demande ta décision d’abord, l’argent ensuite."
        when="En refonte"
      />
    </Page>
  );
}
