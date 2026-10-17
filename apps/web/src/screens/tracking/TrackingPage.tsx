import type { ConversationSummary } from '@nirvana/contracts';
import { useQueries } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useEffect, useState, type JSX } from 'react';

import { fetchConversations } from './api';
import { mergeConversations, STATE_LABELS, statusClass, subline } from './view';
import './tracking.css';

import { Page, PageHeader, Panel } from '@/shell/layout';

const REFRESH_MS = 30_000;

/**
 * Suivi, squelette (P0-07b) : la liste brute des conversations et leur état, en lecture seule. La file « à traiter »
 * et le lecteur de conversation viennent après le squelette (revue 08) ; ce n'est jamais une Inbox.
 */
export function TrackingPage(): JSX.Element {
  const { user } = useRouteContext({ from: '__root__' });
  const queries = useQueries({
    queries: user.creatorIds.map((creatorId) => ({
      queryKey: ['conversations', creatorId],
      queryFn: () => fetchConversations(creatorId),
      refetchInterval: REFRESH_MS,
    })),
  });
  const now = useNow();

  const isLoading = queries.some((q) => q.isPending);
  const failed = queries.filter((q) => q.isError);
  const conversations = mergeConversations(queries.map((q) => q.data?.items ?? []));
  const hasMore = queries.some((q) => q.data?.hasMore === true);

  return (
    <Page>
      <PageHeader title="Suivi" lead="Les conversations et leur état, la plus récente en haut." />
      {user.creatorIds.length === 0 ? (
        <Notice
          title="Aucune créatrice reliée à ton compte"
          text="La liste se remplit dès qu’une créatrice est reliée à ton compte."
        />
      ) : failed.length > 0 && conversations.length === 0 ? (
        <Notice
          title="Le serveur n’a pas répondu"
          text="La liste n’a pas pu être lue. Réessaie dans un instant."
        >
          <button
            type="button"
            className="nv-btn nv-btn--soft nv-btn--sm"
            onClick={() => {
              for (const q of failed) void q.refetch();
            }}
          >
            Réessayer
          </button>
        </Notice>
      ) : isLoading && conversations.length === 0 ? (
        <Panel className="tr-panel">
          <div className="tr-skeleton" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </Panel>
      ) : conversations.length === 0 ? (
        <Notice
          title="Aucune conversation pour l’instant"
          text="Elles apparaissent ici dès que le premier fan écrit sur Reveal."
        />
      ) : (
        <Panel className="tr-panel">
          <div className="nv-scroll">
            <ul className="nv-list tr-list" aria-label="Conversations">
              {conversations.map((c) => (
                <Row key={c.id} conversation={c} now={now} />
              ))}
            </ul>
            {hasMore ? <p className="tr-more">Seules les plus récentes sont affichées.</p> : null}
          </div>
        </Panel>
      )}
    </Page>
  );
}

function Row({ conversation, now }: { conversation: ConversationSummary; now: Date }): JSX.Element {
  const name = conversation.fanDisplayName.trim() === '' ? 'Fan sans nom' : conversation.fanDisplayName;
  return (
    <li className="nv-convo nv-enter tr-row">
      <span className="nv-avatar nv-avatar--sm" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="nv-convo__main">
        <span className="nv-convo__name">{name}</span>
        <span className="nv-convo__preview">{subline(conversation, now)}</span>
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
