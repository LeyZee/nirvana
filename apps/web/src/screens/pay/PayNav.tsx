import type { JSX } from 'react';

import { useValidateCount } from './data';

import { SubNav } from '@/shell/layout';

/**
 * Paie's screens (ADR 0024 : Quinzaine, Relevés, Primes et malus, Objectifs), those that exist today. Quinzaine carries
 * the count of statements the reader may validate now, and none while something blocks the period.
 */
export function PayNav(): JSX.Element {
  const count = useValidateCount();
  return (
    <SubNav
      label="Paie"
      items={[
        { to: '/paie/quinzaine', label: 'Quinzaine', ...(count === 0 ? {} : { count }) },
        { to: '/paie/releves', label: 'Relevés' },
      ]}
    />
  );
}
