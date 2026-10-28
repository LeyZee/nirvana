import { describe, expect, it } from 'vitest';

import {
  chartTip,
  changePercent,
  eur,
  gaugeClass,
  heroState,
  hoursMinutes,
  leverView,
  litParts,
  sharePercent,
  signed,
  trendSeries,
} from './logic';
import { PERIODS, type AgentState, type Lever, type Todo } from './model';
import { SAMPLE } from './sample';

const agent: AgentState = {
  tone: 'warn',
  eyebrow: '3 conversations',
  headline: 'ignored',
  lead: 'Un fan est peut-être mineur.',
  action: 'Voir l’urgence',
  foldTitle: '',
  foldSummary: '',
  cards: [],
};
const todo = (id: string, tone: Todo['tone']): Todo => ({
  id,
  tone,
  kind: 'k',
  title: 't',
  why: 'w',
  at: '23:00',
});
const lever = (id: Lever['id'], current: number, previous: number): Lever => ({
  id,
  label: '',
  current,
  previous,
  tip: ['', ''],
});

describe('formatting', () => {
  it('writes euros, durations and signs the French way', () => {
    expect(eur(1846).replace(/\s/gu, ' ')).toBe('1 846 €');
    // The cents are never rounded away: 10,50 € is not 11 €.
    expect(eur(10.5)).toBe('10,50 €');
    expect(eur(1846.4).replace(/\s/gu, ' ')).toBe('1 846,40 €');
    expect(hoursMinutes(125)).toBe('2 h 05');
    expect(hoursMinutes(-3)).toBe('0 h 00');
    expect(signed(12)).toBe('+12');
    expect(signed(-6)).toBe('−6');
    expect(signed(0)).toBe('0');
  });

  it('computes changes and shares without dividing by zero', () => {
    expect(changePercent(412, 351)).toBe(17);
    expect(changePercent(10, 0)).toBe(0);
    expect(sharePercent(412, 186)).toBe(69);
    expect(sharePercent(0, 0)).toBe(0);
  });

  it('splits the lit part of a sentence', () => {
    expect(litParts('**3 choses** t’attendent')).toEqual([
      { text: '3 choses', lit: true },
      { text: ' t’attendent', lit: false },
    ]);
  });
});

describe('leverView', () => {
  it('moves a rate in points and a count of fans in fans, fewer blocked being better', () => {
    expect(leverView(lever('first-offer-bought', 31, 34))).toMatchObject({ delta: '−3 pts', better: false });
    expect(leverView(lever('blocked-at-payment', 4, 6))).toMatchObject({
      unit: 'fans',
      delta: '−2',
      better: true,
    });
  });

  it('judges the time before the first offer against 2 h 30, give or take 20 min', () => {
    expect(leverView(lever('time-to-first-offer', 140, 200))).toMatchObject({
      value: '2 h 20',
      delta: 'repère 2 h 30',
      better: true,
    });
    expect(leverView(lever('time-to-first-offer', 60, 150)).better).toBe(false);
  });
});

describe('trendSeries', () => {
  it('runs from the value before to the current one', () => {
    const trend = trendSeries(34, 31, 1);
    expect(trend).toHaveLength(12);
    expect(trend[0]).toBe(34);
    expect(trend[11]).toBe(31);
  });
});

describe('chartTip', () => {
  const series = { labels: ['0 h', '1 h'], agent: [10, 30], chatters: [10, 10], past: [5, 25] };
  it('compares with yesterday on the day view, gives the agent’s share otherwise', () => {
    expect(chartTip('day', series, 1)).toMatchObject({ title: 'De 0 h à 1 h' });
    expect(chartTip('day', series, 1).footer).toMatch(/^Agent hier à la même heure/u);
    expect(chartTip('week', series, 1).footer).toBe('75 % vendu par l’agent');
  });
});

describe('gaugeClass', () => {
  it('turns a spend amber at 70 % and neon at 90 %, a rate amber until it is ok', () => {
    expect(gaugeClass('spend', 37, 'ok')).toBe('');
    expect(gaugeClass('spend', 75, 'ok')).toBe('nv-gauge--amber');
    expect(gaugeClass('spend', 95, 'ok')).toBe('nv-gauge--neon');
    expect(gaugeClass('rate', 64, 'warn')).toBe('nv-gauge--amber');
  });
});

describe('heroState', () => {
  it('says the agent is stopped before anything else', () => {
    const hero = heroState(agent, [todo('a', 'bad')], 'stop');
    expect(hero).toMatchObject({ tone: 'bad', action: 'Repasser en copilote' });
    expect(hero.headline).toContain('**arrêté**');
  });

  it('is calm when nothing waits', () => {
    expect(heroState(agent, [], 'copilot')).toMatchObject({ tone: 'ok' });
    expect(heroState(agent, [], 'copilot').action).toBeUndefined();
  });

  it('counts what waits and offers the action only when one is urgent', () => {
    expect(heroState(agent, [todo('a', 'warn')], 'copilot')).toMatchObject({
      headline: '**Une chose** t’attend',
    });
    expect(heroState(agent, [todo('a', 'warn')], 'copilot').action).toBeUndefined();
    expect(heroState(agent, [todo('a', 'bad'), todo('b', 'warn')], 'copilot')).toMatchObject({
      headline: '**2 choses** t’attendent, dont une urgente',
      action: 'Voir l’urgence',
    });
  });

  it('names urgencies as such when nothing else waits, and counts them', () => {
    expect(heroState(agent, [todo('a', 'bad')], 'copilot').headline).toBe('**Une urgence** t’attend');
    expect(heroState(agent, [todo('a', 'bad'), todo('b', 'bad')], 'copilot').headline).toBe(
      '**2 urgences** t’attendent',
    );
    expect(
      heroState(agent, [todo('a', 'bad'), todo('b', 'bad'), todo('c', 'warn')], 'copilot').headline,
    ).toBe('**3 choses** t’attendent, dont 2 urgentes');
  });

  it('keeps the sentence of an agent in trouble', () => {
    const broken: AgentState = { ...agent, tone: 'bad', headline: 'Reveal est **déconnecté**' };
    expect(heroState(broken, [], 'copilot').headline).toBe('Reveal est **déconnecté**');
  });
});

describe('sample data', () => {
  it('stays coherent: todos open a known fan, the series end on the totals', () => {
    const fanIds = new Set(SAMPLE.fans.map((fan) => fan.id));
    for (const item of SAMPLE.todos) expect(fanIds.has(item.fanId)).toBe(true);
    const day = SAMPLE.sales.day;
    expect(Math.round(day.series.agent.at(-1) ?? 0)).toBe(day.agent);
    expect(Math.round(day.series.chatters.at(-1) ?? 0)).toBe(day.chatters);
    for (const period of PERIODS) {
      const { counts, before } = SAMPLE.sales[period.id].funnel;
      expect(counts).toHaveLength(5);
      expect(before).toHaveLength(5);
    }
  });
});

describe('heroState for a creator', () => {
  it('names no conversation and offers no action, whatever waits', () => {
    const hero = heroState(agent, [todo('a', 'bad')], 'copilot', true);
    expect(hero).toMatchObject({ tone: 'ok', headline: 'Tout va bien. **Rien ne t’attend.**' });
    expect(hero.action).toBeUndefined();
    expect(hero.lead).toContain('L’agence suit les conversations');
  });

  it('leaves a stopped agent to the agency', () => {
    const hero = heroState(agent, [], 'stop', true);
    expect(hero.headline).toBe('L’agent est **arrêté**');
    expect(hero.action).toBeUndefined();
  });
});
