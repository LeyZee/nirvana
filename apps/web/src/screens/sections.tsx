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

export function CreatorsPage(): JSX.Element {
  return (
    <Page>
      <PageHeader title="Créatrices" />
      <ComingSoon
        title="Sa persona, ses limites, sa voix"
        what="La fiche de chaque créatrice, rangée comme ses réglages OnlyChat : détails, comportement, stratégies, relances."
        when="Après la persona en base"
      />
    </Page>
  );
}

export function TrackingPage(): JSX.Element {
  return (
    <Page>
      <PageHeader title="Suivi" />
      <ComingSoon
        title="Ce qui est à traiter"
        what="Une file des conversations qui demandent un humain, chacune lisible en entier, sans rien envoyer d’ici."
        when="Avec la connexion Reveal"
      />
    </Page>
  );
}
