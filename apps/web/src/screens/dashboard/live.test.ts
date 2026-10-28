import { describe, expect, it } from 'vitest';

import { ago, fromApi, replyDelay } from './live';

import { apiDashboard } from '@/test/fakes';

const card = (id: string, data = fromApi(apiDashboard())) => data.agent.cards.find((c) => c.id === id);

describe('fromApi', () => {
  it('writes the todos in the trade’s words, at her time', () => {
    const [todo] = fromApi(apiDashboard()).todos;
    expect(todo).toMatchObject({ kind: 'Mineur possible', title: 'Kévin', tone: 'bad', at: '13:41' });
  });

  it('names a send that failed for good', () => {
    const todos = apiDashboard().todos.map(
      (t) => ({ ...t, tone: 'warn', kind: 'send_failed' }) satisfies typeof t,
    );
    const [todo] = fromApi(apiDashboard({ todos })).todos;
    expect(todo).toMatchObject({ kind: 'Envoi échoué', tone: 'warn' });
  });

  it('names a message left with no answer (P3-11)', () => {
    const todos = apiDashboard().todos.map(
      (t) => ({ ...t, tone: 'warn', kind: 'unanswered' }) satisfies typeof t,
    );
    const [todo] = fromApi(apiDashboard({ todos })).todos;
    expect(todo).toMatchObject({ kind: 'Sans réponse', tone: 'warn' });
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

  it('keeps the best fans only, a waiting fan is read in Suivi', () => {
    expect(fromApi(apiDashboard()).fans.map((fan) => fan.name)).toEqual(['Théo']);
  });

  it('says what an urgency does to the conversation, without repeating its line', () => {
    const { agent, todos } = fromApi(apiDashboard());
    expect(agent.lead).toBe(
      'Un fan est peut-être mineur : sa conversation est gelée jusqu’à ce que tu la regardes.',
    );
    expect(agent.lead).not.toBe(todos[0]?.why);
  });

  it('says a Reveal never linked is a step to come, in no colour, not an outage', () => {
    const unlinked = fromApi(
      apiDashboard({
        reveal: { connected: false, lastReadAt: null, late: false, conversations: 0 },
        voice: { ok: false, keyMissing: false, medianWriteMs: null, outagesLast7d: 0 },
      }),
    );
    expect(unlinked.agent).toMatchObject({ tone: 'idle', headline: 'Reveal n’est **pas encore relié**' });
    expect(card('reveal', unlinked)).toMatchObject({ tone: 'idle', value: 'Pas encore reliée' });
    expect(unlinked.agent.foldSummary).toContain('Reveal pas encore relié');
    // Reveal speaks first, the voice is said in the same lead, not only in the fold.
    expect(unlinked.agent.lead).toContain('L’IA qui écrit ne répond pas non plus.');
  });

  it('says a missing key is a step to take, in amber, and where the key goes', () => {
    const noKey = fromApi(
      apiDashboard({ voice: { ok: false, keyMissing: true, medianWriteMs: null, outagesLast7d: 0 } }),
    );
    expect(noKey.agent).toMatchObject({
      tone: 'warn',
      stalled: true,
      headline: 'L’IA qui écrit **attend sa clé**',
      action: 'Poser la clé',
      actionTo: '/reglages/modeles-ia',
    });
    // The page has no « Services » heading: the lead names the page only.
    expect(noKey.agent.lead).toContain('Pose-la dans Réglages › Modèles IA.');
    expect(card('voice', noKey)).toMatchObject({ tone: 'warn', value: 'Clé manquante' });
    expect(card('voice', noKey)?.rows[0]).toEqual(['À poser dans', 'Réglages › Modèles IA']);
    // Never linked and no key: Reveal leads, the key is said in the same lead.
    const both = fromApi(
      apiDashboard({
        reveal: { connected: false, lastReadAt: null, late: false, conversations: 0 },
        voice: { ok: false, keyMissing: true, medianWriteMs: null, outagesLast7d: 0 },
      }),
    );
    expect(both.agent.lead).toContain('L’IA qui écrit attend aussi sa clé.');
  });

  it('says jobs the worker gave up on in amber, and none when it could not count them', () => {
    const stuck = fromApi(apiDashboard({ jobs: { dead: 3 } }));
    expect(card('activity', stuck)).toMatchObject({ tone: 'warn' });
    expect(card('activity', stuck)?.rows).toContainEqual(['Tâches bloquées', '3, à regarder']);
    expect(stuck.agent.foldSummary).toContain('3 tâches bloquées');
    expect(card('activity')?.rows).toContainEqual(['Tâches bloquées', 'aucune']);
    const unread = fromApi(apiDashboard({ jobs: { dead: null } }));
    expect(card('activity', unread)?.rows).toContainEqual(['Tâches bloquées', 'pas lu']);
    expect(card('activity', unread)?.tone).toBe('ok');
    expect(unread.agent.foldSummary).not.toContain('bloquée');
  });

  it('opens every line in Suivi, on its conversation', () => {
    const [draft] = apiDashboard().todos;
    if (draft === undefined) throw new Error('the fixture has a todo');
    expect(fromApi(apiDashboard()).todos[0]?.conversationId).toBe(draft.conversationId);
    const [todo] = fromApi(
      apiDashboard({ todos: [{ ...draft, tone: 'warn', kind: 'awaiting_approval' }] }),
    ).todos;
    expect(todo).toMatchObject({ kind: 'À valider dans Suivi', conversationId: draft.conversationId });
  });

  it('says a Reveal no longer read in amber, never « Connectée » (recette 28/10, G8)', () => {
    const late = fromApi(
      apiDashboard({
        reveal: { connected: true, lastReadAt: '2026-10-19T11:30:00Z', late: true, conversations: 12 },
      }),
    );
    expect(card('reveal', late)).toMatchObject({ tone: 'warn', value: 'Lecture en retard' });
    expect(card('reveal', late)?.rows[0]).toEqual(['Dernière lecture', 'il y a 30 min']);
    expect(late.agent).toMatchObject({ tone: 'warn', stalled: true, headline: 'Reveal n’est **plus lu**' });
    expect(late.agent.lead).toContain('lu pour la dernière fois il y a 30 min');
    expect(late.agent.foldSummary).toContain('Reveal lu en retard');
    expect(card('reveal')).toMatchObject({ tone: 'ok', value: 'Connectée' });
  });

  it('names what « pas encore mesuré » is about in the summary (recette 28/10, M9)', () => {
    const unmeasured = fromApi(
      apiDashboard({ liveRate: { rate: null, target: 80, decided: 0, threeWeeksAgo: null } }),
    );
    expect(unmeasured.agent.foldSummary).toMatch(/ · taux en réel pas encore mesuré$/u);
  });

  it('says first that Reveal is disconnected, then that the voice is down', () => {
    const offline = apiDashboard({
      reveal: { connected: false, lastReadAt: '2026-10-19T11:00:00Z', late: false, conversations: 0 },
    });
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

describe('fromApi for a creator', () => {
  it('shows none of the agency’s figures: its AI spend, its stuck jobs, where its key goes', () => {
    const data = fromApi(
      apiDashboard({
        budget: { spentToday: null, cap: 20, alertAt: 16, costPerEuroSold: null },
        jobs: { dead: null },
        voice: { ok: false, keyMissing: true, medianWriteMs: null, outagesLast7d: 0 },
      }),
      true,
    );
    expect(card('budget', data)).toBeUndefined();
    expect(card('activity', data)?.rows.map(([label]) => label)).not.toContain('Tâches bloquées');
    expect(card('voice', data)?.rows.map(([label]) => label)).not.toContain('À poser dans');
    expect(data.agent.foldSummary).not.toContain('€');
  });
});
