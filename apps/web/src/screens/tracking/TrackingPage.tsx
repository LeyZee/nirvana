import type { ConversationSummary, DashboardTodo } from '@nirvana/contracts';
import { useQueries } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState, type JSX, type ReactNode } from 'react';

import { Reader } from './Reader';
import { fetchConversations } from './api';
import { todoLabel } from './reader-model';
import { MODE_MEANINGS, mergeConversations, sharedMode, STATE_LABELS, statusClass, subline } from './view';
import './tracking.css';

import { useLiveDashboard } from '@/agent/live';
import { useCreators } from '@/creators/api';
import { Page, PageHeader, Panel } from '@/shell/layout';

const REFRESH_MS = 30_000;

/**
 * Suivi : d'abord ce qui attend un humain (la file « à traiter », calculée par le serveur), puis toutes les
 * conversations ; une conversation ouverte se lit à droite, et ses brouillons s'y valident (Charles, 19/10 :
 * « Valider dans Suivi »). Personne n'écrit à un fan d'ici : reprendre la main, c'est continuer dans Reveal.
 */
export function TrackingPage({
  selected,
  onSelect,
  canDecide,
  canAddCreator,
  offShift,
}: {
  /** The conversation open in the reader (`/suivi?conversation=<id>`), or null for the list alone. */
  selected: string | null;
  onSelect: (conversationId: string | null) => void;
  /** Owners and chatters decide on drafts and take over; a creator reads. */
  canDecide: boolean;
  /** Créatrices is in the account's rail: the owner adds a creator from there; a team member waits for his. */
  canAddCreator: boolean;
  /** A chatter off shift (EQ-13): said under the title, in place of the empty list. */
  offShift?: ReactNode;
}): JSX.Element {
  const creatorsQuery = useCreators();
  const creators = creatorsQuery.data ?? [];
  const queries = useQueries({
    queries: creators.map((creator) => ({
      queryKey: ['conversations', creator.id],
      queryFn: () => fetchConversations(creator.id),
      refetchInterval: REFRESH_MS,
    })),
  });
  const dashboard = useLiveDashboard();
  const now = useNow();

  const isLoading = creatorsQuery.isPending || queries.some((q) => q.isPending);
  const failed = queries.filter((q) => q.isError);
  const lines = mergeConversations(
    creators.map((creator, i) => ({
      creatorId: creator.id,
      creatorName: creator.displayName,
      items: queries[i]?.data?.items ?? [],
    })),
  );
  const hasMore = queries.some((q) => q.data?.hasMore === true);
  const showsCreator = creators.length > 1;
  const mode = sharedMode(lines);
  const retry = (): void => {
    if (creatorsQuery.isError) void creatorsQuery.refetch();
    for (const q of failed) void q.refetch();
  };
  // The queue is the first creator's (as the Dashboard): its conversations open with her id.
  const todos = dashboard.kind === 'live' ? dashboard.data.todos : [];
  const queueCreator = creators[0]?.id ?? null;
  const open =
    selected === null
      ? null
      : (lines.find((l) => l.conversation.id === selected)?.creatorId ??
        (creators.length === 1 ? queueCreator : null));

  return (
    <Page className={selected === null ? '' : 'tr-is-reading'}>
      <PageHeader
        eyebrow={creators.length === 1 ? creators[0]?.displayName : undefined}
        title="Suivi"
        lead={
          mode === null
            ? 'Ce qui attend un humain, puis les conversations et qui a la main.'
            : `Ce qui attend un humain, puis les conversations et qui a la main. ${MODE_MEANINGS[mode]}`
        }
      />
      {offShift}
      {creatorsQuery.isError || (failed.length > 0 && lines.length === 0) ? (
        <Notice
          title="Le serveur ne répond pas"
          text="La liste n’a pas pu être lue. Réessaie dans un instant."
        >
          <button type="button" className="nv-btn nv-btn--soft nv-btn--sm" onClick={retry}>
            Réessayer
          </button>
        </Notice>
      ) : isLoading && lines.length === 0 ? (
        <Panel className="tr-panel">
          <div className="tr-skeleton" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </Panel>
      ) : creators.length === 0 && canAddCreator ? (
        <Notice
          title="Aucune créatrice pour l’instant"
          text="Ajoute ta première créatrice : ses conversations arriveront ici dès que sa session Reveal sera reliée."
        >
          <Link to="/creatrices" className="nv-btn nv-btn--soft nv-btn--sm">
            Aller à Créatrices
          </Link>
        </Notice>
      ) : creators.length === 0 && offShift !== undefined ? null : creators.length === 0 ? (
        <Notice
          title="Rien pour toi pour l’instant"
          text="Les conversations des créatrices qui te sont confiées arrivent ici."
        />
      ) : (
        <div className="tr-layout">
          <div className="tr-side">
            {todos.length === 0 ? null : (
              <Panel className="tr-panel" eyebrow="À traiter">
                <ul className="nv-list tr-list" aria-label="À traiter">
                  {todos.map((todo) => (
                    <QueueRow
                      key={todo.id}
                      todo={todo}
                      isOpen={todo.conversationId === selected}
                      onOpen={() => {
                        onSelect(todo.conversationId);
                      }}
                    />
                  ))}
                </ul>
              </Panel>
            )}
            {lines.length === 0 ? (
              <Notice
                title="Aucune conversation pour l’instant"
                text="Elles apparaissent ici dès que le premier fan écrit sur Reveal."
              />
            ) : (
              <Panel
                className="tr-panel"
                eyebrow={todos.length === 0 ? undefined : 'Toutes les conversations'}
              >
                <div className="nv-scroll">
                  <ul className="nv-list tr-list" aria-label="Conversations">
                    {lines.map(({ conversation, creatorName }) => (
                      <Row
                        key={conversation.id}
                        conversation={conversation}
                        creatorName={showsCreator ? creatorName : undefined}
                        withMode={mode === null}
                        now={now}
                        isOpen={conversation.id === selected}
                        onOpen={() => {
                          onSelect(conversation.id);
                        }}
                      />
                    ))}
                  </ul>
                  {hasMore ? <p className="tr-more">Seules les plus récentes sont affichées.</p> : null}
                </div>
              </Panel>
            )}
          </div>
          {selected === null ? null : open === null ? (
            <section className="nv-plate tr-reader" aria-label="Conversation">
              <p className="tr-reader__empty">Cette conversation n’est pas dans la liste.</p>
            </section>
          ) : (
            <Reader
              key={selected}
              creatorId={open}
              conversationId={selected}
              canDecide={canDecide}
              onClose={() => {
                onSelect(null);
              }}
            />
          )}
        </div>
      )}
    </Page>
  );
}

