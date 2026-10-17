import { useRouteContext } from '@tanstack/react-router';
import { useState, type JSX } from 'react';

import { useCreators } from './api';
import { PersonaSection } from './persona/PersonaSection';

import { Page, PageHeader } from '@/shell/layout';

/**
 * Créatrices: the sheet of each creator, starting with her persona (revue 08: the persona belongs to the creator,
 * not to the settings). With several creators, a row of chips picks one; with one, her name is enough.
 */
export function CreatorsPage(): JSX.Element {
  const { user } = useRouteContext({ from: '__root__' });
  // Without the list the persona still shows, as the example it is today.
  const creators = useCreators().data ?? [];
  const [picked, setSelected] = useState<string | null>(null);
  const selected = picked ?? creators[0]?.id ?? null;

  const current = creators.find((creator) => creator.id === selected);

  return (
    <Page>
      <PageHeader
        eyebrow={current === undefined ? undefined : `${current.displayName} · Persona`}
        title="Créatrices"
        actions={
          creators.length > 1 ? (
            <div className="ps-chips" role="radiogroup" aria-label="Créatrice">
              {creators.map((creator) => (
                <button
                  key={creator.id}
                  type="button"
                  role="radio"
                  className="nv-chip"
                  aria-checked={creator.id === selected}
                  onClick={() => {
                    setSelected(creator.id);
                  }}
                >
                  {creator.displayName}
                </button>
              ))}
            </div>
          ) : undefined
        }
      />
      <PersonaSection
        key={selected ?? 'none'}
        creatorId={current?.id ?? null}
        canSave={user.role === 'owner' || user.role === 'creator'}
        timezone={current?.timezone ?? null}
      />
    </Page>
  );
}
