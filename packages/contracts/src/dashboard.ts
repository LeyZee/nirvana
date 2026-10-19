import { z } from 'zod';

import { HandoffCauseSchema } from './events';
import { ConversationIdSchema, CreatorIdSchema, FanIdSchema } from './ids';

/**
 * `GET /v1/dashboard`: what the Dashboard shows for one creator (maquette v6, revue 08). Read only; every figure is
 * computed by the server. Money is in euros, durations in minutes unless named otherwise, rates in % (0 to 100).
 * Sales (ventes, leviers, entonnoir) are left out until the Reveal connector observes purchases.
 */

export const DashboardPeriodSchema = z.enum(['day', 'week', 'month']);
export type DashboardPeriod = z.infer<typeof DashboardPeriodSchema>;

export const DashboardQuerySchema = z.object({
  creatorId: CreatorIdSchema,
  period: DashboardPeriodSchema.default('day'),
});

/** The single control of the agent: Automatique, Copilote, Arrêt. */
export const AgentModeSchema = z.enum(['auto', 'copilot', 'stop']);
export type AgentMode = z.infer<typeof AgentModeSchema>;

/**
 * `PUT /v1/agent/mode`: Arrêt sets her kill switch, Copilote lifts it and brings every conversation back to the
 * copilot, Automatique is refused (409) while ADR 0019 keeps it locked. The answer is the mode now in force, as
 * `GET /v1/dashboard` gives it: Arrêt when the global switch stays on.
 */
export const SetAgentModeBodySchema = z.object({ creatorId: CreatorIdSchema, mode: AgentModeSchema });
export const AgentModeResultSchema = z.object({
  mode: AgentModeSchema,
  /** The global switch is on: Arrêt for every creator, whatever she asked, until an operator lifts it. */
  globalStop: z.boolean(),
});
export type AgentModeResult = z.infer<typeof AgentModeResultSchema>;

const percent = z.number().min(0).max(100);
const count = z.number().int().nonnegative();
const euros = z.number().nonnegative();
const at = z.iso.datetime();

/**
 * What keeps Automatique locked (ADR 0019): the live rate, the number of decided drafts, the blind test. Each
 * missing condition carries where it stands; the thresholds live on the server only.
 */
export const AutomaticMissingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('live_rate'), value: percent.nullable(), target: percent }),
  z.object({ kind: z.literal('decided_drafts'), value: count, target: count }),
  z.object({ kind: z.literal('blind_test') }),
]);
export type AutomaticMissing = z.infer<typeof AutomaticMissingSchema>;

export const DashboardToneSchema = z.enum(['ok', 'warn', 'bad']);

/** One line of « À traiter »: a conversation waiting for a human, the gravest first. */
export const DashboardTodoSchema = z.object({
  id: z.string().min(1),
  tone: DashboardToneSchema,
  /** A handoff cause, or a draft waiting for a chatter's approval. */
  kind: z.union([HandoffCauseSchema, z.literal('awaiting_approval')]),
  /** The fan's name. */
  title: z.string().min(1),
  /** One sentence: why it waits for a human, and what the agent does meanwhile. */
  why: z.string().min(1),
  /** Since when it waits. */
  at,
  waitingMinutes: count,
  conversationId: ConversationIdSchema,
  fanId: FanIdSchema,
});
export type DashboardTodo = z.infer<typeof DashboardTodoSchema>;

/** One of her best fans over the period. */
export const DashboardFanSchema = z.object({
  id: FanIdSchema,
  name: z.string().min(1),
  firstSeenAt: at,
  /** Paid over the period, and the part sold by the agent. */
  spent: euros,
  byAgent: euros,
  /** What she knows about him: his confirmed facts, a few at most. */
  notes: z.array(z.string().min(1)),
  /** The cause that froze him, while a human has his conversation. */
  alert: HandoffCauseSchema.optional(),
});
export type DashboardFan = z.infer<typeof DashboardFanSchema>;

export const DashboardSchema = z.object({
  creator: z.object({ id: CreatorIdSchema, name: z.string().min(1), timezone: z.string().min(1), now: at }),
  period: DashboardPeriodSchema,
  mode: AgentModeSchema,
  /** Automatique opens only when nothing is missing. */
  automatic: z.object({ open: z.boolean(), missing: z.array(AutomaticMissingSchema) }),
  /** Taux en réel: drafts approved without an edit among the last 200 decided, for the active voice version. */
  liveRate: z.object({
    rate: percent.nullable(),
    target: percent,
    decided: count,
    /** The same rate as it stood three weeks ago, for the trend. */
    threeWeeksAgo: percent.nullable(),
  }),
  reveal: z.object({ connected: z.boolean(), lastReadAt: at.nullable(), conversations: count }),
  voice: z.object({
    ok: z.boolean(),
    /** Median time the voice took to write, today, in milliseconds. */
    medianWriteMs: count.nullable(),
    /** Hours of the last 7 days with at least one failed voice call. */
    outagesLast7d: count,
  }),
  replies: z.object({
    /** Median time between a fan's message and her answer, over the period. */
    medianReplyMinutes: z.number().nonnegative().nullable(),
    fansWaitingOver10Min: count,
    conversationsOpen: count,
  }),
  guards: z.object({
    /** Handoffs of her day, by cause: every cause, 0 included. */
    today: z.record(HandoffCauseSchema, count),
    /** Urgent and important Telegram alerts of her night (or of the last one, by day); null when Telegram is off. */
    telegramAlertsTonight: count.nullable(),
  }),
  /**
   * Whether a Telegram group gets her urgent alerts, as Réglages › Telegram computes it. Null when Telegram is off
   * (no encryption key): the screen sends to Réglages › Telegram instead of saying no urgent alert gets through.
   */
  telegramCoverage: z.object({ urgentReachable: z.boolean() }).nullable(),
  budget: z.object({
    /** The day's AI spend, every creator together: the cap is one for the whole CRM. */
    spentToday: euros,
    cap: euros,
    alertAt: euros,
    /** Null until sales are observed. */
    costPerEuroSold: z.number().nonnegative().nullable(),
  }),
  todos: z.array(DashboardTodoSchema),
  /** Best fans first. */
  fans: z.array(DashboardFanSchema),
});
export type Dashboard = z.infer<typeof DashboardSchema>;
