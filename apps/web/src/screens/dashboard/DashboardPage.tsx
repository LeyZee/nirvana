import { useCallback, useState, type JSX } from 'react';

import { AgentHero } from './AgentHero';
import { FunnelPanel } from './Funnel';
import { ModeControl } from './ModeControl';
import { Reader } from './Reader';
import { PeriodControl, SalesPanel, salesSub } from './Sales';
import { TopFans } from './TopFans';
import type { Fan, Period, Todo } from './model';
import { Section, useFloatingTip } from './parts';
import { useDashboard } from './useDashboard';
import './dashboard.css';

const FUNNEL_SUB: Record<Period, string> = {
  day: 'les fans arrivés aujourd’hui, et combien passent chaque étape',
  week: 'les fans arrivés ces 7 jours, et combien passent chaque étape',
  month: 'les fans arrivés ces 30 jours, et combien passent chaque étape',
};

/**
 * The Dashboard, read top to bottom (maquette v6, validée le 17/10) : the agent's state and what waits for a
 * human, then the sales, the fans' path, the best fans. Every detail lives in a tip or the read-only reader.
 */
export function DashboardPage(): JSX.Element {
  const { data, isSample, todos, markDone, mode, automatic, setMode } = useDashboard();
  const [period, setPeriod] = useState<Period>('day');
  const [fanId, setFanId] = useState<string | null>(null);
  const tip = useFloatingTip();
  const sales = data.sales[period];
  const fan = data.fans.find((f) => f.id === fanId) ?? null;

  const openTodo = useCallback((todo: Todo) => {
    if (todo.fanId !== undefined) setFanId(todo.fanId);
  }, []);
  const openFan = useCallback((f: Fan) => {
    setFanId(f.id);
  }, []);
  const close = useCallback(() => {
    setFanId(null);
  }, []);
  const resume = useCallback(() => {
    setMode('copilot');
  }, [setMode]);

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
          {isSample ? (
            <span
              className="nv-sample"
              title="Chiffres inventés : les vraies données arrivent avec la route du Dashboard."
            >
              Exemple
            </span>
          ) : null}
        </div>
        <ModeControl
          mode={mode}
          automatic={automatic}
          creatorName={data.creator.name}
          tip={tip}
          onChange={setMode}
        />
      </header>

      <AgentHero
        agent={data.agent}
        mode={mode}
        todos={todos}
        onOpen={openTodo}
        onDone={markDone}
        onResume={resume}
      />

      <Section
        title="Ventes"
        sub={salesSub(period)}
        index={2}
        control={<PeriodControl period={period} onChange={setPeriod} />}
      >
        <SalesPanel period={period} sales={sales} tip={tip} />
      </Section>

      <Section title="Parcours des fans" sub={FUNNEL_SUB[period]} index={3}>
        <FunnelPanel key={period} counts={sales.funnel.counts} before={sales.funnel.before} tip={tip} />
      </Section>

      <Section
        title="Meilleurs fans"
        sub="ce qu’ils ont dépensé : en rouge par l’agent, en jaune par un chatteur"
        index={4}
      >
        <TopFans fans={data.fans} tip={tip} onOpen={openFan} />
      </Section>

      {tip.element}
      <Reader fan={fan} onClose={close} />
    </div>
  );
}
