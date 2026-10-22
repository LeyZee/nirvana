import type { JSX } from 'react';

import { eur } from './logic';
import type { Fan } from './model';
import { Chevron, type FloatingTip } from './parts';

/** Level 3: the best fans by what they spent, split agent / chatters. Each one opens the reader. */
export function TopFans({
  fans,
  tip,
  onOpen,
}: {
  fans: readonly Fan[];
  tip: FloatingTip;
  onOpen: (fan: Fan) => void;
}): JSX.Element {
  const top = fans.filter((fan) => fan.spent > 0).slice(0, 4);
  const max = Math.max(1, ...top.map((fan) => fan.spent));
  if (top.length === 0) {
    return <p className="db-pending nv-plate">Aucun achat observé sur la période.</p>;
  }
  return (
    <div className="nv-plate db-fans">
      {top.map((fan) => (
        <button
          key={fan.id}
          type="button"
          className="db-fan nv-tap"
          onClick={() => {
            onOpen(fan);
          }}
        >
          <span className="nv-avatar" aria-hidden="true">
            {fan.name.slice(0, 1)}
          </span>
          <span className="db-fan__who">
            <span className="db-fan__name">{fan.name}</span>
            <span className="db-fan__line">{fan.line}</span>
          </span>
          {/* Every bar starts at the same place: widths are shares of the best fan's total. Data colours, not the
              neon: a fan's spend is no urgency (the agent's part takes the split's first colour). */}
          <span
            className="nv-split"
            {...tip.bind({
              title: fan.name,
              rows: [
                ['Vendu par l’agent', eur(fan.byAgent)],
                ['Vendu par un chatteur', eur(fan.spent - fan.byAgent)],
              ],
            })}
          >
            <i className="nv-split__part" style={{ '--nv-w': `${String((fan.byAgent / max) * 100)}%` }} />
            <i
              className="nv-split__part"
              style={{
                '--nv-w': `${String(((fan.spent - fan.byAgent) / max) * 100)}%`,
                '--_c': 'var(--nv-data-2)',
              }}
            />
          </span>
          <span className="db-fan__spent">{eur(fan.spent)}</span>
          <Chevron className="db-chev" />
        </button>
      ))}
    </div>
  );
}
