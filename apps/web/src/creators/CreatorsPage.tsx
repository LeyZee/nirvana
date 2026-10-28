import type { CreatorId } from '@nirvana/contracts';
import { useBlocker, useRouteContext } from '@tanstack/react-router';
import { useEffect, useRef, useState, type JSX } from 'react';

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
 * with one, her name is enough. The owner adds a creator here. The tab and the creator live in the address
 * (`?onglet=heures&creatrice=<id>`). Changes not saved are never lost silently: leaving asks first.
 */
export function CreatorsPage({
  tab,
  creatorId,
  onTab,
  onCreator,
}: {
  tab: CreatorTab;
  /** The creator in the address; one the list does not hold reads as the first of the list. */
  creatorId: CreatorId | null;
  onTab: (tab: CreatorTab) => void;
  onCreator: (id: CreatorId) => void;
}): JSX.Element {
  const { user } = useRouteContext({ from: '__root__' });
  const query = useCreators();
  const creators = query.data ?? [];
  const [adding, setAdding] = useState(false);
  /** The persona or the hours on screen hold changes not saved. */
  const [dirty, setDirty] = useState(false);
  /** An action of this page (« Ajouter une créatrice ») waiting for the confirmation that drops those changes. */
  const [pending, setPending] = useState<(() => void) | null>(null);
  // Any navigation, a chip, a tab, a link of the menu or a step back included, waits for the same confirmation; a
  // reload or a closed tab gets the browser's own.
  const blocker = useBlocker({
    shouldBlockFn: () => true,
    disabled: !dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  });
  const isOwner = user.role === 'owner';
  // With no creator yet, the owner is asked for one first: the persona needs her.
  const showForm = isOwner && (adding || (query.isSuccess && creators.length === 0));
  const current = creators.find((creator) => creator.id === creatorId) ?? creators[0];
  const selected = current?.id ?? null;
  // The router keeps anyone but the owner off the hours; here they also need a creator to read them for.
  const shown: CreatorTab = isOwner && current !== undefined ? tab : 'persona';

  const leaving = blocker.status === 'blocked' || pending !== null;
  const stay = (): void => {
    if (blocker.status === 'blocked') blocker.reset();
    setPending(null);
  };
  const leave = (): void => {
    if (blocker.status === 'blocked') blocker.proceed();
    pending?.();
    setPending(null);
  };

  const body = (): JSX.Element => {
    if (query.isError) {
      return (
        <section className="ps-page">
          <div className="nv-plate ps-head">
            <p className="ps-title">La liste des créatrices ne se charge pas</p>
            <p className="ps-muted">Le serveur ne répond pas. Réessaie dans un instant.</p>
            <button
              type="button"
              className="nv-btn nv-btn--soft ps-self-start"
              onClick={() => void query.refetch()}
            >
              Réessayer
            </button>
          </div>
        </section>
      );
    }
    if (query.isPending) {
      return (
        <section className="ps-page" aria-busy="true">
          <div className="nv-plate ps-head ps-skeleton" />
          <div className="nv-plate ps-panel ps-skeleton ps-skeleton--tall" />
        </section>
      );
    }
    if (!isOwner && creators.length === 0) {
      return (
        <section className="ps-page">
          <div className="nv-plate ps-head">
            <p className="ps-title">Aucune créatrice ne t’est confiée</p>
            <p className="ps-muted">
              Le propriétaire choisit les créatrices de chaque compte. Demande-lui de t’en confier une.
            </p>
          </div>
        </section>
      );
    }
    if (showForm) {
      return (
        <section className="ps-page">
          <NewCreatorForm
            onCreated={(creator) => {
              setAdding(false);
              onCreator(creator.id);
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
      );
    }
    return (
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
          <HoursSection
            key={current.id}
            creatorId={current.id}
            creatorName={current.displayName}
            onDirty={setDirty}
          />
        ) : (
          <PersonaSection
            key={selected ?? 'none'}
            creatorId={selected}
            canSave={user.role === 'owner' || user.role === 'creator'}
            timezone={current?.timezone ?? null}
            onDirty={setDirty}
          />
        )}
      </>
    );
  };

  return (
    <Page>
      <PageHeader
        eyebrow={
          current === undefined || showForm
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
                      if (creator.id !== selected) onCreator(creator.id);
                    }}
                  >
                    {creator.displayName}
                  </button>
                ))}
              </div>
            ) : null}
            {isOwner && !showForm && query.isSuccess ? (
              <button
                type="button"
                className="nv-btn nv-btn--soft nv-btn--sm"
                onClick={() => {
                  const add = (): void => {
                    setAdding(true);
                  };
                  if (dirty) setPending(() => add);
                  else add();
                }}
              >
                Ajouter une créatrice
              </button>
            ) : null}
          </>
        }
      />
      {leaving ? <LeaveConfirm onLeave={leave} onStay={stay} /> : null}
      {body()}
    </Page>
  );
}

/** Asked in the page, never with `confirm()` (docs/design/README.md): drop the changes not saved, or stay. */
function LeaveConfirm({ onLeave, onStay }: { onLeave: () => void; onStay: () => void }): JSX.Element {
  const stayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    stayRef.current?.focus();
  }, []);
  return (
    <div className="nv-confirm" role="alertdialog" aria-labelledby="ps-leave-text">
      <p id="ps-leave-text">
        <b>Tes modifications ne sont pas enregistrées.</b> Si tu quittes cette fiche, elles seront perdues.
      </p>
      <div className="nv-confirm__actions">
        <button type="button" className="nv-btn nv-btn--soft nv-btn--destructive" onClick={onLeave}>
          Les abandonner
        </button>
        <button type="button" className="nv-btn nv-btn--neon" ref={stayRef} onClick={onStay}>
          Rester
        </button>
      </div>
    </div>
  );
}
