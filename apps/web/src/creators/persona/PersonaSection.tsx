import type { Persona } from '@nirvana/contracts';
import { placeTabBarLens } from '@nirvana/design-system';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react';

import { FormContext } from './fields';
import {
  changedFields,
  hasChange,
  issueCountByTab,
  isPlaceholder,
  TABS,
  validate,
  type FieldIssue,
  type TabId,
} from './model';
import { usePersona, type PersonaSource } from './source';
import {
  AdditionalInfoTab,
  BehaviorTab,
  DetailsTab,
  FollowUpsTab,
  LimitsTab,
  NotificationsTab,
  StrategiesTab,
} from './tabs';
import './persona.css';

/**
 * Créatrices › Persona: the creator persona (ADR 0010), tab by tab like OnlyChat's creator sheet, built on
 * `PersonaSchema`. What dominates is the state of the draft and its one action, saving a new version; the tabs
 * hold the work; secondary blocks stay folded behind their summary line (docs/design/README.md).
 */
export function PersonaSection({ timezone }: { timezone: string | null }): JSX.Element {
  const { load, retry } = usePersona();

  if (load.kind !== 'ready') {
    return (
      <section className="ps-page" aria-busy={load.kind === 'loading'}>
        {load.kind === 'failed' ? (
          <div className="nv-glass ps-head">
            <p className="ps-title">La persona ne se charge pas</p>
            <p className="ps-muted">Le fichier d’exemple ne passe pas le schéma ou n’a pas pu être lu.</p>
            <button type="button" className="nv-btn nv-btn--soft ps-self-start" onClick={retry}>
              Réessayer
            </button>
          </div>
        ) : (
          <>
            <div className="nv-glass ps-head ps-skeleton" />
            <div className="nv-glass ps-panel ps-skeleton ps-skeleton--tall" />
          </>
        )}
      </section>
    );
  }
  return (
    <Editor key={load.persona.meta.version} saved={load.persona} source={load.source} timezone={timezone} />
  );
}

const tabIndex = (tab: TabId): number => TABS.findIndex((t) => t.id === tab);

