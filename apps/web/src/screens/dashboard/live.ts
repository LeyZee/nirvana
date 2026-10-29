import {
  type HandoffCause,
  type Dashboard as ApiDashboard,
  type DashboardFan,
  type DashboardTodo,
} from '@nirvana/contracts';

import { eur } from './logic';
import type { AgentCard, AgentState, Dashboard, Fan, Todo } from './model';

import { CAUSE_LABELS } from '@/agent/causes';
import { percent } from '@/agent/mode';
import { cityOf, readerZone, withFirstOfMonth } from '@/scheduling/time';
import { telegramNightOf } from '@/settings/telegram/NightBanner';

/*
 * `GET /v1/dashboard` in the screen's words. The server measured everything; this file only writes it in French,
 * in the creator's time zone. Sales stay out until the Reveal connector observes purchases.
 */

/** What a handoff or a waiting draft is called on the screen, in the trade's words. */
const KIND_LABEL: Readonly<Record<DashboardTodo['kind'], string>> = {
  ...CAUSE_LABELS,
  awaiting_approval: 'À valider dans Suivi',
  send_failed: 'Envoi échoué',
  unanswered: 'Sans réponse',
};

/**
 * The hero's sentence under an urgency: what it is and what it does to the conversation, without repeating the line
 * of « À traiter ». Nothing for the other natures: the line says it all.
 */
const URGENT_LEAD: Readonly<Partial<Record<DashboardTodo['kind'], string>>> = {
  minor: 'Un fan est peut-être mineur : sa conversation est gelée jusqu’à ce que tu la regardes.',
  non_consent: 'Un échange touche au consentement : la conversation est gelée jusqu’à ce que tu la regardes.',
  distress: 'Un fan semble en détresse : l’agent s’est retiré, il a besoin d’un humain.',
  meeting: 'Un fan demande une rencontre : l’agent s’est retiré de la conversation.',
  manipulation: 'Un fan essaie de manipuler l’agent : il s’est retiré de la conversation.',
};

/** The Dashboard's reader shows no thread: it says where the conversation is read. */
const NO_THREAD = 'Le fil de la conversation se lit dans Suivi ou dans Reveal.';

const plural = (n: number, one: string, many: string): string => `${String(n)} ${n > 1 ? many : one}`;

/** « 7,40 € »: the AI spend is small, its cents matter. */
const euroCents = (value: number): string =>
  `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0€`;

/** « 1 min 40 » from minutes with a tenth; « 45 s » under a minute. */
export function replyDelay(minutes: number): string {
  const seconds = Math.round(minutes * 60);
  if (seconds < 60) return `${String(seconds)} s`;
  const rest = seconds % 60;
  return rest === 0
    ? `${String(Math.floor(seconds / 60))} min`
    : `${String(Math.floor(seconds / 60))} min ${String(rest).padStart(2, '0')}`;
}

/** « il y a 14 s », « il y a 3 min », « il y a 2 h », « il y a 4 j ». */
export function ago(iso: string, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `il y a ${String(seconds)} s`;
  if (seconds < 3600) return `il y a ${String(Math.floor(seconds / 60))} min`;
  if (seconds < 86_400) return `il y a ${String(Math.floor(seconds / 3600))} h`;
  return `il y a ${String(Math.floor(seconds / 86_400))} j`;
}

/** « 3 semaines », « 2 mois », « 5 jours »: how long ago a fan first wrote. */
function since(iso: string, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
  if (days < 14) return plural(Math.max(1, days), 'jour', 'jours');
  if (days < 60) return plural(Math.floor(days / 7), 'semaine', 'semaines');
  if (days < 365) return `${String(Math.floor(days / 30))} mois`;
  return plural(Math.floor(days / 365), 'an', 'ans');
}

function clock(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone });
}

/**
 * « lundi 19 octobre, 14:02 », in her time zone. When the reader's clock reads another time, the city of hers follows
 * (« …, heure de Tokyo »): every time of the page is hers (recette 28/10, M15).
 */
function today(iso: string, timeZone: string, viewerZone: string): string {
  const at = (zone: string): string =>
    `${new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zone })}, ${clock(iso, zone)}`;
  const hers = at(timeZone);
  return hers === at(viewerZone) ? hers : `${hers}, heure de ${cityOf(timeZone)}`;
}

