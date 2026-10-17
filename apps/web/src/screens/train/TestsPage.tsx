import type { JSX } from 'react';

import { ComingSoon } from '@/shell/layout';

export function TestsPage(): JSX.Element {
  return (
    <ComingSoon
      title="Est-ce que l'agent progresse ?"
      what="Tous les tests rejoués à chaque version : les régressions en rouge d'abord, puis les progrès. Et le test à l'aveugle avec Messa."
      when="Avec les notes en base"
    />
  );
}
