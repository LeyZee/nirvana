import {
  PersonaSchema,
  type Persona,
  type PersonaCompletion,
  type PersonaVersionSummary,
} from '@nirvana/contracts';
import { placeTabBarLens } from '@nirvana/design-system';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react';

import { IntimateTab, LifestyleTab, SampleRepliesTab, TastesTab, WritingStyleTab } from './blocks';
import { FormContext } from './fields';
import {
  changedFields,
  draftCompletion,
  hasChange,
  issueCountByTab,
  isPlaceholder,
  localDay,
  nextVersion,
  NOTHING_REFUSED,
  refusedReplyIssues,
  stillRefused,
  TABS,
  validate,
  withoutPlaceholders,
  type FieldIssue,
  type RefusedReplies,
  type TabId,
} from './model';
import { activateVersion, saveVersion, usePersona, type PersonaReady } from './source';
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
  onDirty = ignore,
}: {
  /** Null while no creator is known: the example shows, nothing can be saved. */
  creatorId: string | null;
  /** The owner and the creator herself save versions; chatters read. */
  canSave: boolean;
  timezone: string | null;
  /** Told whether the draft holds changes not saved, so that leaving the page can ask first. Must be stable. */
  onDirty?: (dirty: boolean) => void;
}): JSX.Element {
  const { load, reload } = usePersona(creatorId);
  /** Said once a save went through, until the next edit. */
  const [notice, setNotice] = useState<string | null>(null);
  /** Kept here, so that a save, which starts the editor again from the new version, stays on the same tab. */
  const [tab, setTab] = useState<TabId>('details');

  if (load.kind !== 'ready') {
    return (
      <section className="ps-page" aria-busy={load.kind === 'loading'}>
        {load.kind === 'failed' ? (
          <div className="nv-plate ps-head">
            <p className="ps-title">La persona ne se charge pas</p>
            <p className="ps-muted">Le serveur ne répond pas. Réessaie dans un instant.</p>
            <button type="button" className="nv-btn nv-btn--soft ps-self-start" onClick={reload}>
              Réessayer
            </button>
          </div>
        ) : (
          <>
            <div className="nv-plate ps-head ps-skeleton" />
            <div className="nv-plate ps-panel ps-skeleton ps-skeleton--tall" />
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
      tab={tab}
      onTab={setTab}
      onDirty={onDirty}
      onEdit={() => {
        setNotice(null);
      }}
      onSaved={(version) => {
        setNotice(`Version ${version.version} enregistrée, pas encore active`);
        reload();
      }}
      onActivated={(version) => {
        setNotice(`Version ${version} marquée active`);
        reload();
      }}
      onReload={reload}
    />
  );
}

const ignore = (): void => undefined;

const tabIndex = (tab: TabId): number => TABS.findIndex((t) => t.id === tab);

const CONFLICT =
  'Une autre version a été enregistrée pendant que tu modifiais. Recharge pour repartir de la dernière : tes modifications ici seront perdues.';

const ACTIVATION_CONFLICT =
  'Sa version active a changé depuis l’ouverture de cette page, sans doute dans un autre onglet. Rien n’a été activé : recharge pour voir où elle en est.';

const READ_ONLY = 'Lecture seule : seuls le propriétaire et la créatrice modifient sa persona.';

function Editor({
  ready,
  creatorId,
  canSave,
  timezone,
  notice,
  tab,
  onTab,
  onDirty,
  onEdit,
  onSaved,
  onActivated,
  onReload,
}: {
  ready: PersonaReady;
  creatorId: string | null;
  canSave: boolean;
  timezone: string | null;
  notice: string | null;
  tab: TabId;
  onTab: (tab: TabId) => void;
  onDirty: (dirty: boolean) => void;
  onEdit: () => void;
  onSaved: (version: PersonaVersionSummary) => void;
  onActivated: (version: string) => void;
  onReload: () => void;
}): JSX.Element {
  const saved = ready.persona;
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  /** Why the last save did not go through, and whether reloading is the way out. */
  const [problem, setProblem] = useState<{ text: string; reload: boolean } | null>(null);
  /** Which way the panel slides in: towards the tab picked, like a page turning. */
  const [direction, setDirection] = useState<'left' | 'right' | 'none'>('none');
  /** A field to bring into view once its tab is on screen (« Voir »). */
  const [focusField, setFocusField] = useState<string | null>(null);
  /** The sample replies the server refused at the last save (422), shown on their field until their text changes. */
  const [refused, setRefused] = useState<RefusedReplies>(NOTHING_REFUSED);
  const panelRef = useRef<HTMLDivElement>(null);

  const issues = useMemo(() => [...validate(draft), ...stillRefused(refused, draft)], [draft, refused]);
  const completion = useMemo(() => draftCompletion(draft), [draft]);
  const changed = useMemo(() => changedFields(saved, draft), [saved, draft]);
  const form = useMemo(() => ({ issues, changed }), [issues, changed]);

  const dirty = changed.length > 0;
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(
    () => () => {
      onDirty(false);
    },
    [onDirty],
  );

  const select = (next: TabId): void => {
    if (next === tab) return;
    setDirection(tabIndex(next) > tabIndex(tab) ? 'right' : 'left');
    onTab(next);
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
    // Her zone and the new number do not go through `validate`: a refusal here is a failed save, never a throw.
    const persona = PersonaSchema.safeParse(
      withoutPlaceholders({
        ...draft,
        details: { ...draft.details, timezone: timezone ?? draft.details.timezone },
        meta: { ...draft.meta, version: nextVersion(taken), created_at: localDay() },
      }),
    );
    const result = persona.success
      ? await saveVersion(creatorId, persona.data, ready.basedOn).catch(() => ({ kind: 'failed' as const }))
      : { kind: 'failed' as const };
    setSaving(false);
    switch (result.kind) {
      case 'saved':
        onSaved(result.version);
        break;
      case 'conflict':
        setProblem({ text: CONFLICT, reload: true });
        break;
      case 'unprocessable':
        setRefused({
          issues: refusedReplyIssues(result.faults),
          replies: draft.sample_replies?.map((reply) => reply.reply) ?? [],
        });
        break;
      case 'forbidden':
        setProblem({
          text: 'Seuls le propriétaire et la créatrice peuvent enregistrer sa persona.',
          reload: false,
        });
        break;
      case 'failed':
        setProblem({
          text: 'L’enregistrement n’a pas abouti. Tes changements restent ici ; réessaie dans un instant.',
          reload: false,
        });
        break;
    }
  };

  const activate = async (): Promise<void> => {
    const version = ready.versions[0];
    if (creatorId === null || version === undefined) return;
    setSaving(true);
    setProblem(null);
    // The active version this page read: if another tab activated one since, the server refuses.
    const expectedActive = ready.versions.find((v) => v.isActive)?.id ?? null;
    const result = await activateVersion(creatorId, version.id, expectedActive).catch(
      () => 'failed' as const,
    );
    setSaving(false);
    if (result === 'activated') onActivated(version.version);
    else if (result === 'conflict') setProblem({ text: ACTIVATION_CONFLICT, reload: true });
    else {
      setProblem({
        text:
          result === 'forbidden'
            ? 'Seuls le propriétaire et la créatrice peuvent activer sa persona.'
            : 'Rien n’a été activé : Nirvana ne répond pas. Réessaie dans un instant.',
        reload: false,
      });
    }
  };

  const blocked = !canSave
    ? READ_ONLY
    : creatorId === null
      ? 'Ajoute d’abord une créatrice pour enregistrer sa persona.'
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
          readOnly={!canSave}
          issues={issues}
          completion={completion}
          changes={changed.length}
          saving={saving}
          blocked={blocked}
          canActivate={canSave && changed.length === 0 && ready.versions[0]?.isActive === false}
          notice={notice}
          problem={problem}
          onSave={() => {
            void save();
          }}
          onActivate={() => {
            void activate();
          }}
          onReload={onReload}
          onReset={() => {
            setDraft(saved);
            setProblem(null);
            setRefused(NOTHING_REFUSED);
          }}
          onShowBlock={(block) => {
            select(block);
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
          className="nv-plate ps-panel"
          role="tabpanel"
          id={`ps-panel-${tab}`}
          aria-labelledby={`ps-tab-${tab}`}
          data-direction={direction}
          ref={panelRef}
          key={tab}
        >
          {/* A chatter reads her persona: every field shows, none takes a change. */}
          <fieldset className="ps-fieldset" disabled={!canSave}>
            {tab === 'details' ? <DetailsTab {...props('details')} timezone={timezone} /> : null}
            {tab === 'lifestyle' ? <LifestyleTab {...props('lifestyle')} /> : null}
            {tab === 'tastes' ? <TastesTab {...props('tastes')} /> : null}
            {tab === 'intimate' ? <IntimateTab {...props('intimate')} /> : null}
            {tab === 'writing_style' ? <WritingStyleTab {...props('writing_style')} /> : null}
            {tab === 'sample_replies' ? <SampleRepliesTab {...props('sample_replies')} /> : null}
            {tab === 'additional_info' ? <AdditionalInfoTab {...props('additional_info')} /> : null}
            {tab === 'behavior' ? <BehaviorTab {...props('behavior')} /> : null}
            {tab === 'strategies' ? <StrategiesTab {...props('strategies')} /> : null}
            {tab === 'follow_ups' ? <FollowUpsTab {...props('follow_ups')} /> : null}
            {tab === 'notifications' ? <NotificationsTab {...props('notifications')} /> : null}
            {tab === 'limits' ? <LimitsTab {...props('limits')} /> : null}
          </fieldset>
        </div>
      </section>
    </FormContext.Provider>
  );
}

/** How long « Confirmer l'activation » waits for its second click. */
const CONFIRM_MS = 4000;

const plural = (n: number, one: string, many: string): string => `${String(n)} ${n > 1 ? many : one}`;

/** What the note under the head says: where this persona comes from and what a save does. */
function noteOf(ready: PersonaReady, known: boolean): string {
  if (!known) return 'Ceci est un exemple : tu peux tout modifier pour essayer, rien ne sera enregistré.';
  if (ready.source === 'example') {
    return 'Elle n’a pas encore de persona enregistrée. Pars de cet exemple : ton premier enregistrement deviendra sa version 0.0.1.';
  }
  const active = ready.versions.find((v) => v.isActive);
  // The agent reads her active version at each draft; without one he writes nothing (recette 28/10, G4).
  return `Chaque enregistrement crée une nouvelle version, inactive, et tu actives la nouvelle quand elle est prête. ${
    active === undefined
      ? 'Aucune version n’est active pour l’instant : l’agent n’écrit rien pour elle, et aucun message ne peut partir avant l’activation d’une version.'
      : `Version active : ${active.version}. C’est avec elle que l’agent écrit ses brouillons.`
  }`;
}

/** The first thing read: whose persona, which version, whether the draft holds, and the one action. */
function Head({
  draft,
  ready,
  known,
  readOnly,
  issues,
  completion,
  changes,
  saving,
  blocked,
  canActivate,
  notice,
  problem,
  onSave,
  onActivate,
  onReload,
  onReset,
  onShowIssue,
  onShowBlock,
}: {
  draft: Persona;
  ready: PersonaReady;
  known: boolean;
  /** Nothing can change here (a chatter): the state says so instead of what is still to fix. */
  readOnly: boolean;
  issues: readonly FieldIssue[];
  completion: PersonaCompletion;
  changes: number;
  saving: boolean;
  /** Why saving is not possible now, or null when it is. */
  blocked: string | null;
  /** Her newest version is stored, unchanged here and not yet the one the agent writes with. */
  canActivate: boolean;
  notice: string | null;
  problem: { text: string; reload: boolean } | null;
  onSave: () => void;
  onActivate: () => void;
  onReload: () => void;
  onReset: () => void;
  onShowIssue: (issue: FieldIssue) => void;
  onShowBlock: (block: TabId) => void;
}): JSX.Element {
  const name = draft.details.first_name.trim();
  /** Activating changes what the agent writes: a second click confirms it. */
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => {
      setConfirming(false);
    }, CONFIRM_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [confirming]);
  const first = issues[0];
  const current = ready.versions[0];
  const state =
    problem !== null
      ? { dot: 'warn', text: problem.text }
      : readOnly
        ? { dot: 'idle', text: READ_ONLY }
        : first !== undefined
          ? { dot: 'warn', text: `${plural(issues.length, 'champ', 'champs')} à corriger` }
          : changes > 0
            ? blocked === null
              ? {
                  dot: 'ok',
                  text: `${plural(changes, 'modification', 'modifications')}, prête à enregistrer`,
                }
              : { dot: 'idle', text: `${plural(changes, 'modification', 'modifications')} : ${blocked}` }
            : notice !== null
              ? { dot: 'ok', text: notice }
              : { dot: 'idle', text: 'Aucune modification' };
  const created = new Date(`${draft.meta.created_at}T12:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="nv-plate ps-head">
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
            {/* The example's own number and date are not hers: nothing is stored yet. */}
            {ready.source === 'example' ? null : (
              <>
                <span>Version {draft.meta.version}</span>
                <span aria-hidden="true">·</span>
                <span>{created}</span>
              </>
            )}
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
          {canActivate ? (
            <button
              type="button"
              className="nv-btn nv-btn--soft ps-pop"
              disabled={saving}
              title="Elle devient sa version active, à la place de la précédente."
              onClick={() => {
                if (confirming) {
                  setConfirming(false);
                  onActivate();
                } else setConfirming(true);
              }}
            >
              {confirming ? 'Confirmer l’activation' : `Activer la version ${draft.meta.version}`}
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
        ) : first !== undefined && problem === null && !readOnly ? (
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
      <Completion completion={completion} onShowBlock={onShowBlock} />
      <p className="ps-muted" id="ps-save-note">
        {noteOf(ready, known)}
      </p>
    </div>
  );
}

/**
 * How much of her the agent can read (`personaCompletion`): a neutral gauge, the percent in ink, and the blocks still
 * to write, each opening its tab. Nothing is required: it says what is missing, never that a save is blocked.
 */
function Completion({
  completion: { percent, missing },
  onShowBlock,
}: {
  completion: PersonaCompletion;
  onShowBlock: (block: TabId) => void;
}): JSX.Element {
  return (
    <div className="ps-completion">
      <p className="ps-completion__line">
        <span className="ps-completion__label">Complète à</span>{' '}
        <span className="ps-completion__percent">{percent} %</span>
      </p>
      <div
        className="nv-gauge ps-completion__gauge"
        role="progressbar"
        aria-label="Complétude de la persona"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        style={{ '--nv-gauge-value': `${String(percent)}%` }}
      >
        <span className="nv-gauge__fill" />
      </div>
      {missing.length === 0 ? (
        <p className="ps-muted">Tout est décrit : l’agent a tout ce qu’il lui faut pour écrire comme elle.</p>
      ) : (
        <p className="ps-completion__missing">
          <span className="ps-muted">À compléter :</span>
          {missing.map(({ block, label }, index) => (
            <span key={block}>
              <button
                type="button"
                className="ps-completion__block"
                onClick={() => {
                  onShowBlock(block);
                }}
              >
                {label}
              </button>
              {index < missing.length - 1 ? ', ' : null}
            </span>
          ))}
        </p>
      )}
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