/**
 * The handoffs a guard set off: what the fan wrote or what the agent was about to write. Named one by one, so that a new
 * cause counts only once it is put here: a ceiling of spend reached, a voice that does not answer, no active persona or
 * a hand given for no named reason are relays, not guards, and their own cards say them.
 */
const GUARD_CAUSES = [
  'minor',
  'non_consent',
  'distress',
  'meeting',
  'manipulation',
  'guard',
  'keyword',
  'custom_alert',
  'identity_doubt',
] as const satisfies readonly HandoffCause[];

/** Over which span the reply delay is measured: the period of the page. */
const REPLY_SPAN: Readonly<Record<ApiDashboard['period'], string>> = {
  day: 'aujourd’hui',
  week: 'sur 7 jours',
  month: 'sur 30 jours',
};

function agentState(api: ApiDashboard, now: Date, forCreator: boolean): AgentState {
  const { reveal, voice, jobs, replies, guards, budget, liveRate, todos } = api;
  // Never read once and not connected: no account was ever linked. A step to come, not an outage.
  const unlinked = !reveal.connected && reveal.lastReadAt === null;
  // The session holds but nobody reads it any more: never green, the last read says since when.
  const late = reveal.connected && reveal.late;
  const guardCount = GUARD_CAUSES.reduce((sum, cause) => sum + guards.today[cause], 0);
  const rateText = liveRate.rate === null ? 'pas encore mesuré' : `${percent(liveRate.rate)} sans retouche`;
  const rateOk = liveRate.rate !== null && liveRate.rate >= liveRate.target;
  // Null for a creator: the agency's spend is not hers (ADR 0023), and her fold leaves the card out.
  const spent = budget.spentToday;
  const budgetCard: AgentCard | null =
    spent === null
      ? null
      : {
          id: 'budget',
          tone: spent >= budget.cap ? 'bad' : spent >= budget.alertAt ? 'warn' : 'ok',
          title: 'Budget IA du jour',
          value: `${euroCents(spent)} sur ${eur(budget.cap)}`,
          rows: [
            ['Compté', 'pour toutes les créatrices'],
            ['Alerte', `à ${eur(budget.alertAt)}`],
            [`Au-delà de ${eur(budget.cap)}`, 'l’agent s’arrête'],
          ],
          gauge: {
            kind: 'spend',
            value: budget.cap > 0 ? Math.min(100, Math.round((spent / budget.cap) * 100)) : 0,
            mark: budget.cap > 0 ? Math.round((budget.alertAt / budget.cap) * 100) : 0,
          },
        };
  const cards: AgentState['cards'] = [
    {
      id: 'reveal',
      tone: late ? 'warn' : reveal.connected ? 'ok' : unlinked ? 'idle' : 'bad',
      title: 'Connexion à Reveal',
      value: late
        ? 'Lecture en retard'
        : reveal.connected
          ? 'Connectée'
          : unlinked
            ? 'Pas encore reliée'
            : 'Déconnectée',
      rows: [
        ['Dernière lecture', reveal.lastReadAt === null ? 'jamais' : ago(reveal.lastReadAt, now)],
        ['Conversations suivies', String(reveal.conversations)],
      ],
    },
    {
      id: 'voice',
      // No key is a step to take, not an outage: amber, and the tip says where the key goes.
      tone: voice.ok ? 'ok' : voice.keyMissing ? 'warn' : 'bad',
      title: 'IA qui écrit les messages',
      value: voice.ok ? 'En service' : voice.keyMissing ? 'Clé manquante' : 'Ne répond plus',
      rows: [
        ...(voice.keyMissing && !forCreator ? [['À poser dans', 'Réglages › Modèles IA'] as const] : []),
        [
          'Temps pour écrire',
          voice.medianWriteMs === null
            ? 'pas encore mesuré'
            : `${(voice.medianWriteMs / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`,
        ],
        [
          'Pannes',
          voice.outagesLast7d === 0
            ? 'aucune en 7 j'
            : `${plural(voice.outagesLast7d, 'heure', 'heures')} en 7 j`,
        ],
      ],
    },
    {
      id: 'activity',
      // A job the worker gave up on is work that will not happen until someone looks: amber.
      tone: replies.fansWaitingOver10Min > 0 || (jobs.dead ?? 0) > 0 ? 'warn' : 'ok',
      // Measured over the period chosen for the sales: the title says which (recette 28/10, M11).
      title: `Délai de réponse habituel ${REPLY_SPAN[api.period]}`,
      value:
        replies.medianReplyMinutes === null ? 'pas encore mesuré' : replyDelay(replies.medianReplyMinutes),
      rows: [
        ['Conversations en cours', String(replies.conversationsOpen)],
        ['Fans qui attendent plus de 10 min', String(replies.fansWaitingOver10Min)],
        // The agency's work queue: a creator does not read it (ADR 0023).
        ...(forCreator
          ? []
          : [
              [
                'Tâches bloquées',
                jobs.dead === null
                  ? 'pas lu'
                  : jobs.dead === 0
                    ? 'aucune'
                    : `${String(jobs.dead)}, à regarder`,
              ] as const,
            ]),
      ],
    },
    {
      id: 'guards',
      tone: guardCount > 0 ? 'warn' : 'ok',
      title: 'Gardes déclenchées',
      value: guardCount === 0 ? 'aucune aujourd’hui' : `${String(guardCount)} aujourd’hui`,
      rows: [
        ...GUARD_CAUSES.filter((cause) => guards.today[cause] > 0).map((cause): [string, string] => [
          KIND_LABEL[cause],
          String(guards.today[cause]),
        ]),
        [
          'Alertes Telegram cette nuit',
          guards.telegramAlertsTonight === null ? 'Telegram éteint' : String(guards.telegramAlertsTonight),
        ],
      ],
    },
    ...(budgetCard === null ? [] : [budgetCard]),
    {
      id: 'live-rate',
      tone: rateOk ? 'ok' : 'warn',
      title: 'Taux en réel',
      value: rateText,
      rows: [
        ['Sur', plural(liveRate.decided, 'brouillon décidé', 'brouillons décidés')],
        [
          'Il y a 3 semaines',
          liveRate.threeWeeksAgo === null ? 'pas encore mesuré' : percent(liveRate.threeWeeksAgo),
        ],
        ['Automatique', `à partir de ${percent(liveRate.target)}`],
      ],
      gauge: { kind: 'rate', value: liveRate.rate ?? 0, mark: liveRate.target },
    },
  ];

  const summary = [
    `Reveal ${late ? 'lu en retard' : reveal.connected ? 'connecté' : unlinked ? 'pas encore relié' : 'déconnecté'}`,
    plural(reveal.conversations, 'conversation', 'conversations'),
    plural(guardCount, 'garde', 'gardes'),
    ...(jobs.dead !== null && jobs.dead > 0 ? [plural(jobs.dead, 'tâche bloquée', 'tâches bloquées')] : []),
    ...(spent === null ? [] : [`${euroCents(spent)} sur ${eur(budget.cap)}`]),
    // Said with what it measures: « pas encore mesuré » alone names nothing.
    `taux en réel ${rateText}`,
  ].join(' · ');
  const base = {
    eyebrow: plural(reveal.conversations, 'conversation', 'conversations'),
    foldSummary: summary,
    cards,
  };
  // Reveal speaks first, but a voice down too is said in the same sentence, never only in the fold.
  const alsoVoice = voice.ok
    ? ''
    : voice.keyMissing
      ? ' L’IA qui écrit attend aussi sa clé.'
      : ' L’IA qui écrit ne répond pas non plus.';
  if (unlinked) {
    return {
      ...base,
      tone: 'idle',
      headline: 'Reveal n’est **pas encore relié**',
      lead: `L’agent commencera à lire les conversations dès que la session Reveal sera capturée depuis l’extension.${alsoVoice}`,
      foldTitle: 'Rien ne tourne encore',
    };
  }
  // An agent in trouble says so before anything that waits: Reveal first, it is what everything reads.
  if (!reveal.connected) {
    return {
      ...base,
      tone: 'bad',
      headline: 'Reveal est **déconnecté**',
      lead: `L’agent ne lit plus les conversations. Reconnecte la session Reveal depuis l’extension.${alsoVoice}`,
      foldTitle: 'Quelque chose ne va pas',
    };
  }
  // The session holds, nothing reads it: not an outage of Reveal, but the fans' messages no longer come in.
  if (late && reveal.lastReadAt !== null) {
    return {
      ...base,
      tone: 'warn',
      stalled: true,
      headline: 'Reveal n’est **plus lu**',
      lead: `La session tient, mais Reveal a été lu pour la dernière fois ${ago(reveal.lastReadAt, now)}. Les nouveaux messages des fans n’arrivent plus à l’agent.${alsoVoice}`,
      foldTitle: 'Quelque chose ne va pas',
    };
  }
  if (voice.keyMissing) {
    return {
      ...base,
      tone: 'warn',
      stalled: true,
      headline: 'L’IA qui écrit **attend sa clé**',
      lead: 'Pose-la dans Réglages › Modèles IA. D’ici là, les conversations restent aux chatteurs dans Reveal.',
      action: 'Poser la clé',
      actionTo: '/reglages/modeles-ia',
      leadWithoutAction:
        'Le propriétaire la pose dans Réglages › Modèles IA. D’ici là, les conversations restent aux chatteurs dans Reveal.',
      foldTitle: 'Une étape reste à faire',
    };
  }
  if (!voice.ok) {
    return {
      ...base,
      tone: 'bad',
      headline: 'L’IA qui écrit **ne répond plus**',
      lead: 'Les conversations passent aux chatteurs dans Reveal jusqu’à son retour.',
      foldTitle: 'Quelque chose ne va pas',
    };
  }
  const urgent = todos.find((todo) => todo.tone === 'bad');
  return {
    ...base,
    tone: cards.some((card) => card.tone !== 'ok') ? 'warn' : 'ok',
    headline: '',
    lead: urgent === undefined ? '' : (URGENT_LEAD[urgent.kind] ?? ''),
    action: 'Voir l’urgence',
    foldTitle: 'L’agent fonctionne normalement',
  };
}

