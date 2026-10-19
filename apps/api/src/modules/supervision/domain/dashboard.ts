import {
  ConversationIdSchema,
  FanIdSchema,
  type AgentMode,
  type CreatorId,
  type Dashboard,
  type DashboardPeriod,
  type DashboardTodo,
  type HandoffCause,
} from '@nirvana/contracts';

import { asPercent, automaticGate, LIVE_TARGET, liveRate } from './automatic';
import type {
  DashboardFacts,
  DashboardWindow,
  TelegramReading,
  WaitingConversation,
} from './dashboard-ports';

/** The day's AI budget, every creator together (packages/llm `BudgetStatus`). */
export interface BudgetReading {
  readonly spentEur: number;
  readonly capEur: number;
  readonly alertAtEur: number;
}

const MINUTE_MS = 60_000;

/** Why it waits for a human, and what the agent does meanwhile: one sentence per kind (revue 08, Clarté). */
const WHY: Readonly<Record<WaitingConversation['kind'], string>> = {
  minor: 'Il a peut-être moins de 18 ans. L’agent ne lui écrit plus.',
  non_consent: 'Un message ou un média pose une question de consentement. L’agent ne lui écrit plus.',
  distress: 'Il semble en détresse. L’agent ne lui écrit plus, un humain doit lui répondre.',
  meeting: 'Il veut la rencontrer. L’agent attend qu’un humain réponde.',
  manipulation: 'Il essaie de faire sortir l’agent de son rôle. L’agent attend un humain.',
  guard: 'Une garde a bloqué la réponse. L’agent attend un humain.',
  budget: 'Le plafond IA du jour est atteint. Un chatteur prend le relais.',
  keyword: 'Il a écrit un mot-clé d’alerte. L’agent attend un humain.',
  llm_unavailable: 'Aucun modèle IA n’a répondu. Un chatteur prend le relais.',
  other: 'L’agent a passé la main. Un humain doit lui répondre.',
  awaiting_approval: 'Un brouillon attend d’être validé depuis plus de 10 minutes.',
};

/** Safety first: a possible minor, consent or distress before everything else. */
const GRAVE: ReadonlySet<WaitingConversation['kind']> = new Set(['minor', 'non_consent', 'distress']);

/** « À traiter », the gravest first, then the longest waiting. */
export function todos(waiting: readonly WaitingConversation[], now: Date): DashboardTodo[] {
  return [...waiting]
    .sort(
      (a, b) =>
        Number(GRAVE.has(b.kind)) - Number(GRAVE.has(a.kind)) || a.since.getTime() - b.since.getTime(),
    )
    .map((w) => ({
      id: `${w.kind}-${w.conversationId}`,
      tone: GRAVE.has(w.kind) ? 'bad' : 'warn',
      kind: w.kind,
      title: w.fanName,
      why: WHY[w.kind],
      at: w.since.toISOString(),
      waitingMinutes: Math.max(0, Math.floor((now.getTime() - w.since.getTime()) / MINUTE_MS)),
      conversationId: ConversationIdSchema.parse(w.conversationId),
      fanId: FanIdSchema.parse(w.fanId),
    }));
}

/** Arrêt wins; otherwise Automatique as soon as one conversation runs on its own. */
function mode(facts: DashboardFacts): AgentMode {
  if (facts.switches.global || facts.switches.creator) return 'stop';
  return facts.autoConversations > 0 ? 'auto' : 'copilot';
}

const euros = (minor: number): number => minor / 100;
const cents = (amount: number): number => Math.round(amount * 100) / 100;

function guardsToday(handoffs: DashboardFacts['handoffsToday']): Record<HandoffCause, number> {
  const counts: Record<HandoffCause, number> = {
    minor: 0,
    non_consent: 0,
    distress: 0,
    meeting: 0,
    manipulation: 0,
    guard: 0,
    budget: 0,
    keyword: 0,
    llm_unavailable: 0,
    other: 0,
  };
  for (const { cause, count } of handoffs) counts[cause] += count;
  return counts;
}

/** The Dashboard of one creator, from the facts of the database and the day's budget. */
export function assembleDashboard(input: {
  readonly creatorId: CreatorId;
  readonly period: DashboardPeriod;
  readonly facts: DashboardFacts;
  readonly window: DashboardWindow;
  readonly budget: BudgetReading;
  readonly isVoiceOk: boolean;
  /** Undefined when Telegram is off. */
  readonly telegram: TelegramReading | undefined;
}): Dashboard {
  const { facts, window } = input;
  const reading = liveRate(facts.decided);
  // The blind test is not recorded yet (ADR 0019): until it is, Automatique stays locked.
  const gate = automaticGate({ reading, blindTestPassed: false });
  return {
    creator: {
      id: input.creatorId,
      name: facts.creator.name,
      timezone: facts.creator.timezone,
      now: window.now.toISOString(),
    },
    period: input.period,
    mode: mode(facts),
    globalStop: facts.switches.global,
    automatic: { open: gate.open, missing: [...gate.missing] },
    liveRate: {
      rate: asPercent(reading.rate),
      target: LIVE_TARGET * 100,
      decided: reading.decided,
      threeWeeksAgo: asPercent(liveRate(facts.decidedThreeWeeksAgo).rate),
    },
    reveal: {
      connected: facts.reveal.connected,
      lastReadAt: facts.reveal.lastReadAt?.toISOString() ?? null,
      conversations: facts.reveal.conversations,
    },
    voice: {
      ok: input.isVoiceOk,
      medianWriteMs: facts.voice.medianWriteMs === null ? null : Math.round(facts.voice.medianWriteMs),
      outagesLast7d: facts.voice.outageHoursLast7d,
    },
    replies: {
      medianReplyMinutes:
        facts.replies.medianReplyMinutes === null
          ? null
          : Math.round(facts.replies.medianReplyMinutes * 10) / 10,
      fansWaitingOver10Min: facts.replies.fansWaitingOver10Min,
      conversationsOpen: facts.replies.conversationsOpen,
    },
    guards: {
      today: guardsToday(facts.handoffsToday),
      telegramAlertsTonight: input.telegram?.alertsTonight ?? null,
    },
    telegramCoverage:
      input.telegram === undefined ? null : { urgentReachable: input.telegram.urgentReachable },
    budget: {
      spentToday: cents(input.budget.spentEur),
      cap: input.budget.capEur,
      alertAt: input.budget.alertAtEur,
      costPerEuroSold: null,
    },
    todos: todos(facts.waiting, window.now),
    fans: facts.fans.map((fan) => ({
      id: FanIdSchema.parse(fan.id),
      name: fan.name,
      firstSeenAt: fan.firstSeenAt.toISOString(),
      spent: euros(fan.spentMinor),
      byAgent: euros(fan.byAgentMinor),
      notes: [...fan.notes],
      ...(fan.alert !== undefined && { alert: fan.alert }),
    })),
  };
}
