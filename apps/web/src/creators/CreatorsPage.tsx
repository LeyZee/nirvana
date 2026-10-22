import { useRouteContext } from '@tanstack/react-router';
import { useState, type JSX } from 'react';

import { NewCreatorForm } from './NewCreatorForm';
import { useCreators } from './api';
import { PersonaSection } from './persona/PersonaSection';

import { Page, PageHeader } from '@/shell/layout';

/**
 * Créatrices: the sheet of each creator, starting with her persona (revue 08: the persona belongs to the creator,
 * not to the settings). With several creators, a row of chips picks one; with one, her name is enough. The owner
 * adds a creator here.
 */
export function CreatorsPage(): JSX.Element {
  const { user } = useRouteContext({ from: '__root__' });
  // Without the list the persona still shows, as the example it is today.
  const query = useCreators();
  const creators = query.data ?? [];
  const [picked, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const isOwner = user.role === 'owner';
  // With no creator yet, the owner is asked for one first: the persona needs her.
  const showForm = isOwner && (adding || (query.isSuccess && creators.length === 0));
  const selected = picked ?? creators[0]?.id ?? null;

  const current = creators.find((creator) => creator.id === selected);

  return (
    <Page>
      <PageHeader
        eyebrow={current === undefined ? undefined : `${current.displayName} · Persona`}
        title="Créatrices"
        actions={
          <>
            {creators.length > 1 ? (
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
            ) : null}
            {isOwner && !showForm ? (
              <button
                type="button"
                className="nv-btn nv-btn--soft nv-btn--sm"
                onClick={() => {
                  setAdding(true);
                }}
              >
                Ajouter une créatrice
              </button>
            ) : null}
          </>
        }
      />
      {showForm ? (
        <section className="ps-page">
          <NewCreatorForm
            onCreated={(creator) => {
              setSelected(creator.id);
              setAdding(false);
            }}
            onCancel={
              creators.length === 0
                ? null
                : () => {
                    setAdding(false);
                  }
            }
          />
        </section>
      ) : (
        <PersonaSection
          key={selected ?? 'none'}
          creatorId={current?.id ?? null}
          canSave={user.role === 'owner' || user.role === 'creator'}
          timezone={current?.timezone ?? null}
        />
      )}
    </Page>
  );
}