function Editor({
  saved,
  source,
  timezone,
}: {
  saved: Persona;
  source: PersonaSource;
  timezone: string | null;
}): JSX.Element {
  const [draft, setDraft] = useState(saved);
  const [tab, setTab] = useState<TabId>('details');
  /** Which way the panel slides in: towards the tab picked, like a page turning. */
  const [direction, setDirection] = useState<'left' | 'right' | 'none'>('none');
  /** A field to bring into view once its tab is on screen (« Voir »). */
  const [focusField, setFocusField] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const issues = useMemo(() => validate(draft), [draft]);
  const changed = useMemo(() => changedFields(saved, draft), [saved, draft]);
  const form = useMemo(() => ({ issues, changed }), [issues, changed]);

  const select = (next: TabId): void => {
    if (next === tab) return;
    setDirection(tabIndex(next) > tabIndex(tab) ? 'right' : 'left');
    setTab(next);
  };

  useEffect(() => {
    if (focusField === null) return;
    // The field whose path holds the issue: `details.hobbies.1` is shown by the field `details.hobbies`.
    const target = [...(panelRef.current?.querySelectorAll<HTMLElement>('[data-path]') ?? [])].find((el) => {
      const path = el.dataset['path'] ?? '';
      return focusField === path || focusField.startsWith(`${path}.`);
    });
    if (target !== undefined) {
      target.closest('details')?.setAttribute('open', '');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const control =
        target.querySelector<HTMLElement>('input, textarea') ?? target.querySelector<HTMLElement>('button');
      control?.focus({ preventScroll: true });
    }
    setFocusField(null);
  }, [focusField, tab]);

  const set = <K extends TabId>(key: K, value: Persona[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const props = <K extends TabId>(key: K) => ({
    value: draft[key],
    onChange: (value: Persona[K]) => {
      set(key, value);
    },
    issues,
  });

  return (
    <FormContext.Provider value={form}>
      <section className="ps-page">
        <Head
          draft={draft}
          source={source}
          issues={issues}
          changes={changed.length}
          onReset={() => {
            setDraft(saved);
          }}
          onShowIssue={(issue) => {
            const first = issue.field.split('.')[0];
            const target = TABS.find((t) => t.id === first);
            if (target === undefined) return;
            select(target.id);
            setFocusField(issue.field);
          }}
        />

        <Tabs
          active={tab}
          errors={issueCountByTab(issues)}
          edited={(id) => hasChange(changed, id)}
          onSelect={select}
        />

        <div
          className="nv-glass ps-panel"
          role="tabpanel"
          id={`ps-panel-${tab}`}
          aria-labelledby={`ps-tab-${tab}`}
          data-direction={direction}
          ref={panelRef}
          key={tab}
        >
          {tab === 'details' ? <DetailsTab {...props('details')} timezone={timezone} /> : null}
          {tab === 'additional_info' ? <AdditionalInfoTab {...props('additional_info')} /> : null}
          {tab === 'behavior' ? <BehaviorTab {...props('behavior')} /> : null}
          {tab === 'strategies' ? <StrategiesTab {...props('strategies')} /> : null}
          {tab === 'follow_ups' ? <FollowUpsTab {...props('follow_ups')} /> : null}
          {tab === 'notifications' ? <NotificationsTab {...props('notifications')} /> : null}
          {tab === 'limits' ? <LimitsTab {...props('limits')} /> : null}
        </div>
      </section>
    </FormContext.Provider>
  );
}

const SAVE_LATER = 'Ceci est un exemple : tu peux tout modifier pour essayer, rien n’est encore enregistré.';

const plural = (n: number, one: string, many: string): string => `${String(n)} ${n > 1 ? many : one}`;

/** The first thing read: whose persona, which version, whether the draft holds, and the one action. */
function Head({
  draft,
  source,
  issues,
  changes,
  onReset,
  onShowIssue,
}: {
  draft: Persona;
  source: PersonaSource;
  issues: readonly FieldIssue[];
  changes: number;
  onReset: () => void;
  onShowIssue: (issue: FieldIssue) => void;
}): JSX.Element {
  const name = draft.details.first_name.trim();
  const first = issues[0];
  const state =
    first !== undefined
      ? { dot: 'warn', text: `${plural(issues.length, 'champ', 'champs')} à corriger` }
      : changes > 0
        ? { dot: 'ok', text: `${plural(changes, 'modification', 'modifications')}, prêt à enregistrer` }
        : { dot: 'idle', text: 'Aucune modification' };
  const created = new Date(`${draft.meta.created_at}T12:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="nv-glass ps-head">
      <div className="ps-head__top">
        <div className="ps-head__who">
          <p className="ps-head__meta">
            {source === 'example' ? (
              <span className="nv-tag nv-tag--inferred ps-example" title={SAVE_LATER}>
                Exemple
              </span>
            ) : null}
            <span>Version {draft.meta.version}</span>
            <span aria-hidden="true">·</span>
            <span>{created}</span>
          </p>
          <h2 className="ps-title" data-placeholder={name === '' || isPlaceholder(name) ? 'true' : undefined}>
            {name === '' || isPlaceholder(name) ? 'Prénom à remplir' : name}
          </h2>
        </div>
        <div className="ps-head__actions">
          {changes > 0 ? (
            <button type="button" className="nv-btn nv-btn--plain nv-btn--sm ps-pop" onClick={onReset}>
              Tout annuler
            </button>
          ) : null}
          <button
            type="button"
            className="nv-btn nv-btn--neon"
            disabled
            title={SAVE_LATER}
            aria-describedby="ps-save-later"
          >
            Enregistrer une version
          </button>
        </div>
      </div>
      <div className="ps-head__state" aria-live="polite">
        <span className="ps-dot" data-dot={state.dot} />
        <span className="ps-head__text" key={state.text}>
          {state.text}
        </span>
        {first === undefined ? null : (
          <button
            type="button"
            className="nv-btn nv-btn--plain nv-btn--sm ps-pop"
            onClick={() => {
              onShowIssue(first);
            }}
          >
            Voir le premier
          </button>
        )}
      </div>
      <p className="ps-muted" id="ps-save-later">
        {SAVE_LATER} Plus tard, chaque version enregistrée sera testée puis validée par la créatrice avant que
        l’agent s’en serve.
      </p>
    </div>
  );
}

function Tabs({
  active,
  errors,
  edited,
  onSelect,
}: {
  active: TabId;
  errors: Record<TabId, number>;
  edited: (tab: TabId) => boolean;
  onSelect: (tab: TabId) => void;
}): JSX.Element {
  const navRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const item = nav?.querySelector('[aria-selected="true"]');
    if (nav === null || !(item instanceof HTMLElement)) return;
    placeTabBarLens(nav, item, placed.current ? (thumbRef.current ?? undefined) : undefined);
    if (placed.current) item.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    placed.current = true;
  }, [active]);

  return (
    <div className="ps-tabs">
      <div className="nv-subnav ps-tabs__bar" role="tablist" aria-label="Sections de la persona" ref={navRef}>
        <span className="nv-subnav__thumb" ref={thumbRef} aria-hidden="true" />
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`ps-tab-${tab.id}`}
            aria-controls={`ps-panel-${tab.id}`}
            aria-selected={tab.id === active}
            className="nv-subnav__item ps-tabs__item"
            onClick={() => {
              onSelect(tab.id);
            }}
          >
            {tab.label}
            {errors[tab.id] > 0 ? (
              <span className="nv-subnav__count" aria-label={`${String(errors[tab.id])} à corriger`}>
                {errors[tab.id]}
              </span>
            ) : edited(tab.id) ? (
              <span className="ps-changed ps-changed--on" aria-label="modifié" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
