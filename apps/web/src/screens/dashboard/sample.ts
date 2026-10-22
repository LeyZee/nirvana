import type { Dashboard, Lever, Period, Sales, SalesSeries } from './model';

/*
 * Sample data of the Dashboard, shown with the « Exemple » badge when `GET /v1/dashboard` does not answer.
 * Everything here is invented: the creator, the fans, their messages. No real fan, no real persona line.
 */

/** Sales weight of each hour: fans buy in the evening. */
const HOUR_WEIGHTS = [3, 2, 1, 1, 0, 0, 0, 1, 2, 2, 3, 3, 4, 4, 3, 3, 4, 5, 6, 8, 10, 12, 13, 11];

/** Running total of `weights`, scaled to end on `total`. */
function cumulative(weights: readonly number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  let running = 0;
  return weights.map((w) => (running += (w / sum) * total));
}

const DAYS = Array.from({ length: 30 }, (_, i) => ({
  agent: Math.round(140 + i * 7 + 70 * Math.sin(i / 2.3) + (i % 7 === 5 ? 55 : 0)),
  chatters: Math.round(230 - i * 3.4 + 40 * Math.cos(i / 3)),
}));

/** « 12 oct. » for day `i` of the last 30, the last one being 17 October 2026. */
function dayLabel(i: number): string {
  const date = new Date(Date.UTC(2026, 9, 17 - (29 - i)));
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function daysSeries(from: number): SalesSeries {
  const days = DAYS.slice(from);
  return {
    labels: days.map((_, i) => dayLabel(from + i)),
    agent: days.map((d) => d.agent),
    chatters: days.map((d) => d.chatters),
  };
}

const total = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

function levers(values: readonly (readonly [number, number])[]): Lever[] {
  const [bought = [0, 0], time = [0, 0], blocked = [0, 0]] = values;
  return [
    {
      id: 'first-offer-bought',
      label: 'Achètent la 1re offre',
      current: bought[0],
      previous: bought[1],
      tip: [
        'Fans qui achètent la 1re offre',
        'Parmi les fans à qui l’agent a proposé un premier script. La 1re offre fait 75 % des ventes : c’est le chiffre qui dit s’il vend bien.',
      ],
    },
    {
      id: 'time-to-first-offer',
      label: 'Temps avant la 1re offre',
      current: time[0],
      previous: time[1],
      tip: [
        'Temps avant la 1re offre',
        'Depuis le premier message du fan. Le bon moment est vers 2 h 30 : plus tôt il n’est pas prêt, plus tard il s’en va. Vert à 20 min près.',
      ],
    },
    {
      id: 'blocked-at-payment',
      label: 'Bloqués au paiement',
      current: blocked[0],
      previous: blocked[1],
      tip: [
        'Fans bloqués au paiement',
        'Ils voulaient acheter mais la carte ne passe pas. L’agent envoie l’aide en une phrase, puis n’insiste pas.',
      ],
    },
  ];
}

const daySales: Sales = {
  agent: 412,
  chatters: 186,
  agentBefore: 351,
  series: {
    labels: HOUR_WEIGHTS.map((_, h) => `${String(h)} h`),
    agent: cumulative(
      HOUR_WEIGHTS.map((w, h) => w * (1 + 0.25 * Math.sin(h))),
      412,
    ),
    chatters: cumulative(
      HOUR_WEIGHTS.map((w, h) => w * (1 + 0.3 * Math.cos(h / 2))),
      186,
    ),
    past: cumulative(HOUR_WEIGHTS, 380),
  },
  levers: levers([
    [31, 34],
    [140, 150],
    [4, 6],
  ]),
  funnel: { counts: [26, 22, 18, 16, 5], before: [100, 86, 69, 59, 20] },
};

const weekSeries = daysSeries(23);
const monthSeries = daysSeries(0);

const SALES: Record<Period, Sales> = {
  day: daySales,
  week: {
    agent: total(weekSeries.agent),
    chatters: total(weekSeries.chatters),
    agentBefore: total(DAYS.slice(16, 23).map((d) => d.agent)),
    series: weekSeries,
    levers: levers([
      [34, 30],
      [155, 170],
      [19, 24],
    ]),
    funnel: { counts: [96, 81, 52, 44, 15], before: [100, 85, 60, 50, 15] },
  },
  month: {
    agent: total(monthSeries.agent),
    chatters: total(monthSeries.chatters),
    agentBefore: 4880,
    series: monthSeries,
    levers: levers([
      [29, 26],
      [170, 190],
      [61, 70],
    ]),
    funnel: { counts: [380, 318, 215, 182, 53], before: [400, 328, 216, 179, 47] },
  },
};

export const SAMPLE = {
  creator: { name: 'Léa', platform: 'Reveal', now: 'vendredi 17 octobre, 23:45' },
  agent: {
    tone: 'warn',
    eyebrow: '27 conversations',
    headline: '**3 choses** t’attendent, dont une urgente',
    lead: 'Un fan est peut-être mineur : sa conversation est gelée jusqu’à ce que tu la regardes.',
    action: 'Voir l’urgence',
    foldTitle: 'L’agent fonctionne normalement',
    foldSummary: 'Reveal connecté · 27 conversations · 3 gardes · 7,40 € sur 20 € · 64 % validées',
    cards: [
      {
        id: 'reveal',
        tone: 'ok',
        title: 'Connexion à Reveal',
        value: 'Connectée',
        rows: [
          ['Dernière lecture', 'il y a 14 s'],
          ['Conversations suivies', '27'],
        ],
      },
      {
        id: 'voice',
        tone: 'ok',
        title: 'IA qui écrit les messages',
        value: 'En service',
        rows: [
          ['Temps pour écrire', '3,1 s'],
          ['Pannes', 'aucune en 7 j'],
        ],
      },
      {
        id: 'activity',
        tone: 'warn',
        title: 'Délai de réponse habituel',
        value: '1 min 40',
        rows: [
          ['Conversations en cours', '27'],
          ['Fans qui attendent plus de 10 min', '1'],
        ],
      },
      {
        id: 'guards',
        tone: 'warn',
        title: 'Gardes déclenchées',
        value: '3 aujourd’hui',
        rows: [
          ['Mineur possible', '1'],
          ['Rencontre', '1'],
          ['Manipulation', '1, bloquée seule'],
          ['Alertes Telegram cette nuit', '2'],
        ],
      },
      {
        id: 'budget',
        tone: 'ok',
        title: 'Budget IA du jour',
        value: '7,40 € sur 20 €',
        rows: [
          ['Soit', '1,8 % de ce que l’agent a vendu'],
          ['Alerte', 'à 16 €'],
          ['Au-delà de 20 €', 'l’agent s’arrête'],
        ],
        gauge: { kind: 'spend', value: 37, mark: 80 },
      },
      {
        id: 'live-rate',
        tone: 'warn',
        title: 'Taux en réel',
        value: '64 % sans retouche',
        rows: [
          ['Sur', 'les 200 dernières décidées'],
          ['Il y a 3 semaines', '46 %'],
          ['Automatique', 'à partir de 80 %'],
        ],
        gauge: { kind: 'rate', value: 64, mark: 80 },
      },
    ],
  },
  todos: [
    {
      id: 't-minor',
      tone: 'bad',
      kind: 'Mineur possible',
      title: 'Kévin parle de son bac blanc au lycée',
      why: 'L’agent ne lui écrit plus tant que tu n’as pas regardé la conversation.',
      at: '23:41',
      fanId: 'kevin',
    },
    {
      id: 't-meet',
      tone: 'warn',
      kind: 'Demande de rencontre',
      title: 'Marc propose de se voir',
      why: '« Se voir » est un mot d’alerte : l’agent ne lui répond plus tant que tu n’as pas décidé.',
      at: '22:58',
      fanId: 'marc',
    },
    {
      id: 't-wait',
      tone: 'warn',
      kind: 'À valider dans Suivi',
      title: 'Basile attend une réponse depuis 18 min',
      why: '6 messages de l’agent attendent un chatteur. Au-delà de 10 min, un fan refroidit.',
      at: '23:27',
      fanId: 'basile',
    },
  ],
  sales: SALES,
  fans: [
    {
      id: 'antoine',
      name: 'Antoine',
      line: 'abonné depuis 1 an · Genève',
      spent: 2140,
      byAgent: 1240,
      notes: ['Banquier', '45 ans, confirmé', 'Achète le soir'],
      thread: [
        { from: 'fan', text: 'tu m’as manqué cette semaine' },
        { from: 'creator', text: 'Toi aussi, raconte-moi ta semaine' },
      ],
    },
    {
      id: 'theo',
      name: 'Théo',
      line: 'abonné depuis 5 semaines · Bordeaux',
      spent: 1180,
      byAgent: 960,
      notes: ['Infirmier de nuit', '34 ans, confirmé', '3 scripts achetés'],
      thread: [
        { from: 'fan', text: 'je sors de garde, crevé' },
        { from: 'creator', text: 'Viens te reposer un peu avec moi' },
        { from: 'fan', text: 'tu me montres ?' },
        { from: 'creator', text: 'Celle-là, je l’ai prise ce matin pour toi' },
      ],
    },
    {
      id: 'basile',
      name: 'Basile',
      line: 'abonné depuis 2 mois · Lille',
      spent: 860,
      byAgent: 520,
      notes: ['Ingénieur', '29 ans, confirmé'],
      thread: [
        { from: 'creator', text: 'Tu m’as jamais dit comment s’était passé ton entretien' },
        { from: 'fan', text: 'bien ! je te raconte ce soir' },
        { from: 'flag', text: '6 messages de l’agent attendent un chatteur dans Reveal.' },
      ],
    },
    {
      id: 'marc',
      name: 'Marc',
      line: 'abonné depuis 3 semaines · Nantes',
      spent: 640,
      byAgent: 640,
      notes: ['Commercial', '41 ans, confirmé', 'Aime la marche'],
      alert: 'Demande de rencontre',
      thread: [
        { from: 'fan', text: 'franchement on devrait se voir un de ces jours' },
        { from: 'flag', text: 'Mot d’alerte « se voir ». L’agent attend ta décision avant d’écrire.' },
      ],
    },
    {
      id: 'kevin',
      name: 'Kévin',
      line: 'abonné depuis 2 jours · Lyon',
      spent: 0,
      byAgent: 0,
      notes: ['Âge non confirmé', 'Étudiant'],
      alert: 'Mineur possible',
      thread: [
        { from: 'fan', text: 'tu fais quoi ce soir ?' },
        { from: 'creator', text: 'Je me pose avec un thé et une série. Et toi ?' },
        { from: 'fan', text: 'je révise mon bac blanc demain au lycée' },
        {
          from: 'flag',
          text: 'Garde : mineur possible. Plus rien ne part à ce fan, la conversation t’attend.',
        },
      ],
    },
  ],
} satisfies Dashboard;
