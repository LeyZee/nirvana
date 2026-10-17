import type { ProviderNextAction, ProviderOverview, ProviderStatus } from '@nirvana/contracts';
import { useCallback, useEffect, useState, type JSX } from 'react';

import { ConnectSheet } from './ConnectSheet';
import { disconnect, fetchOverview, verifyNow } from './api';
import { GUIDES, isDashboardProvider, type DashboardProvider } from './guide';
import { checkedAgo, dotOf, dotOfNext, segments } from './view';
import './services.css';

/** The list refreshes on its own: a key revoked while the page is open turns red without a reload. */
const REFRESH_MS = 30_000;

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; overview: ProviderOverview };
type Sheet = { provider: DashboardProvider; isReplace: boolean } | null;

/**
 * Réglages › Modèles IA › Services (fiche P3-03, ADR 0016): what to do now, then one line per service. Connecting
 * happens in a sheet; nothing on this page ever shows a key.
 */
export function ServicesSection(): JSX.Element {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [menu, setMenu] = useState<DashboardProvider | null>(null);
  const [confirming, setConfirming] = useState<DashboardProvider | null>(null);
  const [verifying, setVerifying] = useState<DashboardProvider | null>(null);
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setLoad({ kind: 'ready', overview: await fetchOverview() });
      setNow(new Date());
    } catch {
      setLoad((current) => (current.kind === 'ready' ? current : { kind: 'failed' }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (sheet !== null || menu !== null || confirming !== null) return undefined;
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [refresh, sheet, menu, confirming]);

  useEffect(() => {
    if (menu === null) return undefined;
    const close = (): void => {
      setMenu(null);
    };
    window.addEventListener('click', close);
    return () => {
      window.removeEventListener('click', close);
    };
  }, [menu]);

  const open = (provider: DashboardProvider, isReplace: boolean): void => {
    setMenu(null);
    setConfirming(null);
    setSheet({ provider, isReplace });
  };

  const finishSheet = useCallback(
    (next: DashboardProvider | null) => {
      setSheet(next === null ? null : { provider: next, isReplace: false });
      void refresh();
    },
    [refresh],
  );

  if (load.kind !== 'ready') {
    return (
      <section className="sv-page" aria-busy={load.kind === 'loading'}>
        <Heading />
        {load.kind === 'failed' ? (
          <div className="nv-glass sv-next">
            <p className="sv-lead">Les services ne répondent pas</p>
            <p className="sv-muted">Nirvana n’a pas pu lire l’état des clés. Réessaie dans un instant.</p>
            <button
              type="button"
              className="nv-btn nv-btn--soft sv-self-start"
              onClick={() => void refresh()}
            >
              Réessayer
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  const { services, next } = load.overview;
  const lines = services.filter((s): s is ProviderStatus & { provider: DashboardProvider } =>
    isDashboardProvider(s.provider),
  );
  const nextProvider = next.kind === 'all_set' ? null : next.provider;
  const nextDot = dotOfNext(next);
  const connectedCount = segments(services).filter((s) => s === 'on').length;

  return (
    <section className="sv-page">
      <Heading />
      <div className="nv-glass sv-next" aria-live="polite">
        <div className="sv-next__head">
          <span className="sv-dot sv-dot--big" data-dot={nextDot} />
          <div className="sv-next__text">
            <p className="sv-lead">{next.lead}</p>
            <p className="sv-muted">{next.detail}</p>
          </div>
          <NextButton next={next} onOpen={open} />
        </div>
        <div
          className="sv-bar"
          role="img"
          aria-label={`${String(connectedCount)} services sur ${String(services.length)} connectés`}
        >
          {segments(services).map((segment, index) => (
            <i key={services[index]?.provider ?? index} data-segment={segment} />
          ))}
        </div>
      </div>

      <div className="nv-glass sv-list">
        {lines.map((status, index) => {
          const provider = status.provider;
          const guide = GUIDES[provider];
          const isVerifying = verifying === provider;
          const isNext = nextProvider === provider;
          const ago = checkedAgo(status.verifiedAt, now);
          const line = isVerifying
            ? 'Vérification…'
            : status.source === 'environment'
              ? 'Clé lue depuis l’environnement de développement'
              : status.state === 'connected' && ago !== null
                ? `${status.message} · ${ago}`
                : status.message;
          const isSaved = status.source === 'dashboard';
          return (
            <div className="sv-row" key={provider} style={{ animationDelay: `${String(index * 40)}ms` }}>
              <span className="sv-dot" data-dot={dotOf(status, isVerifying)} />
              <div className="sv-row__name">
                {guide.name}
                <small>{guide.brand}</small>
              </div>
              <div className="sv-row__act">
                {isSaved && status.state !== 'needs_reconnect' ? (
                  <button
                    type="button"
                    className="sv-more"
                    aria-label={`Options de ${guide.name}`}
                    aria-haspopup="menu"
                    aria-expanded={menu === provider}
                    onClick={(event) => {
                      event.stopPropagation();
                      setConfirming(null);
                      setMenu(menu === provider ? null : provider);
                    }}
                  >
                    ⋯
                  </button>
                ) : isNext ? null : (
                  <button
                    type="button"
                    className="nv-btn nv-btn--soft nv-btn--sm"
                    onClick={() => {
                      open(provider, status.state === 'needs_reconnect');
                    }}
                  >
                    {status.state === 'needs_reconnect' ? 'Remplacer' : 'Connecter'}
                  </button>
                )}
              </div>
              <p className="sv-row__line" data-state={status.state}>
                {line}
              </p>
              {menu === provider ? (
                <div className="sv-menu nv-glass nv-glass--thick" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      setVerifying(provider);
                      void verifyNow(provider)
                        .then(() => refresh())
                        .finally(() => {
                          setVerifying(null);
                        });
                    }}
                  >
                    Vérifier maintenant
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      open(provider, true);
                    }}
                  >
                    Remplacer la clé
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="sv-danger"
                    onClick={() => {
                      setMenu(null);
                      setConfirming(provider);
                    }}
                  >
                    Déconnecter
                  </button>
                </div>
              ) : null}
              {confirming === provider ? (
                <div className="nv-confirm sv-confirm">
                  <p>
                    <b>Déconnecter {guide.name} ?</b> {guide.offConsequence} La clé est effacée de Nirvana.
                    Chez {guide.vendor}, elle reste valide tant que tu ne la supprimes pas.
                  </p>
                  <div className="nv-confirm__actions">
                    <button
                      type="button"
                      className="nv-btn nv-btn--soft nv-btn--destructive"
                      onClick={() => {
                        setConfirming(null);
                        void disconnect(provider).then(() => refresh());
                      }}
                    >
                      Déconnecter
                    </button>
                    <button
                      type="button"
                      className="nv-btn sv-btn--quiet"
                      onClick={() => {
                        setConfirming(null);
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {sheet === null ? null : (
        <ConnectSheet
          key={sheet.provider}
          provider={sheet.provider}
          isReplace={sheet.isReplace}
          services={services}
          onChanged={() => void refresh()}
          onFinish={finishSheet}
        />
      )}
    </section>
  );
}

function NextButton({
  next,
  onOpen,
}: {
  next: ProviderNextAction;
  onOpen: (provider: DashboardProvider, isReplace: boolean) => void;
}): JSX.Element | null {
  if (next.kind === 'all_set' || !isDashboardProvider(next.provider)) return null;
  const provider = next.provider;
  const guide = GUIDES[provider];
  if (next.kind === 'top_up') {
    return guide.topUpUrl === null ? null : (
      <a className="nv-btn nv-btn--neon" href={guide.topUpUrl} target="_blank" rel="noreferrer">
        Recharger ↗
      </a>
    );
  }
  return (
    <button
      type="button"
      className="nv-btn nv-btn--neon"
      onClick={() => {
        onOpen(provider, next.kind === 'replace_key');
      }}
    >
      {next.kind === 'connect' ? `Connecter ${guide.name}` : 'Remplacer la clé'}
    </button>
  );
}

function Heading(): JSX.Element {
  return (
    <header className="sv-heading">
      <p className="sv-crumb">Réglages › Modèles IA</p>
      <h1>Services</h1>
    </header>
  );
}
