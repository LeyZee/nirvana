import type { AgentState, Lever, Period, SalesSeries, Todo, Tone } from './model';

import type { AgentMode } from '@/agent/mode';

/* Pure helpers of the Dashboard: formatting and the few decisions the screen makes on its data. */

/** « 1 846 € » */
export function eur(value: number): string {
  return `${Math.round(value).toLocaleString('fr-FR')} €`;
}

/** « 2 h 05 » from minutes. */
export function hoursMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(total / 60))} h ${String(total % 60).padStart(2, '0')}`;
}

/** « +12 », « −6 » (true minus sign), « 0 » */
export function signed(value: number): string {
  if (value === 0) return '0';
  return `${value > 0 ? '+' : '−'}${String(Math.abs(value))}`;
}

/** Change of `current` against `before`, in rounded %; 0 when there was nothing before. */
export function changePercent(current: number, before: number): number {
  return before > 0 ? Math.round(((current - before) / before) * 100) : 0;
}

/** Share of `part` in `part + rest`, in rounded %. */
export function sharePercent(part: number, rest: number): number {
  const total = part + rest;
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** The benchmark of the corpus: the first offer lands about 2 h 30 after the fan's first message. */
const FIRST_OFFER_MINUTES = 150;
const FIRST_OFFER_SLACK = 20;

export interface LeverView {
  readonly value: string;
  readonly unit: string;
  /** What the delta pill says: an evolution with its unit, or the benchmark. */
  readonly delta: string;
  readonly better: boolean;
}

/**
 * How a corpus lever reads. A rate moves in points, a count of fans in fans; the time before the first offer
 * has no « shorter is better »: it is good within 20 min of 2 h 30, and its pill shows the benchmark.
 */
export function leverView(lever: Lever): LeverView {
  const diff = lever.current - lever.previous;
  switch (lever.id) {
    case 'first-offer-bought':
      return { value: String(lever.current), unit: '%', delta: `${signed(diff)} pts`, better: diff >= 0 };
    case 'time-to-first-offer':
      return {
        value: hoursMinutes(lever.current),
        unit: '',
        delta: `repère ${hoursMinutes(FIRST_OFFER_MINUTES)}`,
        better: Math.abs(lever.current - FIRST_OFFER_MINUTES) <= FIRST_OFFER_SLACK,
      };
    case 'blocked-at-payment':
      return { value: String(lever.current), unit: 'fans', delta: signed(diff), better: diff <= 0 };
  }
}

/**
 * The sparkline of a lever: the real trend of the period, from the value before to the current one, with a
 * little life in between. Never an inverted axis: up means the number went up.
 */
export function trendSeries(from: number, to: number, seed: number, points = 12): number[] {
  const swing = Math.abs(to - from) || Math.abs(from) * 0.1;
  return Array.from({ length: points }, (_, i) => {
    const edge = i === 0 || i === points - 1;
    const wobble = edge ? 0 : Math.sin(i * 1.7 + seed) * swing * 0.14;
    return from + (to - from) * (i / (points - 1)) + wobble;
  });
}

export interface ChartTip {
  readonly title: string;
  readonly agent: string;
  readonly chatters: string;
  readonly footer: string;
}

/** The chart tip at point `i`: what the agent and the chatters sold, then yesterday or the agent's share. */
export function chartTip(period: Period, series: SalesSeries, i: number): ChartTip {
  const agent = series.agent[i] ?? 0;
  const chatters = series.chatters[i] ?? 0;
  const label = series.labels[i] ?? '';
  const past = series.past?.[i];
  return {
    title: period === 'day' ? `De 0 h à ${label}` : label,
    agent: eur(agent),
    chatters: eur(chatters),
    footer:
      period === 'day' && past !== undefined
        ? `Agent hier à la même heure : ${eur(past)}`
        : `${String(sharePercent(agent, chatters))} % vendu par l’agent`,
  };
}

/** Splits a state sentence on its **lit** part. */
export function litParts(sentence: string): { text: string; lit: boolean }[] {
  return sentence
    .split('**')
    .map((text, i) => ({ text, lit: i % 2 === 1 }))
    .filter((part) => part.text !== '');
}

/** The gauge modifier of a spend (budget rule of the design system) or of a rate (its tone). */
export function gaugeClass(kind: 'spend' | 'rate', value: number, tone: Tone): string {
  if (kind === 'rate') return tone === 'ok' ? '' : 'nv-gauge--amber';
  if (value >= 90) return 'nv-gauge--neon';
  return value >= 70 ? 'nv-gauge--amber' : '';
}

export interface Hero {
  readonly tone: Tone;
  readonly headline: string;
  readonly lead: string;
  readonly action?: string;
}

/**
 * The state sentence follows the « À traiter » list: how many things wait, and whether one is urgent. A stopped
 * agent says so first; an agent in trouble (`bad`) keeps its own sentence; an empty list is the calm sentence.
 */
export function heroState(agent: AgentState, todos: readonly Todo[], mode: AgentMode): Hero {
  if (mode === 'stop') {
    return {
      tone: 'bad',
      headline: 'L’agent est **arrêté**',
      lead: 'Plus rien ne part en son nom. Les chatteurs gardent la main dans Reveal.',
      action: 'Repasser en copilote',
    };
  }
  if (agent.tone === 'bad' || agent.tone === 'idle') return agent;
  if (todos.length === 0) {
    return {
      tone: 'ok',
      headline: 'Tout va bien. **Rien ne t’attend.**',
      lead: `${mode === 'auto' ? 'L’agent écrit seul' : 'L’agent propose, les chatteurs valident dans Reveal'}. Les alertes arrivent ici et sur ton téléphone.`,
    };
  }
  const urgent = todos.filter((todo) => todo.tone === 'bad').length;
  const waiting =
    todos.length === 1 ? '**Une chose** t’attend' : `**${String(todos.length)} choses** t’attendent`;
  if (urgent === 0) {
    return {
      tone: 'warn',
      headline: waiting,
      lead: 'Rien d’urgent : l’agent continue sur les autres conversations.',
    };
  }
  // Only urgencies: named as such. Otherwise how many of them are.
  const headline =
    urgent === todos.length
      ? urgent === 1
        ? '**Une urgence** t’attend'
        : `**${String(urgent)} urgences** t’attendent`
      : `${waiting}, dont ${urgent === 1 ? 'une urgente' : `${String(urgent)} urgentes`}`;
  return {
    tone: 'warn',
    headline,
    lead: agent.lead,
    ...(agent.action === undefined ? {} : { action: agent.action }),
  };
}
