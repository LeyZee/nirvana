import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState, type JSX } from 'react';

import { AgentHero } from './AgentHero';
import { FunnelPanel } from './Funnel';
import { ModeControl } from './ModeControl';
import { Reader } from './Reader';
import { PeriodControl, SalesPanel, salesSub } from './Sales';
import { TopFans } from './TopFans';
import { litParts } from './logic';
import type { Fan, Period, Todo } from './model';
import { Section, TONE_COLOR, useFloatingTip } from './parts';
import { useDashboard, type DashboardView } from './useDashboard';
import './dashboard.css';

import { useAgentModeWriter } from '@/agent/write';
import { NightBanner } from '@/settings/telegram/NightBanner';

/** Why the control cannot change the mode: on the sample, under an operator's global switch. */
const SAMPLE_NOTE = 'Exemple : ce contrôle ne pilote aucun agent.';
const GLOBAL_NOTE =
  'Un arrêt général retient l’agent pour toutes les créatrices : seul un opérateur peut le lever.';

const FUNNEL_SUB: Record<Period, string> = {
  day: 'les fans arrivés aujourd’hui, et combien passent chaque étape',
  week: 'les fans arrivés ces 7 jours, et combien passent chaque étape',
  month: 'les fans arrivés ces 30 jours, et combien passent chaque étape',
};

/**
 * The server does not answer: one sentence, no figure and nothing to act on, until it answers again. Amber, not red:
 * a warning, the red stays the urgencies'.
 */
function Offline({ creatorName }: { creatorName: string | null }): JSX.Element {
  return (
    <div className="db">
      {creatorName === null ? null : (
        <header className="db-top nv-enter">
          <div className="db-top__who">
            <span className="db-top__av" aria-hidden="true">
              {creatorName.slice(0, 1)}
            </span>
            <span className="db-top__name">{creatorName}</span>
          </div>
        </header>
      )}
      <section
        className="db-hero nv-glass nv-enter"
        style={{ '--_c': TONE_COLOR.warn, '--nv-i': 1 }}
        role="status"
        aria-live="polite"
      >
        <div className="db-hero__top">
          <span className="nv-orb nv-tone--warn" aria-hidden="true" />
          <div>
            <h1>
              {litParts('Le serveur **ne répond pas**').map((part) =>
                part.lit ? <em key={part.text}>{part.text}</em> : part.text,
              )}
            </h1>
            <p className="db-hero__lead">
              Les chiffres reviennent dès qu’il répond. Rien ici n’est à jour en attendant.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The Dashboard, read top to bottom (maquette v6, validée le 17/10) : the agent's state and what waits for a
 * human, then the sales, the fans' path, the best fans. Every detail lives in a tip or the read-only reader.
 */
export function DashboardPage(): JSX.Element {
  const [period, setPeriod] = useState<Period>('day');
  const view = useDashboard(period);
  if (view.status === 'loading') {
    return (
      <div className="db" aria-busy="true">
        <div className="db-loading nv-glass" aria-label="Chargement du Dashboard" role="status" />
      </div>
    );
  }
  if (view.status === 'offline') return <Offline creatorName={view.creatorName} />;
  return <Loaded view={view} period={period} onPeriod={setPeriod} />;
}

function Loaded({
  view: { status, creatorId, globalStop, readAt, data, mode, automatic },
  period,
  onPeriod,
}: {
  view: Extract<DashboardView, { status: 'live' | 'sample' }>;
  period: Period;
  onPeriod: (period: Period) => void;
}): JSX.Element {
  const [fanId, setFanId] = useState<string | null>(null);
  const tip = useFloatingTip();
  const sales = data.sales?.[period] ?? null;
  const fan = data.fans.find((f) => f.id === fanId) ?? null;

  const navigate = useNavigate();
  const openTodo = useCallback(
    (todo: Todo) => {
      // A draft to validate opens in Suivi, where it is decided; anything else in the read-only reader.
      if (todo.conversationId !== undefined)
        void navigate({ to: '/suivi', search: { conversation: todo.conversationId } });
      else if (todo.fanId !== undefined) setFanId(todo.fanId);
    },
    [navigate],
  );
  const openFan = useCallback((f: Fan) => {
    setFanId(f.id);
  }, []);
  const close = useCallback(() => {
    setFanId(null);
  }, []);
  const writer = useAgentModeWriter(creatorId, readAt);
  const { setMode } = writer;
  const resume = useCallback(() => {
    setMode('copilot');
  }, [setMode]);
  const notice = writer.notice ?? (globalStop ? GLOBAL_NOTE : null);

  const periodControl = <PeriodControl period={period} onChange={onPeriod} />;
  return (
    <div className="db" onScroll={tip.hide}>
      <header className="db-top nv-enter">
        <div className="db-top__who">
          <span className="db-top__av" aria-hidden="true">
            {data.creator.name.slice(0, 1)}
          </span>
          <span>
            <span className="db-top__name">{data.creator.name}</span>
            <span className="db-top__when">
              {data.creator.platform} · {data.creator.now}
            </span>
          </span>
          {status === 'sample' ? (
            <span
              className="nv-sample"
              title="Aucune créatrice encore : ces chiffres sont inventés pour montrer la page, rien n’est réel."
            >
              Exemple
            </span>
          ) : null}
        </div>
        {/* The mode changes once the server has made the change (PUT /v1/agent/mode); the sample pilots nothing. */}
        <ModeControl
          mode={mode}
          automatic={automatic}
          creatorName={data.creator.name}
          tip={tip}
          readOnly={status === 'sample' ? SAMPLE_NOTE : globalStop ? GLOBAL_NOTE : null}
          onChange={setMode}
        />
        {writer.pending ? (
          <p className="db-notice db-notice--quiet" role="status">
            Envoi au serveur…
          </p>
        ) : notice === null ? null : (
          <p className="db-notice" role="alert">
            {notice}
          </p>
        )}
      </header>

      <AgentHero
        agent={data.agent}
        mode={mode}
        todos={data.todos}
        onOpen={openTodo}
        onDone={undefined}
        onResume={status === 'live' && !globalStop ? resume : undefined}
      />

      <NightBanner night={data.telegram} creatorName={data.creator.name} />

      {sales === null ? (
        <Section title="Ventes" sub="ce que l’agent et les chatteurs vendent" index={2}>
          <p className="db-pending nv-glass">
            Les ventes s’afficheront ici dès que la connexion à Reveal les observera. En attendant, elles se
            lisent dans Reveal.
          </p>
        </Section>
      ) : (
        <>
          <Section title="Ventes" sub={salesSub(period)} index={2} control={periodControl}>
            <SalesPanel period={period} sales={sales} tip={tip} />
          </Section>

          <Section title="Parcours des fans" sub={FUNNEL_SUB[period]} index={3}>
            <FunnelPanel key={period} counts={sales.funnel.counts} before={sales.funnel.before} tip={tip} />
          </Section>
        </>
      )}

      <Section
        title="Meilleurs fans"
        sub="ce qu’ils ont dépensé : en rouge par l’agent, en jaune par un chatteur"
        index={4}
        control={sales === null ? periodControl : undefined}
      >
        <TopFans fans={data.fans} tip={tip} onOpen={openFan} />
      </Section>

      {tip.element}
      <Reader fan={fan} onClose={close} />
    </div>
  );
}
