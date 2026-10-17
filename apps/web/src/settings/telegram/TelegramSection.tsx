import type {
  TelegramBot,
  TelegramChatId,
  TelegramDelivery,
  TelegramOverview,
  TelegramRoute,
  TelegramTopic,
} from '@nirvana/contracts';
import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react';

import { ReauthRequired } from '../services/api';

import { BotSheet, type SheetMode } from './BotSheet';
import { GroupPreview, PreviewMessage } from './Preview';
import { Reauth } from './Reauth';
import { fetchAlertKeywords, fetchDeliveries, fetchOverview, removeBot, saveRoutes, sendTest } from './api';
import {
  ALERT_TOPICS,
  botLine,
  chatChoices,
  chatLine,
  clockLabel,
  coverOf,
  deliveryLabel,
  healthOf,
  hourLabel,
  initials,
  plural,
  routeState,
  toggleRoute,
  topicsOfChat,
  TOPICS,
  type ChatChoice,
  type Scope,
} from './model';
import './telegram.css';

/** The page refreshes on its own: a bot removed from a group turns orange without a reload. */
const REFRESH_MS = 30_000;
const OFFLINE = 'Nirvana ne répond pas. Réessaie dans un instant.';

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; overview: TelegramOverview };
type Tab = 'alerts' | 'sales' | 'keywords' | 'validations' | 'bots';

const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'alerts', label: 'Alertes' },
  { key: 'sales', label: 'Ventes' },
  { key: 'keywords', label: 'Mots-clés' },
  { key: 'validations', label: 'Validations' },
  { key: 'bots', label: 'Bots et groupes' },
];

/**
 * Réglages › Telegram (fiche P3-07, ADR 0020): who gets which alert, in which group, through which bot. One tab per
 * kind of message, plus the bots. Nothing on this page ever shows a token or a fan's words.
 */
