import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState, type JSX } from 'react';

import { AgentHero } from './AgentHero';
import { BackupBanner } from './BackupBanner';
import { CreatorPicker } from './CreatorPicker';
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
import { initialOf } from '@/lib/utils';
import { NightBanner } from '@/settings/telegram/NightBanner';

/** Why the control cannot change the mode: on the sample, under an operator's global switch. */
const SAMPLE_NOTE = 'Exemple : ce contrôle ne pilote aucun agent.';
const GLOBAL_NOTE =
  'Un arrêt général retient l’agent pour toutes les créatrices : seul un opérateur peut le lever.';
const CREATOR_NOTE = 'Le mode de l’agent se change par l’agence.';

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
          {/* Another creator's Dashboard may still answer: the choice stays at hand. */}
          <CreatorPicker />
          <div className="db-top__who">
            <span className="db-top__av" aria-hidden="true">
              {initialOf(creatorName)}
            </span>
            <span className="db-top__name">{creatorName}</span>
          </div>
        </header>
      )}
      <section
        className="db-hero nv-enter"
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
 *
 * A creator's keeps her aggregates only (ADR 0023: never a conversation nor a fan): the agent's state and mode,
 * read only, its health, the sales; no « À traiter », no best fans, no way into Suivi. The server sends her neither.
 */
export function DashboardPage({
  forCreator = false,
  forOwner = false,
  opensTracking = false,
}: {
  forCreator?: boolean;
  /** The owner also reads the state of the daily export (OPS-02), the one figure that is the owner's alone. */
  forOwner?: boolean;
  /** The account's rail holds Suivi: the fan reader offers to open his conversation there. */
  opensTracking?: boolean;
}): JSX.Element {
  const [period, setPeriod] = useState<Period>('day');
  const view = useDashboard(period, forCreator);
  if (view.status === 'loading') {
    return (
      <div className="db" aria-busy="true">
        <div className="db-loading nv-plate" aria-label="Chargement du Dashboard" role="status" />
      </div>
    );
  }
  if (view.status === 'offline') return <Offline creatorName={view.creatorName} />;
  return (
    <Loaded
      view={view}
      period={period}
      onPeriod={setPeriod}
      forCreator={forCreator}
      forOwner={forOwner}
      opensTracking={opensTracking}
    />
  );
}

function Loaded({
  view: { status, creatorId, globalStop, readAt, data, mode, automatic },
  period,
  onPeriod,
  forCreator,
  forOwner,
  opensTracking,
}: {
  view: Extract<DashboardView, { status: 'live' | 'sample' }>;
  period: Period;
  onPeriod: (period: Period) => void;
  forCreator: boolean;
  forOwner: boolean;
  opensTracking: boolean;
}): JSX.Element {
  const [fanId, setFanId] = useState<string | null>(null);
  const tip = useFloatingTip();
  const sales = data.sales?.[period] ?? null;
  const fan = data.fans.find((f) => f.id === fanId) ?? null;

  const navigate = useNavigate();
  const openTodo = useCallback(
    (todo: Todo) => {
      // The server's lines open in Suivi, where a draft is decided and a handoff given back; the sample's in the reader.
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
    <div className="db">
      <header className="db-top nv-enter">
        {/* Whose agent this is, when the account sees several: the pill and Suivi follow the same choice. */}
        {status === 'live' ? <CreatorPicker /> : null}
        <div className="db-top__who">
          <span className="db-top__av" aria-hidden="true">
            {initialOf(data.creator.name)}
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
          readOnly={
            status === 'sample' ? SAMPLE_NOTE : forCreator ? CREATOR_NOTE : globalStop ? GLOBAL_NOTE : null
          }
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
        onResume={status === 'live' && !globalStop && !forCreator ? resume : undefined}
        forCreator={forCreator}
      />

      {/* The sample reads nothing: the banner speaks of the server's exports only. */}
      <BackupBanner enabled={forOwner && status === 'live'} />

      {/* The night's alerts and where they go are the team's (Réglages › Telegram). */}
      {forCreator ? null : <NightBanner night={data.telegram} creatorName={data.creator.name} />}

      {sales === null ? (
        <Section title="Ventes" sub="ce que l’agent et les chatteurs vendent" index={2}>
          <p className="db-pending nv-plate">
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

      {forCreator ? null : (
        <Section
          title="Meilleurs fans"
          sub="ce qu’ils ont dépensé : d’abord la part de l’agent, puis celle des chatteurs"
          index={4}
          control={sales === null ? periodControl : undefined}
        >
          <TopFans fans={data.fans} tip={tip} onOpen={openFan} usdNote={data.usdNote} />
        </Section>
      )}

      {tip.element}
      {forCreator ? null : (
        <Reader fan={fan} creatorId={creatorId} onClose={close} opensTracking={opensTracking} />
      )}
    </div>
  );
}
