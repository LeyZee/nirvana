import type { ConversationSummary } from '@nirvana/contracts';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type JSX } from 'react';

import { fetchConversations, fetchCreators } from './api';
import { mergeConversations, STATE_LABELS, statusClass, subline } from './view';
import './tracking.css';

import { Page, PageHeader, Panel } from '@/shell/layout';

const REFRESH_MS = 30_000;
/** The runbook step that creates a creator (docs/runbooks/local-dev.md). */
const NO_CREATOR =
  'Crée la créatrice avec pnpm creator:create, comme l’indique le runbook docs/runbooks/local-dev.md, puis recharge la page.';

/**
 * Suivi, squelette (P0-07b) : la liste brute des conversations et leur état, en lecture seule. La file « à traiter »
 * et le lecteur de conversation viennent après le squelette (revue 08) ; ce n'est jamais une Inbox.
 */
export function TrackingPage(): JSX.Element {
  const creatorsQuery = useQuery({ queryKey: ['creators'], queryFn: fetchCreators });
  const creators = creatorsQuery.data ?? [];
  const queries = useQueries({
    queries: creators.map((creator) => ({
      queryKey: ['conversations', creator.id],
      queryFn: () => fetchConversations(creator.id),
      refetchInterval: REFRESH_MS,
    })),
  });
  const now = useNow();

  const isLoading = creatorsQuery.isPending || queries.some((q) => q.isPending);
  const failed = queries.filter((q) => q.isError);
  const lines = mergeConversations(
    creators.map((creator, i) => ({
      creatorName: creator.displayName,
      items: queries[i]?.data?.items ?? [],
    })),
  );
  const hasMore = queries.some((q) => q.data?.hasMore === true);
  const showsCreator = creators.length > 1;
  const retry = (): void => {
    if (creatorsQuery.isError) void creatorsQuery.refetch();
    for (const q of failed) void q.refetch();
  };

  return (
    <Page>
      <PageHeader
        eyebrow={creators.length === 1 ? creators[0]?.displayName : undefined}
        title="Suivi"
        lead="Les conversations et leur état, la plus récente en haut."
      />
      {creatorsQuery.isError || (failed.length > 0 && lines.length === 0) ? (
        <Notice
          title="Le serveur n’a pas répondu"
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
      ) : creators.length === 0 ? (
        <Notice title="Aucune créatrice reliée" text={NO_CREATOR} />
      ) : lines.length === 0 ? (
        <Notice
          title="Aucune conversation pour l’instant"
          text="Elles apparaissent ici dès que le premier fan écrit sur Reveal."
        />
      ) : (
        <Panel className="tr-panel">
          <div className="nv-scroll">
            <ul className="nv-list tr-list" aria-label="Conversations">
              {lines.map(({ conversation, creatorName }) => (
                <Row
                  key={conversation.id}
                  conversation={conversation}
                  creatorName={showsCreator ? creatorName : undefined}
                  now={now}
                />
              ))}
            </ul>
            {hasMore ? <p className="tr-more">Seules les plus récentes sont affichées.</p> : null}
          </div>
        </Panel>
      )}
    </Page>
  );
}

function Row({
  conversation,
  creatorName,
  now,
}: {
  conversation: ConversationSummary;
  /** Shown before the mode when the account sees several creators. */
  creatorName: string | undefined;
  now: Date;
}): JSX.Element {
  const name = conversation.fanDisplayName.trim() === '' ? 'Fan sans nom' : conversation.fanDisplayName;
  return (
    <li className="nv-convo nv-enter tr-row">
      <span className="nv-avatar nv-avatar--sm" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="nv-convo__main">
        <span className="nv-convo__name">{name}</span>
        <span className="nv-convo__preview">
          {creatorName === undefined ? null : `${creatorName} · `}
          {subline(conversation, now)}
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
