import { useRef, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { followedOf, useFollowedCreatorId } from '@/agent/followed';
import { useCreators } from '@/creators/api';

/** Arrow keys of the radio group and the way they move. */
const STEPS: Readonly<Record<string, 1 | -1>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Whose agent the Dashboard shows and pilots, when the account sees several creators: the chips of Créatrices, one per
 * creator. The choice is shared with the bar's pill and Suivi's « À traiter » (`agent/followed.ts`). Nothing with one
 * creator or none: her name above is enough.
 */
export function CreatorPicker(): JSX.Element | null {
  const creators = useCreators().data ?? [];
  const { chosen, follow } = useFollowedCreatorId();
  const ref = useRef<HTMLDivElement>(null);
  if (creators.length < 2) return null;

  const current = followedOf(creators, chosen)?.id;
  const index = creators.findIndex((creator) => creator.id === current);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = creators[(Math.max(0, index) + step + creators.length) % creators.length];
    if (next === undefined) return;
    ref.current?.querySelector<HTMLButtonElement>(`[data-creator="${next.id}"]`)?.focus();
    follow(next.id);
  };

  return (
    <div
      className="db-creators"
      role="radiogroup"
      aria-label="Créatrice suivie"
      ref={ref}
      onKeyDown={onKeyDown}
    >
      {creators.map((creator, i) => (
        <button
          key={creator.id}
          type="button"
          role="radio"
          className="nv-chip"
          data-creator={creator.id}
          aria-checked={creator.id === current}
          tabIndex={i === Math.max(0, index) ? 0 : -1}
          onClick={() => {
            follow(creator.id);
          }}
        >
          {creator.displayName}
        </button>
      ))}
    </div>
  );
}