/** A line of « À traiter »: what it is, the fan, why it waits, and since when. */
function QueueRow({
  todo,
  isOpen,
  onOpen,
}: {
  todo: DashboardTodo;
  isOpen: boolean;
  onOpen: () => void;
}): JSX.Element {
  return (
    <li>
      <button
        type="button"
        className="nv-convo tr-row tr-row--open"
        aria-current={isOpen ? 'true' : undefined}
        onClick={onOpen}
      >
        <span className={`nv-dot nv-tone--${todo.tone}`} aria-hidden="true" />
        <span className="nv-convo__main">
          <span className="nv-convo__name">
            {todoLabel(todo)} · {todo.title}
          </span>
          <span className="nv-convo__preview">{todo.why}</span>
        </span>
        <span className="nv-convo__side tr-wait">
          {todo.waitingMinutes < 60
            ? `${String(todo.waitingMinutes)} min`
            : `${String(Math.floor(todo.waitingMinutes / 60))} h`}
        </span>
      </button>
    </li>
  );
}

function Row({
  conversation,
  creatorName,
  withMode,
  now,
  isOpen,
  onOpen,
}: {
  conversation: ConversationSummary;
  /** Shown before the mode when the account sees several creators. */
  creatorName: string | undefined;
  withMode: boolean;
  now: Date;
  isOpen: boolean;
  onOpen: () => void;
}): JSX.Element {
  const name = conversation.fanDisplayName.trim() === '' ? 'Fan sans nom' : conversation.fanDisplayName;
  return (
    <li className="nv-enter">
      <button
        type="button"
        className="nv-convo tr-row tr-row--open"
        aria-current={isOpen ? 'true' : undefined}
        onClick={onOpen}
      >
        <span className="nv-avatar nv-avatar--sm" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="nv-convo__main">
          <span className="nv-convo__name">{name}</span>
          <span className="nv-convo__preview">
            {creatorName === undefined ? null : `${creatorName} · `}
            {subline(conversation, now, withMode)}
          </span>
        </span>
        <span className="nv-convo__side">
          <span className={`nv-status ${statusClass(conversation.state)}`}>
            <span className="nv-status__dot" />
            {STATE_LABELS[conversation.state]}
          </span>
          {conversation.unreadCount > 0 ? (
            <span className="tr-unread">
              {conversation.unreadCount} non lu{conversation.unreadCount > 1 ? 's' : ''}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function Notice({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: JSX.Element;
}): JSX.Element {
  return (
    <Panel className="nv-coming">
      <div className="nv-coming__in tr-notice">
        <h2>{title}</h2>
        <p>{text}</p>
        {children}
      </div>
    </Panel>
  );
}

/** The clock the « il y a » lines read, ticking every minute. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return now;
}