export function TelegramSection(): JSX.Element {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [deliveries, setDeliveries] = useState<readonly TelegramDelivery[]>([]);
  const [tab, setTab] = useState<Tab>('alerts');
  const [scope, setScope] = useState<Scope>('all');
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  /** Only the latest refresh may land: an older answer arriving late would show a stale state. */
  const latest = useRef(0);
  /** Route saves run one after the other, each with the version the previous one returned. */
  const saving = useRef<Promise<void>>(Promise.resolve());
  const version = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    latest.current += 1;
    const ticket = latest.current;
    try {
      const overview = await fetchOverview();
      if (ticket !== latest.current) return;
      version.current = overview.version;
      setLoad({ kind: 'ready', overview });
      setNow(new Date());
    } catch {
      if (ticket !== latest.current) return;
      setLoad((current) => (current.kind === 'ready' ? current : { kind: 'failed' }));
    }
    fetchDeliveries().then(setDeliveries, () => undefined);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (sheet !== null) return undefined;
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [refresh, sheet]);

  /** Shows the new routing at once, then saves it; a refusal puts back what the server holds. */
  const applyRoutes = useCallback(
    (next: TelegramRoute[]): void => {
      setNotice(null);
      setLoad((current) =>
        current.kind === 'ready'
          ? { kind: 'ready', overview: { ...current.overview, routes: next } }
          : current,
      );
      saving.current = saving.current.then(async () => {
        try {
          const result = await saveRoutes(version.current, next);
          if (result.ok) {
            version.current = result.value.version;
            return;
          }
          setNotice(
            result.refusal.kind === 'routes_version_conflict'
              ? 'Quelqu’un a changé ces réglages en même temps que toi. Voici les siens : refais ton choix si besoin.'
              : result.refusal.message,
          );
        } catch {
          setNotice(`Le choix n’a pas été enregistré. ${OFFLINE}`);
        }
        await refresh();
      });
    },
    [refresh],
  );

  const closeSheet = useCallback(() => {
    setSheet(null);
    void refresh();
  }, [refresh]);

  if (load.kind !== 'ready') {
    return (
      <section className="tg-page" aria-busy={load.kind === 'loading'}>
        {load.kind === 'failed' ? (
          <div className="nv-glass tg-cover" data-state="bad">
            <div>
              <p className="tg-cover__title">Telegram ne répond pas</p>
              <p className="tg-cover__sub">
                Nirvana n’a pas pu lire les bots et les groupes. Réessaie dans un instant.
              </p>
              <button type="button" className="nv-btn nv-btn--soft tg-top" onClick={() => void refresh()}>
                Réessayer
              </button>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  const { overview } = load;
  const choices = chatChoices(overview.bots);
  const toggle = (topic: TelegramTopic, chatId: TelegramChatId, at: Scope = scope): void => {
    applyRoutes(toggleRoute(overview.routes, at, topic, chatId));
  };
  const openAdd = (): void => {
    setSheet({ kind: 'add' });
  };

  return (
    <section className="tg-page">
      <div className="tg-head">
        <p className="tg-lede">
          Ce qui mérite ton attention arrive dans tes groupes Telegram. Les messages des fans ne quittent
          jamais Nirvana.
        </p>
        <button type="button" className="nv-btn nv-btn--neon" onClick={openAdd}>
          Ajouter un bot
        </button>
      </div>

      <HealthStrip overview={overview} />

      <TabBar tab={tab} onTab={setTab} />

      <div
        className="tg-panel"
        role="tabpanel"
        id={`tg-panel-${tab}`}
        aria-labelledby={`tg-tab-${tab}`}
        key={tab}
      >
        {tab === 'alerts' ? (
          <AlertsTab
            overview={overview}
            choices={choices}
            deliveries={deliveries}
            scope={scope}
            onScope={setScope}
            onToggle={toggle}
            onAdd={openAdd}
          />
        ) : tab === 'sales' ? (
          <SalesTab
            overview={overview}
            choices={choices}
            scope={scope}
            onScope={setScope}
            onToggle={toggle}
            onAdd={openAdd}
          />
        ) : tab === 'keywords' ? (
          <KeywordsTab overview={overview} choices={choices} onToggle={toggle} onAdd={openAdd} />
        ) : tab === 'validations' ? (
          <ValidationsTab
            overview={overview}
            choices={choices}
            scope={scope}
            onScope={setScope}
            onToggle={toggle}
            onAdd={openAdd}
          />
        ) : (
          <BotsTab
            overview={overview}
            now={now}
            onSheet={setSheet}
            onChanged={() => void refresh()}
            onAdd={openAdd}
          />
        )}
      </div>

      {notice === null ? null : (
        <p className="tg-notice" role="alert">
          {notice}
        </p>
      )}

      {sheet === null ? null : (
        <BotSheet mode={sheet} onChanged={() => void refresh()} onClose={closeSheet} />
      )}
    </section>
  );
}

function HealthStrip({ overview }: { overview: TelegramOverview }): JSX.Element {
  const health = healthOf(overview);
  return (
    <div className="nv-glass tg-health" aria-label="État de Telegram">
      <span className="tg-health__item">
        <span className="tg-state-dot" data-tone={health.tone} />
        <b>{health.label}</b>
      </span>
      <span className="tg-health__sep" />
      <span className="tg-health__item">
        <b>{health.botCount}</b> {health.botCount > 1 ? 'bots' : 'bot'}
      </span>
      <span className="tg-health__item">
        <b>{health.groupCount}</b> {health.groupCount > 1 ? 'groupes' : 'groupe'}
      </span>
      {health.lastSentAt === null ? null : (
        <>
          <span className="tg-health__sep" />
          <span className="tg-health__item">
            Dernier envoi <b>{hourLabel(health.lastSentAt)}</b>
          </span>
        </>
      )}
    </div>
  );
}

/** Tabs with the arrow keys, Home and End (WAI-ARIA tabs pattern, automatic activation). */
function TabBar({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }): JSX.Element {
  const onKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const at = TABS.findIndex((t) => t.key === tab);
    const to =
      event.key === 'ArrowRight'
        ? (at + 1) % TABS.length
        : event.key === 'ArrowLeft'
          ? (at - 1 + TABS.length) % TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? TABS.length - 1
              : null;
    const next = to === null ? undefined : TABS[to];
    if (next === undefined) return;
    event.preventDefault();
    onTab(next.key);
    document.getElementById(`tg-tab-${next.key}`)?.focus();
  };
  return (
    <div className="nv-glass tg-tabs" role="tablist" aria-label="Sections Telegram" onKeyDown={onKey}>
      {TABS.map((t) => (
        <button
          key={t.key}
          id={`tg-tab-${t.key}`}
          type="button"
          role="tab"
          className="tg-tab"
          aria-selected={t.key === tab}
          aria-controls={`tg-panel-${t.key}`}
          tabIndex={t.key === tab ? 0 : -1}
          onClick={(event) => {
            onTab(t.key);
            // On a phone the bar scrolls sideways: the chosen tab comes fully into view.
            event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }}
        >
          <TabIcon tab={t.key} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

function TabIcon({ tab }: { tab: Tab }): JSX.Element {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (tab) {
    case 'alerts':
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
        </svg>
      );
    case 'sales':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.7.8-2.7 2 0 2.9 5.7 1.6 5.7 4.4 0 1.2-1.2 2-2.9 2-1.3 0-2.4-.5-2.9-1.5M12 6v1.8M12 16.2V18" />
        </svg>
      );
    case 'keywords':
      return (
        <svg {...common}>
          <path d="M4 7h10M4 12h7M4 17h9" />
          <circle cx="17.5" cy="14.5" r="3" />
          <path d="M19.6 16.6 22 19" />
        </svg>
      );
    case 'validations':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="5" />
          <path d="M8.5 12.2l2.4 2.4 4.6-5" />
        </svg>
      );
    case 'bots':
      return <TelegramGlyph />;
  }
}

function TelegramGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.4 4.3 2.9 11.4c-1.2.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.4-1.3z" />
    </svg>
  );
}

function InfoGlyph(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

interface RoutingProps {
  readonly overview: TelegramOverview;
  readonly choices: readonly ChatChoice[];
  readonly onToggle: (topic: TelegramTopic, chatId: TelegramChatId, at?: Scope) => void;
  readonly onAdd: () => void;
}

interface ScopedProps extends RoutingProps {
  readonly scope: Scope;
  readonly onScope: (scope: Scope) => void;
}

/** « Toutes les créatrices », then one chip per creator. */
function ScopePicker({
  overview,
  scope,
  onScope,
}: {
  overview: TelegramOverview;
  scope: Scope;
  onScope: (scope: Scope) => void;
}): JSX.Element {
  return (
    <div className="tg-scope" role="radiogroup" aria-label="Créatrice">
      <button
        type="button"
        role="radio"
        className="nv-chip"
        aria-checked={scope === 'all'}
        onClick={() => {
          onScope('all');
        }}
      >
        Toutes les créatrices
      </button>
      {overview.coverage.map((creator) => (
        <button
          key={creator.creatorId}
          type="button"
          role="radio"
          className="nv-chip"
          aria-checked={scope === creator.creatorId}
          onClick={() => {
            onScope(creator.creatorId);
          }}
        >
          {creator.displayName}
        </button>
      ))}
    </div>
  );
}

function scopeName(overview: TelegramOverview, scope: Scope): string | null {
  return scope === 'all' ? null : (overview.coverage.find((c) => c.creatorId === scope)?.displayName ?? null);
}

/** The groups a topic goes to, as chips; a creator's line shows the « toutes » groups as already on. */
function ChatChips({
  overview,
  choices,
  scope,
  topic,
  onToggle,
  onAdd,
}: RoutingProps & { scope: Scope; topic: TelegramTopic }): JSX.Element {
  const reachable = choices.filter((c) => c.isReachable);
  if (reachable.length === 0) {
    return (
      <button type="button" className="nv-btn nv-btn--plain nv-btn--sm tg-self-start" onClick={onAdd}>
        Mettre un bot dans un groupe
      </button>
    );
  }
  return (
    <div className="tg-chips" role="group" aria-label={`Groupes pour ${TOPICS[topic].label}`}>
      {reachable.map(({ chat }) => {
        const state = routeState(overview.routes, scope, topic, chat.id);
        return (
          <button
            key={chat.id}
            type="button"
            role="checkbox"
            className="tg-gchip"
            aria-checked={state !== 'off'}
            data-inherited={state === 'inherited'}
            disabled={state === 'inherited'}
            title={state === 'inherited' ? 'Déjà reçu pour toutes les créatrices' : undefined}
            onClick={() => {
              onToggle(topic, chat.id, scope);
            }}
          >
            <span className="tg-av">{initials(chat.title)}</span>
            <span>{chat.title}</span>
          </button>
        );
      })}
    </div>
  );
}

function RoutingList({
  topics,
  scope,
  ...routing
}: RoutingProps & { topics: readonly TelegramTopic[]; scope: Scope }): JSX.Element {
  return (
    <div className="nv-glass">
      <div className="nv-list">
        {topics.map((topic) => (
          <div className="tg-route" key={topic}>
            <div className="tg-lvl">
              <b>
                <span className="tg-dot" data-topic={topic} />
                {TOPICS[topic].label}
              </b>
              <small>{TOPICS[topic].sub}</small>
            </div>
            <ChatChips {...routing} scope={scope} topic={topic} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertsTab({
  deliveries,
  scope,
  onScope,
  ...routing
}: ScopedProps & { deliveries: readonly TelegramDelivery[] }): JSX.Element {
  const { overview } = routing;
  const cover = coverOf(overview);
  const name = scopeName(overview, scope);
  const alerts = deliveries.filter(
    (d) => d.topic === 'urgent' || d.topic === 'important' || d.topic === 'info',
  );
  const shown = alerts.slice(0, 8);
  const failed = shown.filter((d) => !deliveryLabel(d).isOk).length;
  return (
    <>
      <section className="nv-glass tg-cover" data-state={cover.isOk ? 'ok' : 'bad'} aria-live="polite">
        <div className="tg-cover__orb">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
            {cover.isOk ? <path d="M8.5 12l2.5 2.5 4.5-5" /> : <path d="M12 8v5M12 16h.01" />}
          </svg>
        </div>
        <div>
          <p className="tg-cover__title">{cover.title}</p>
          <p className="tg-cover__sub">{cover.sub}</p>
        </div>
      </section>

      <section>
        <p className="tg-eyebrow">
          Qui reçoit quoi{' '}
          <span>{name === null ? 'Pour toutes les créatrices' : `Pour ${name}, en plus de « toutes »`}</span>
        </p>
        <ScopePicker overview={overview} scope={scope} onScope={onScope} />
        <RoutingList {...routing} topics={ALERT_TOPICS} scope={scope} />
      </section>

      <GroupPreview
        group="Astreinte"
        heading="Pensé pour être lu à 3 h du matin"
        points={[
          'Le niveau, la créatrice, la raison, et un seul lien.',
          'Quand quelqu’un prend la main, le message se met à jour pour tout le groupe.',
          'Le retour à la normale arrive en réponse, sans sonner.',
          'Plusieurs alertes d’un coup sont regroupées en un message.',
        ]}
      >
        <PreviewMessage from="Nirvana Alertes" time="02:38" edit="✓ Pris en main par Lucas">
          🔴 <b>URGENT · Créatrice</b>
          <br />
          Possible mineur sur une photo envoyée par un fan. L’agent n’écrit plus à ce fan et attend un humain.
          <br />
          <span className="tg-msg__link">Ouvrir la conversation</span>
        </PreviewMessage>
        <PreviewMessage from="Nirvana Alertes" time="07:52" isSilent quote="La session Reveal a expiré">
          ✓ Résolu : la session est revenue.
        </PreviewMessage>
      </GroupPreview>

      {shown.length === 0 ? null : (
        <section>
          <details className="nv-disclosure nv-glass">
            <summary>
              <span className="nv-disclosure__title">Dernières alertes</span>
              <span className="nv-disclosure__sum">
                {failed === 0
                  ? `${plural(shown.length, 'alerte')}, toutes livrées`
                  : `${plural(shown.length, 'alerte')}, ${String(failed)} à regarder`}
              </span>
            </summary>
            <div className="nv-disclosure__body">
              <div className="nv-list">
                {shown.map((delivery) => {
                  const label = deliveryLabel(delivery);
                  return (
                    <div className="tg-log" key={delivery.id}>
                      <time dateTime={delivery.createdAt}>{clockLabel(delivery.createdAt)}</time>
                      <span className="tg-dot" data-topic={delivery.topic} />
                      <p>
                        {delivery.summary}
                        <small> · {delivery.chatTitle}</small>
                      </p>
                      <em data-ok={label.isOk}>{label.text}</em>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>
        </section>
      )}
    </>
  );
}

/** What a tab whose events do not exist yet says, plainly: the routing is ready, the messages come later. */
function Coming({ children }: { children: string }): JSX.Element {
  return (
    <div className="tg-callout">
      <InfoGlyph />
      <span>{children}</span>
    </div>
  );
}

function SalesTab({ scope, onScope, ...routing }: ScopedProps): JSX.Element {
  return (
    <>
      <Coming>
        Les ventes arrivent avec la connexion à Reveal : Nirvana annoncera chaque vente dès que Reveal
        confirme le paiement. Tu peux déjà choisir le groupe.
      </Coming>
      <section>
        <p className="tg-eyebrow">Annoncer les ventes</p>
        <ScopePicker overview={routing.overview} scope={scope} onScope={onScope} />
        <RoutingList {...routing} topics={['sale']} scope={scope} />
      </section>
      <GroupPreview
        group="Ventes"
        heading="Sans son, sans le fan"
        points={[
          'Le montant, le pack, qui a vendu. Jamais le pseudo du fan.',
          'Une vente n’est annoncée qu’une fois le paiement confirmé par Reveal.',
          'Les ventes arrivent sans son : elles ne réveillent personne la nuit.',
          'Un groupe à part évite de noyer les alertes.',
        ]}
      >
        <PreviewMessage from="Nirvana Ventes" time="22:47" isSilent>
          💰 <b>Vente · Créatrice · 45,00 €</b>
          <br />
          Pack « Soirée » payé, vendu par l’agent.
          <br />
          <span className="tg-msg__link">Voir la conversation</span>
        </PreviewMessage>
      </GroupPreview>
    </>
  );
}

function KeywordsTab(routing: RoutingProps): JSX.Element {
  const { overview } = routing;
  const creators = overview.coverage;
  return (
    <>
      <div className="tg-callout">
        <InfoGlyph />
        <span>
          Quand un fan écrit un de ces mots, l’agent s’arrête pour ce fan et le groupe reçoit{' '}
          <b>le mot trouvé et un lien</b>, jamais le message. Les mots se règlent dans la fiche Persona de
          chaque créatrice.
        </span>
      </div>
      {creators.map((creator) => (
        <CreatorKeywords key={creator.creatorId} creatorId={creator.creatorId} name={creator.displayName} />
      ))}
      <section>
        <p className="tg-eyebrow">
          Où prévenir <span>Pour toutes les créatrices</span>
        </p>
        <RoutingList {...routing} topics={['keyword']} scope="all" />
        <p className="tg-hint tg-pad">
          L’arrêt de l’agent part déjà dans le groupe Important. Le message « mot-clé » dédié arrive avec la
          prochaine version de l’agent.
        </p>
      </section>
      <GroupPreview
        group="Astreinte"
        heading="Le mot, jamais le message"
        points={[
          'L’agent n’écrit plus à ce fan tant qu’un humain n’a pas repris.',
          'Majuscules et accents sont ignorés.',
          'Les urgences (mineur, détresse…) sont déjà détectées sans mot-clé.',
        ]}
      >
        <PreviewMessage from="Nirvana Alertes" time="01:48">
          🔎 <b>Mot-clé · Créatrice</b>
          <br />
          « remboursement » dans un message de fan. L’agent s’est arrêté pour ce fan.
          <br />
          <span className="tg-msg__link">Ouvrir la conversation</span>
        </PreviewMessage>
      </GroupPreview>
    </>
  );
}

type Words =
  { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; words: readonly string[]; isActive: boolean };

/** Read-only: her `alert_keywords`, from her newest persona version. */
function CreatorKeywords({
  creatorId,
  name,
}: {
  creatorId: TelegramOverview['coverage'][number]['creatorId'];
  name: string;
}): JSX.Element {
  const [words, setWords] = useState<Words>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    fetchAlertKeywords(creatorId).then(
      (list) => {
        if (live) setWords({ kind: 'ready', words: list.words, isActive: list.isActive });
      },
      () => {
        if (live) setWords({ kind: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [creatorId]);
  return (
    <section>
      <p className="tg-eyebrow">
        Mots surveillés · {name}
        <span>{words.kind === 'ready' ? plural(words.words.length, 'mot') : ''}</span>
      </p>
      <div className="nv-glass tg-words" aria-busy={words.kind === 'loading'}>
        {words.kind === 'failed' ? (
          <p className="tg-hint">Les mots n’ont pas pu être lus. Réessaie dans un instant.</p>
        ) : words.kind === 'ready' && words.words.length === 0 ? (
          <p className="tg-hint">Aucun mot pour l’instant.</p>
        ) : words.kind === 'ready' ? (
          <div className="nv-tags">
            {words.words.map((word) => (
              <span className="nv-tag nv-tag--declared" key={word}>
                {word}
              </span>
            ))}
          </div>
        ) : null}
        {words.kind === 'ready' && !words.isActive ? (
          <p className="tg-hint">
            Ces mots viennent de sa dernière version, pas encore activée : l’agent les appliquera quand elle
            le sera.
          </p>
        ) : null}
        <Link className="nv-btn nv-btn--plain nv-btn--sm tg-self-start" to="/creatrices">
          Modifier dans sa fiche Persona
        </Link>
      </div>
    </section>
  );
}

function ValidationsTab({ scope, onScope, ...routing }: ScopedProps): JSX.Element {
  return (
    <>
      <Coming>
        Les validations arrivent avec le copilote et les vocaux : un vocal ou un brouillon qui attend
        t’enverra un lien vers l’écran où valider. Tu peux déjà choisir le groupe.
      </Coming>
      <section>
        <p className="tg-eyebrow">Ce qui demande un humain</p>
        <ScopePicker overview={routing.overview} scope={scope} onScope={onScope} />
        <RoutingList {...routing} topics={['validation']} scope={scope} />
      </section>
      <GroupPreview
        group="Astreinte"
        heading="On valide là où on écoute"
        points={[
          'Le lien ouvre le CRM à l’écran de validation : tu écoutes, tu valides ou tu refuses.',
          'La voix de la créatrice ne part jamais chez Telegram.',
          'Une fois traité, le message se met à jour pour que personne ne le fasse deux fois.',
        ]}
      >
        <PreviewMessage from="Nirvana Alertes" time="21:16" edit="✓ Validé par Charles">
          🎙️ <b>Vocal à valider · Créatrice</b>
          <br />
          Vocal de 14 s prêt pour un fan. Il ne part pas sans toi.
          <br />
          <span className="tg-msg__link">Écouter et valider</span>
        </PreviewMessage>
      </GroupPreview>
    </>
  );
}

type Pending = { kind: 'confirm'; botId: string } | { kind: 'reauth'; botId: string } | null;
type TestState = Record<string, { kind: 'busy' } | { kind: 'ok' } | { kind: 'error'; message: string }>;

function BotsTab({
  overview,
  now,
  onSheet,
  onChanged,
  onAdd,
}: {
  overview: TelegramOverview;
  now: Date;
  onSheet: (mode: SheetMode) => void;
  onChanged: () => void;
  onAdd: () => void;
}): JSX.Element {
  const [pending, setPending] = useState<Pending>(null);
  const [tests, setTests] = useState<TestState>({});
  const [error, setError] = useState<string | null>(null);
  const choices = chatChoices(overview.bots);
  const active = choices.filter((c) => c.isReachable).length;

  const remove = (bot: TelegramBot): void => {
    setError(null);
    removeBot(bot.id).then(onChanged, (reason: unknown) => {
      if (reason instanceof ReauthRequired) {
        setPending({ kind: 'reauth', botId: bot.id });
        return;
      }
      setError(`${bot.displayName} n’a pas été supprimé. ${OFFLINE}`);
    });
  };

  const test = (chatId: TelegramChatId): void => {
    setTests((all) => ({ ...all, [chatId]: { kind: 'busy' } }));
    sendTest(chatId).then(
      (result) => {
        setTests((all) => ({
          ...all,
          [chatId]: result.ok ? { kind: 'ok' } : { kind: 'error', message: result.refusal.message },
        }));
        onChanged();
      },
      () => {
        setTests((all) => ({ ...all, [chatId]: { kind: 'error', message: OFFLINE } }));
      },
    );
  };

  if (overview.bots.length === 0) {
    return (
      <section className="nv-glass tg-empty">
        <div className="tg-bot__icon" aria-hidden="true">
          <TelegramGlyph />
        </div>
        <p className="tg-cover__title">Aucun bot pour l’instant</p>
        <p className="tg-cover__sub">
          Un bot Telegram se crée en une minute avec @BotFather. Nirvana te guide pas à pas.
        </p>
        <button type="button" className="nv-btn nv-btn--neon" onClick={onAdd}>
          Ajouter un bot
        </button>
      </section>
    );
  }

  return (
    <>
      <section>
        <p className="tg-eyebrow">
          Bots{' '}
          <span>{`${plural(overview.bots.length, 'bot')} · ${plural(active, 'groupe')} actif${active > 1 ? 's' : ''}`}</span>
        </p>
        <div className="nv-glass">
          <div className="nv-list">
            {overview.bots.map((bot) => {
              const line = botLine(bot, now);
              const botChoices = choices.filter((c) => c.bot.id === bot.id);
              return (
                <div className="tg-bot" key={bot.id}>
                  <div className="tg-bot__head">
                    <div className="tg-bot__icon" aria-hidden="true">
                      <TelegramGlyph />
                    </div>
                    <div className="tg-min0">
                      <div className="tg-bot__name">{bot.displayName}</div>
                      <div className="tg-bot__handle" data-warning={line.isWarning}>
                        {line.text}
                      </div>
                    </div>
                    <div className="tg-actions">
                      {bot.state === 'active' ? (
                        <span className="nv-status nv-status--sent">
                          <span className="nv-status__dot" />
                          Actif
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="nv-btn nv-btn--soft nv-btn--sm"
                          onClick={() => {
                            onSheet({ kind: 'replace', bot });
                          }}
                        >
                          Réparer
                        </button>
                      )}
                    </div>
                  </div>
                  {botChoices.length === 0 ? (
                    <p className="tg-hint tg-bot__empty">Ce bot n’est dans aucun groupe.</p>
                  ) : (
                    <div className="nv-list">
                      {botChoices.map((choice) => {
                        const chatLabel = chatLine(choice, now);
                        const topics = topicsOfChat(overview.routes, choice.chat.id);
                        const state = tests[choice.chat.id];
                        return (
                          <div className="tg-chat" key={choice.chat.id}>
                            <span className="tg-av">{initials(choice.chat.title)}</span>
                            <div className="tg-chat__t">
                              <b>{choice.chat.title}</b>
                              <small data-warning={chatLabel.isWarning}>{chatLabel.text}</small>
                              {topics.length === 0 ? null : (
                                <span className="tg-topics">
                                  {topics.map((topic) => (
                                    <span key={topic}>
                                      <span className="tg-dot" data-topic={topic} />
                                      {TOPICS[topic].label}
                                    </span>
                                  ))}
                                </span>
                              )}
                              {state?.kind === 'error' ? (
                                <small data-warning="true" role="alert">
                                  {state.message}
                                </small>
                              ) : null}
                            </div>
                            <div className="tg-actions">
                              {state?.kind === 'ok' ? (
                                <span className="tg-sent">✓ Reçu dans le groupe</span>
                              ) : (
                                <button
                                  type="button"
                                  className="nv-btn nv-btn--soft nv-btn--sm"
                                  disabled={state?.kind === 'busy' || !choice.isReachable}
                                  onClick={() => {
                                    test(choice.chat.id);
                                  }}
                                >
                                  {state?.kind === 'busy' ? 'Envoi…' : 'Envoyer un test'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="tg-bot__foot">
                    <button
                      type="button"
                      className="nv-btn nv-btn--plain nv-btn--sm"
                      disabled={bot.state !== 'active'}
                      onClick={() => {
                        onSheet({ kind: 'listen', bot });
                      }}
                    >
                      Ajouter à un groupe
                    </button>
                    <button
                      type="button"
                      className="nv-btn nv-btn--plain nv-btn--sm"
                      onClick={() => {
                        onSheet({ kind: 'replace', bot });
                      }}
                    >
                      Remplacer le jeton
                    </button>
                    <button
                      type="button"
                      className="nv-btn nv-btn--plain nv-btn--sm nv-btn--destructive"
                      onClick={() => {
                        setPending({ kind: 'confirm', botId: bot.id });
                      }}
                    >
                      Supprimer
                    </button>
                    {pending?.botId === bot.id && pending.kind === 'confirm' ? (
                      <div className="nv-confirm tg-full">
                        <p>
                          <b>Supprimer {bot.displayName} ?</b>{' '}
                          <span className="tg-hint">
                            {botChoices.length > 0
                              ? `Ses ${plural(botChoices.length, 'groupe')} ne recevront plus rien. `
                              : ''}
                            Le bot reste dans Telegram : pour l’effacer, envoie /deletebot à @BotFather.
                          </span>
                        </p>
                        <div className="nv-confirm__actions">
                          <button
                            type="button"
                            className="nv-btn nv-btn--soft nv-btn--sm"
                            onClick={() => {
                              setPending(null);
                            }}
                          >
                            Garder
                          </button>
                          <button
                            type="button"
                            className="nv-btn nv-btn--soft nv-btn--destructive nv-btn--sm"
                            onClick={() => {
                              setPending(null);
                              remove(bot);
                            }}
                          >
                            Supprimer le bot
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {pending?.botId === bot.id && pending.kind === 'reauth' ? (
                      <div className="nv-confirm tg-full">
                        <Reauth
                          onConfirmed={() => {
                            setPending(null);
                            remove(bot);
                          }}
                          onCancel={() => {
                            setPending(null);
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      {error === null ? null : (
        <p className="tg-notice" role="alert">
          {error}
        </p>
      )}
      <div className="tg-callout">
        <InfoGlyph />
        <span>
          Un bot peut servir plusieurs groupes, et rien n’oblige à en avoir plusieurs. Un second bot sert
          surtout à séparer les ventes des urgences, avec un autre nom dans Telegram.
        </span>
      </div>
    </>
  );
}
