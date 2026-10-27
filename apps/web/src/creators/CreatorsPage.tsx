import { useRouteContext } from '@tanstack/react-router';
import { useState, type JSX } from 'react';

import { NewCreatorForm } from './NewCreatorForm';
import { useCreators } from './api';
import { HoursSection } from './hours/HoursSection';
import { PersonaSection } from './persona/PersonaSection';
import { Segment } from './persona/fields';

import { Page, PageHeader } from '@/shell/layout';

export type CreatorTab = 'persona' | 'hours';

/**
 * Créatrices: the sheet of each creator, starting with her persona (revue 08: the persona belongs to the creator,
 * not to the settings), then for the owner alone her hours (P3-14). With several creators, a row of chips picks one;
 * with one, her name is enough. The owner adds a creator here. The tab lives in the address (`?onglet=heures`).
 */
export function CreatorsPage({
  tab,
  onTab,
}: {
  tab: CreatorTab;
  onTab: (tab: CreatorTab) => void;
}): JSX.Element {
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
  // The router keeps anyone but the owner off the hours; here they also need a creator to read them for.
  const shown: CreatorTab = isOwner && current !== undefined ? tab : 'persona';

  return (
    <Page>
      <PageHeader
        eyebrow={
          current === undefined
            ? undefined
            : `${current.displayName} · ${shown === 'hours' ? 'Heures d’activité' : 'Persona'}`
        }
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
        <>
          {isOwner && current !== undefined ? (
            <div className="hr-tabs">
              <Segment
                label="Fiche de la créatrice"
                options={[
                  { value: 'persona', label: 'Persona' },
                  { value: 'hours', label: 'Heures d’activité' },
                ]}
                value={shown}
                onChange={onTab}
              />
            </div>
          ) : null}
          {shown === 'hours' && current !== undefined ? (
            <HoursSection key={current.id} creatorId={current.id} creatorName={current.displayName} />
          ) : (
            <PersonaSection
              key={selected ?? 'none'}
              creatorId={current?.id ?? null}
              canSave={user.role === 'owner' || user.role === 'creator'}
              timezone={current?.timezone ?? null}
            />
          )}
        </>
      )}
    </Page>
  );
}
