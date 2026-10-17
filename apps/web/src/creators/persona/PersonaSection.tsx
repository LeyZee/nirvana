import type { Persona, PersonaVersionSummary } from '@nirvana/contracts';
import { placeTabBarLens } from '@nirvana/design-system';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react';

import { FormContext } from './fields';
import {
  changedFields,
  hasChange,
  issueCountByTab,
  isPlaceholder,
  nextVersion,
  TABS,
  validate,
  type FieldIssue,
  type TabId,
} from './model';
import { saveVersion, usePersona, type PersonaReady } from './source';
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
export function PersonaSection({
  creatorId,
  canSave,
  timezone,
}: {
  /** Null while no creator is known: the example shows, nothing can be saved. */
  creatorId: string | null;
  /** The owner and the creator herself save versions; chatters read. */
  canSave: boolean;
  timezone: string | null;
}): JSX.Element {
  const { load, reload } = usePersona(creatorId);
  /** Said once a save went through, until the next edit. */
  const [notice, setNotice] = useState<string | null>(null);

  if (load.kind !== 'ready') {
    return (
      <section className="ps-page" aria-busy={load.kind === 'loading'}>
        {load.kind === 'failed' ? (
          <div className="nv-glass ps-head">
            <p className="ps-title">La persona ne se charge pas</p>
            <p className="ps-muted">Vérifie ta connexion, puis réessaie.</p>
            <button type="button" className="nv-btn nv-btn--soft ps-self-start" onClick={reload}>
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
    <Editor
      key={load.basedOn ?? 'example'}
      ready={load}
      creatorId={creatorId}
      canSave={canSave}
      timezone={timezone}
      notice={notice}
      onEdit={() => {
        setNotice(null);
      }}
      onSaved={(version) => {
        setNotice(`Version ${version.version} enregistrée, pas encore active`);
        reload();
      }}
      onReload={reload}
    />
  );
}

const tabIndex = (tab: TabId): number => TABS.findIndex((t) => t.id === tab);

const CONFLICT =
  'Une autre version a été enregistrée pendant que tu modifiais. Recharge pour repartir de la dernière : tes modifications ici seront perdues.';

/** Today as the persona's `created_at` (YYYY-MM-DD). */
const today = (): string => new Date().toISOString().slice(0, 10);

function Editor({
  ready,
  creatorId,
  canSave,
  timezone,
  notice,
  onEdit,
  onSaved,
  onReload,
}: {
  ready: PersonaReady;
  creatorId: string | null;
  canSave: boolean;
  timezone: string | null;
  notice: string | null;
  onEdit: () => void;
  onSaved: (version: PersonaVersionSummary) => void;
  onReload: () => void;
}): JSX.Element {
  const saved = ready.persona;
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  /** Why the last save did not go through, and whether reloading is the way out. */
  const [problem, setProblem] = useState<{ text: string; reload: boolean } | null>(null);
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
    setProblem(null);
    onEdit();
  };

  const save = async (): Promise<void> => {
    if (creatorId === null) return;
    setSaving(true);
    setProblem(null);
    const taken = [...ready.versions.map((v) => v.version), draft.meta.version];
    // The model reads the zone from the persona; the code goes by the creator's, so the copy follows hers.
    const persona = {
      ...draft,
      details: { ...draft.details, timezone: timezone ?? draft.details.timezone },
      meta: { ...draft.meta, version: nextVersion(taken), created_at: today() },
    };
    const result = await saveVersion(creatorId, persona, ready.basedOn).catch(() => ({
      kind: 'failed' as const,
    }));
    setSaving(false);
    switch (result.kind) {
      case 'saved':
        onSaved(result.version);
        break;
      case 'conflict':
        setProblem({ text: CONFLICT, reload: true });
        break;
      case 'forbidden':
        setProblem({
          text: 'Seuls le propriétaire et la créatrice peuvent enregistrer sa persona.',
          reload: false,
        });
        break;
      case 'failed':
        setProblem({
          text: 'L’enregistrement n’a pas abouti. Vérifie ta connexion, puis réessaie.',
          reload: false,
        });
        break;
    }
  };

  const blocked =
    creatorId === null
      ? 'Ajoute d’abord une créatrice pour enregistrer sa persona.'
      : !canSave
        ? 'Seuls le propriétaire et la créatrice peuvent enregistrer sa persona.'
        : issues.length > 0
          ? 'Corrige d’abord les champs signalés.'
          : changed.length === 0
            ? 'Rien à enregistrer pour l’instant.'
            : null;
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
          ready={ready}
          known={creatorId !== null}
          issues={issues}
          changes={changed.length}
          saving={saving}
          blocked={blocked}
          notice={notice}
          problem={problem}
          onSave={() => {
            void save();
          }}
          onReload={onReload}
          onReset={() => {
            setDraft(saved);
            setProblem(null);
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

const plural = (n: number, one: string, many: string): string => `${String(n)} ${n > 1 ? many : one}`;

/** What the note under the head says: where this persona comes from and what a save does. */
function noteOf(ready: PersonaReady, known: boolean): string {
  if (!known) return 'Ceci est un exemple : tu peux tout modifier pour essayer, rien ne sera enregistré.';
  if (ready.source === 'example') {
    return 'Elle n’a pas encore de persona enregistrée. Pars de cet exemple : ton premier enregistrement deviendra sa version 0.0.1.';
  }
  const active = ready.versions.find((v) => v.isActive);
  return `Chaque enregistrement crée une nouvelle version, qui reste inactive tant qu’elle n’a pas été testée puis validée. ${
    active === undefined
      ? 'Aucune version n’est active pour l’instant.'
      : `Version active : ${active.version}.`
  }`;
}

/** The first thing read: whose persona, which version, whether the draft holds, and the one action. */
function Head({
  draft,
  ready,
  known,
  issues,
  changes,
  saving,
  blocked,
  notice,
  problem,
  onSave,
  onReload,
  onReset,
  onShowIssue,
}: {
  draft: Persona;
  ready: PersonaReady;
  known: boolean;
  issues: readonly FieldIssue[];
  changes: number;
  saving: boolean;
  /** Why saving is not possible now, or null when it is. */
  blocked: string | null;
  notice: string | null;
  problem: { text: string; reload: boolean } | null;
  onSave: () => void;
  onReload: () => void;
  onReset: () => void;
  onShowIssue: (issue: FieldIssue) => void;
}): JSX.Element {
  const name = draft.details.first_name.trim();
  const first = issues[0];
  const current = ready.versions[0];
  const state =
    problem !== null
      ? { dot: 'warn', text: problem.text }
      : first !== undefined
        ? { dot: 'warn', text: `${plural(issues.length, 'champ', 'champs')} à corriger` }
        : changes > 0
          ? { dot: 'ok', text: `${plural(changes, 'modification', 'modifications')}, prête à enregistrer` }
          : notice !== null
            ? { dot: 'ok', text: notice }
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
            {ready.source === 'example' ? (
              <span className="nv-tag nv-tag--inferred ps-example">Exemple</span>
            ) : (
              <span
                className="nv-tag nv-tag--declared"
                data-active={current?.isActive === true ? 'true' : undefined}
              >
                {current?.isActive === true ? 'Active' : 'Pas encore active'}
              </span>
            )}
            <span>Version {draft.meta.version}</span>
            <span aria-hidden="true">·</span>
            <span>{created}</span>
          </p>
          <h2 className="ps-title" data-placeholder={name === '' || isPlaceholder(name) ? 'true' : undefined}>
            {name === '' || isPlaceholder(name) ? 'Prénom à remplir' : name}
          </h2>
        </div>
        <div className="ps-head__actions">
          {changes > 0 && !saving ? (
            <button type="button" className="nv-btn nv-btn--plain nv-btn--sm ps-pop" onClick={onReset}>
              Tout annuler
            </button>
          ) : null}
          <button
            type="button"
            className="nv-btn nv-btn--neon"
            disabled={blocked !== null || saving}
            title={blocked ?? undefined}
            aria-describedby="ps-save-note"
            aria-busy={saving}
            onClick={onSave}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer une version'}
          </button>
        </div>
      </div>
      <div className="ps-head__state" aria-live="polite">
        <span className="ps-dot" data-dot={state.dot} />
        <span className="ps-head__text" key={state.text}>
          {state.text}
        </span>
        {problem?.reload === true ? (
          <button type="button" className="nv-btn nv-btn--plain nv-btn--sm ps-pop" onClick={onReload}>
            Recharger
          </button>
        ) : first !== undefined && problem === null ? (
          <button
            type="button"
            className="nv-btn nv-btn--plain nv-btn--sm ps-pop"
            onClick={() => {
              onShowIssue(first);
            }}
          >
            Voir le premier
          </button>
        ) : null}
      </div>
      <p className="ps-muted" id="ps-save-note">
        {noteOf(ready, known)}
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
