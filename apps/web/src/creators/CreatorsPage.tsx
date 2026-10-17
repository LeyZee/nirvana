import type { CreatorSummary } from '@nirvana/contracts';
import { useRouteContext } from '@tanstack/react-router';
import { useEffect, useState, type JSX } from 'react';

import { fetchCreators } from './api';
import { PersonaSection } from './persona/PersonaSection';

import { Page, PageHeader } from '@/shell/layout';

/**
 * Créatrices: the sheet of each creator, starting with her persona (revue 08: the persona belongs to the creator,
 * not to the settings). With several creators, a row of chips picks one; with one, her name is enough.
 */
export function CreatorsPage(): JSX.Element {
  const { user } = useRouteContext({ from: '__root__' });
  const [creators, setCreators] = useState<readonly CreatorSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchCreators().then(
      (list) => {
        if (!live) return;
        setCreators(list);
        setSelected((current) => current ?? list[0]?.id ?? null);
      },
      () => {
        // Without the list the persona still shows, as the example it is today.
      },
    );
    return () => {
      live = false;
    };
  }, []);

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