function todoOf(todo: DashboardTodo, timeZone: string): Todo {
  return {
    id: todo.id,
    tone: todo.tone,
    kind: KIND_LABEL[todo.kind],
    title: todo.title,
    why: todo.why,
    at: clock(todo.at, timeZone),
    fanId: todo.fanId,
    // Every line is handled in Suivi, on its conversation: a draft is decided there, a handoff given back there.
    conversationId: todo.conversationId,
  };
}

function fanOf(fan: DashboardFan, now: Date): Fan {
  return {
    id: fan.id,
    name: fan.name,
    conversationId: fan.conversationId,
    line: `premier message il y a ${since(fan.firstSeenAt, now)}`,
    spent: fan.spent,
    byAgent: fan.byAgent,
    notes: fan.notes,
    ...(fan.alert === undefined ? {} : { alert: KIND_LABEL[fan.alert] }),
    thread: [{ from: 'flag', text: NO_THREAD }],
  };
}

/** « 27 octobre », « 1er novembre » once `withFirstOfMonth` has read it. */
const ECB_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * How the best fans' dollars were counted (choix de Charles, 28/10): at the last ECB rate known, the one pay keeps,
 * or not at all while none is known. Nothing when no dollar sale falls in the period.
 */
export function usdNote(usdSales: ApiDashboard['usdSales']): string | undefined {
  if (!usdSales.seen) return undefined;
  if (usdSales.rate === null)
    return 'Les ventes en dollars ne sont pas comptées : aucun taux BCE n’est encore connu.';
  // An ECB day is a calendar day: read in UTC, it never shifts by a time zone.
  const day = withFirstOfMonth(ECB_DAY.formatToParts(new Date(`${usdSales.rate.day}T00:00:00Z`)));
  return `Dollars convertis en euros au taux BCE du ${day}.`;
}

/** The server's Dashboard as the screen draws it. `sales` is null: nothing is invented in its place. */
export function fromApi(api: ApiDashboard, forCreator = false, viewerZone = readerZone()): Dashboard {
  const now = new Date(api.creator.now);
  const timeZone = api.creator.timezone;
  const dollars = usdNote(api.usdSales);
  return {
    creator: {
      name: api.creator.name,
      platform: 'Reveal',
      now: today(api.creator.now, timeZone, viewerZone),
    },
    agent: agentState(api, now, forCreator),
    todos: api.todos.map((todo) => todoOf(todo, timeZone)),
    sales: null,
    telegram: telegramNightOf(api),
    fans: api.fans.map((fan) => fanOf(fan, now)),
    ...(dollars === undefined ? {} : { usdNote: dollars }),
  };
}
