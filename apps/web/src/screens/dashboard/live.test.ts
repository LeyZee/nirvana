import { describe, expect, it } from 'vitest';

import { ago, fromApi, replyDelay } from './live';

import { apiDashboard } from '@/test/fakes';

const card = (id: string, data = fromApi(apiDashboard())) => data.agent.cards.find((c) => c.id === id);

describe('fromApi', () => {
  it('writes the todos in the trade’s words, at her time', () => {
    const [todo] = fromApi(apiDashboard()).todos;
    expect(todo).toMatchObject({ kind: 'Mineur possible', title: 'Kévin', tone: 'bad', at: '13:41' });
  });

  it('writes the server’s figures the French way, nothing more', () => {
    expect(card('budget')?.value).toBe('7,40 € sur 20 €');
    expect(card('budget')?.gauge).toEqual({ kind: 'spend', value: 37, mark: 80 });
    expect(card('live-rate')?.value).toBe('64,5 % sans retouche');
    expect(card('activity')?.value).toBe('1 min 42');
    expect(card('voice')?.rows[0]).toEqual(['Temps pour écrire', '3,1 s']);
    expect(card('reveal')?.rows[0]).toEqual(['Dernière lecture', 'il y a 14 s']);
  });

  it('lists only the guards that fired, and says when Telegram is off', () => {
    expect(card('guards')?.rows).toEqual([
      ['Mineur possible', '1'],
      ['Alertes Telegram cette nuit', 'Telegram éteint'],
    ]);
  });

  it('hands Telegram’s night coverage to the banner, off included', () => {
    expect(fromApi(apiDashboard()).telegram).toEqual({ coverage: null });
    const uncovered = apiDashboard({ telegramCoverage: { urgentReachable: false } });
    expect(fromApi(uncovered).telegram).toEqual({ coverage: { urgentReachable: false } });
  });

  it('makes no sale up', () => {
    expect(fromApi(apiDashboard()).sales).toBeNull();
  });

  it('opens the reader on a waiting fan who is not among the best fans', () => {
    const fans = fromApi(apiDashboard()).fans;
    expect(fans.map((fan) => fan.name)).toEqual(['Théo', 'Kévin']);
    expect(fans[1]).toMatchObject({ spent: 0, alert: 'Mineur possible', line: 'en attente depuis 19 min' });
  });

  it('says what an urgency does to the conversation, without repeating its line', () => {
    const { agent, todos } = fromApi(apiDashboard());
    expect(agent.lead).toBe(
      'Un fan est peut-être mineur : sa conversation est gelée jusqu’à ce que tu la regardes.',
    );
    expect(agent.lead).not.toBe(todos[0]?.why);
  });

  it('says first that Reveal is disconnected, then that the voice is down', () => {
    const offline = apiDashboard({ reveal: { connected: false, lastReadAt: null, conversations: 0 } });
    expect(fromApi(offline).agent).toMatchObject({ tone: 'bad', headline: 'Reveal est **déconnecté**' });
    const mute = apiDashboard({
      voice: { ok: false, keyMissing: false, medianWriteMs: null, outagesLast7d: 3 },
    });
    expect(fromApi(mute).agent).toMatchObject({ tone: 'bad', headline: 'L’IA qui écrit **ne répond plus**' });
    expect(card('voice', fromApi(mute))?.rows[1]).toEqual(['Pannes', '3 heures en 7 j']);
  });

  it('is calm when every card is', () => {
    const calm = apiDashboard({
      liveRate: { rate: 85, target: 80, decided: 140, threeWeeksAgo: 70 },
      guards: { ...apiDashboard().guards, today: { ...apiDashboard().guards.today, minor: 0 } },
    });
    expect(fromApi(calm).agent.tone).toBe('ok');
  });
});

describe('durations', () => {
  it('writes a reply delay in minutes and seconds', () => {
    expect(replyDelay(0.5)).toBe('30 s');
    expect(replyDelay(2)).toBe('2 min');
    expect(replyDelay(1.05)).toBe('1 min 03');
  });

  it('says how long ago, in the largest unit', () => {
    const now = new Date('2026-10-19T12:00:00Z');
    expect(ago('2026-10-19T11:57:00Z', now)).toBe('il y a 3 min');
    expect(ago('2026-10-19T09:00:00Z', now)).toBe('il y a 3 h');
    expect(ago('2026-10-15T12:00:00Z', now)).toBe('il y a 4 j');
  });
});
