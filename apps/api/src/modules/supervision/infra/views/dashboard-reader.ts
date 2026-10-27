import {
  AgentHoursSchema,
  DEFAULT_AGENT_HOURS,
  HandoffCauseSchema,
  LIVE_WINDOW,
  type AgentHours,
  type DecidedDraft,
} from '@nirvana/contracts';
import { sql, withTenant, type Database, type Transaction } from '@nirvana/db';
import { z } from 'zod';

import { unansweredSince } from '../../domain/dashboard';
import type { DashboardFacts, DashboardReader, DashboardWindow } from '../../domain/dashboard-ports';

/**
 * The Dashboard's SQL views (docs/architecture/modules.md: read only, aggregates, the documented exception to
 * « each module reads its own tables »). One tenant transaction, so RLS scopes every row to the creator.
 */

const DAY_MS = 86_400_000;
const TOP_FANS = 10;
const NOTES_PER_FAN = 5;

const timestamp = z.union([z.date(), z.string()]).transform((value) => new Date(value));
const int = z.coerce.number().int().nonnegative();
const nullableNumber = z.coerce.number().nullable();

async function rows<T extends z.ZodType>(tx: Transaction, schema: T, query: ReturnType<typeof sql>) {
  const result = await tx.execute(query);
  return z.array(schema).parse(result.rows);
}

async function first<T extends z.ZodType>(tx: Transaction, schema: T, query: ReturnType<typeof sql>) {
  const [row] = await rows(tx, schema, query);
  if (row === undefined) throw new Error('aggregate query returned no row');
  return row;
}

/**
 * Decided drafts of one voice version and her active persona (ADR 0022) before a date, newest first: approved as
 * is, edited or rejected (ADR 0019). The same selection and order as the lock's reading in `conversations`, for the trend.
 */
async function decided(
  tx: Transaction,
  creatorId: string,
  window: DashboardWindow,
  before: Date,
): Promise<DecidedDraft[]> {
  const list = await rows(
    tx,
    z.object({ as_is: z.boolean() }),
    sql`select (status not in ('rejected', 'edited') and final_bubbles is null) as as_is
        from drafts
        where decided_at is not null and decided_at < ${before.toISOString()}::timestamptz
          and status in ('approved', 'edited', 'rejected', 'sent', 'failed')
          and prompt_hashes->>'voicePrompt' = ${window.voice.voicePrompt}
          and prompt_hashes->>'voiceModel' = ${window.voice.voiceModel}
          and persona_version_id is not distinct from
            (select id from persona_versions where creator_id = ${creatorId}::uuid and is_active)
        order by decided_at desc, id desc limit ${LIVE_WINDOW}`,
  );
  return list.map((row) => ({ asIs: row.as_is }));
}

async function facts(
  tx: Transaction,
  creatorId: string,
  window: DashboardWindow,
  her: { readonly hours: AgentHours; readonly timeZone: string },
) {
  const now = window.now.toISOString();
  const dayStart = window.dayStart.toISOString();
  const periodStart = window.periodStart.toISOString();

  const stopped = await rows(
    tx,
    z.object({ scope: z.string(), active: z.boolean() }),
    sql`select distinct on (scope) scope, active from kill_switches
        where scope = 'global' or (scope = 'creator' and scope_id = ${creatorId}::uuid)
        order by scope, set_at desc`,
  );
  const counts = await first(
    tx,
    z.object({ auto: int, total: int, open: int, waiting: int }),
    sql`select count(*) filter (where mode = 'auto' and state not in ('human', 'paused')) as auto,
               count(*) as total,
               count(*) filter (where state <> 'idle') as open,
               count(*) filter (where last_inbound_at < ${now}::timestamptz - interval '10 minutes'
                 and (last_outbound_at is null or last_outbound_at < last_inbound_at)) as waiting
        from conversations`,
  );
  const [account] = await rows(
    tx,
    z.object({
      session_state: z.string(),
      last_poll_at: timestamp.nullable(),
      paused_until: timestamp.nullable(),
    }),
    sql`select session_state, last_poll_at, paused_until from platform_accounts
        where platform = 'reveal' order by created_at limit 1`,
  );
  const voice = await first(
    tx,
    z.object({ median_ms: nullableNumber, outage_hours: int }),
    sql`select (select percentile_cont(0.5) within group (order by latency_ms) from llm_calls
                where role = 'voice' and status = 'ok' and created_at >= ${dayStart}::timestamptz) as median_ms,
               (select count(distinct date_trunc('hour', created_at)) from llm_calls
                where role = 'voice' and status <> 'ok'
                  and created_at >= ${now}::timestamptz - interval '7 days') as outage_hours`,
  );
  // Each message of his over the period, and her first answer after it in the same conversation.
  const replies = await first(
    tx,
    z.object({ median_minutes: nullableNumber }),
    sql`select percentile_cont(0.5) within group (
               order by extract(epoch from (answer.at - m.platform_created_at)) / 60) as median_minutes
        from messages m
        cross join lateral (
          select min(o.platform_created_at) as at from messages o
          where o.conversation_id = m.conversation_id and o.direction = 'outbound'
            and o.platform_created_at >= m.platform_created_at) answer
        where m.direction = 'inbound' and m.platform_created_at >= ${periodStart}::timestamptz
          and answer.at is not null`,
  );
  const handoffs = await rows(
    tx,
    z.object({ cause: HandoffCauseSchema, count: int }),
    sql`select payload->>'cause' as cause, count(*) as count from conversation_events
        where type = 'handoff_requested' and created_at >= ${dayStart}::timestamptz
        group by payload->>'cause'`,
  );
  // His conversation with a human: the cause of its last handoff, or `other` when the event is missing.
  const handedOver = await rows(
    tx,
    z.object({
      conversation_id: z.string(),
      fan_id: z.string(),
      fan_name: z.string(),
      cause: HandoffCauseSchema.nullable(),
      since: timestamp,
    }),
    sql`select c.id as conversation_id, c.fan_id, f.display_name as fan_name, h.cause,
               coalesce(h.created_at, c.updated_at) as since
        from conversations c
        join fans f on f.id = c.fan_id
        left join lateral (
          select payload->>'cause' as cause, created_at from conversation_events e
          where e.conversation_id = c.id and e.type = 'handoff_requested'
          order by e.seq desc limit 1) h on true
        where c.state = 'human'`,
  );
  const unread = await rows(
    tx,
    z.object({ conversation_id: z.string(), fan_id: z.string(), fan_name: z.string(), since: timestamp }),
    sql`select c.id as conversation_id, c.fan_id, f.display_name as fan_name, min(d.created_at) as since
        from drafts d
        join conversations c on c.id = d.conversation_id
        join fans f on f.id = c.fan_id
        where d.status = 'pending' and d.created_at < ${now}::timestamptz - interval '10 minutes'
          and c.state = 'awaiting_approval'
        group by c.id, c.fan_id, f.display_name`,
  );
  // A send that failed for good leaves the conversation in `error`: nothing retries it, a human must look.
  const failed = await rows(
    tx,
    z.object({ conversation_id: z.string(), fan_id: z.string(), fan_name: z.string(), since: timestamp }),
    sql`select c.id as conversation_id, c.fan_id, f.display_name as fan_name,
               coalesce(s.created_at, c.updated_at) as since
        from conversations c
        join fans f on f.id = c.fan_id
        left join lateral (
          select created_at from conversation_events e
          where e.conversation_id = c.id and e.type = 'send_failed'
          order by e.seq desc limit 1) s on true
        where c.state = 'error'`,
  );
  // The net under every other line (P3-11): his last message unanswered for 30 minutes, with no draft waiting, while
  // the conversation rests or a respond job that should have ended long ago has not. A respond put off after
  // « attends, je reviens » runs within 25 minutes, so it never shows here; nothing does while a kill switch stops
  // her or Reveal is not read, the Dashboard already says so.
  const unanswered = await rows(
    tx,
    z.object({ conversation_id: z.string(), fan_id: z.string(), fan_name: z.string(), since: timestamp }),
    sql`select c.id as conversation_id, c.fan_id, f.display_name as fan_name, c.last_inbound_at as since
        from conversations c
        join fans f on f.id = c.fan_id
        where c.state in ('idle', 'pending', 'drafting')
          and c.last_inbound_at < ${now}::timestamptz - interval '30 minutes'
          and (c.last_outbound_at is null or c.last_outbound_at < c.last_inbound_at)
          and not exists (select 1 from drafts d where d.conversation_id = c.id and d.status = 'pending')`,
  );
  // What she sold him over the period: her paid messages he unlocked, in euros (sales observed in EUR only).
  const fans = await rows(
    tx,
    z.object({
      id: z.string(),
      name: z.string(),
      first_seen_at: timestamp,
      spent_minor: int,
      by_agent_minor: int,
      notes: z.array(z.string()).nullable(),
      alert: HandoffCauseSchema.nullable(),
    }),
    sql`select f.id, f.display_name as name, f.first_seen_at,
               sum(m.price_minor) as spent_minor,
               coalesce(sum(m.price_minor) filter (where m.author = 'ai'), 0) as by_agent_minor,
               (select array_agg(n.value order by n.observed_at desc) from (
                  select value, observed_at from fan_facts ff
                  where ff.fan_id = f.id and ff.superseded_by is null
                    and (ff.expires_at is null or ff.expires_at > ${now}::timestamptz)
                  order by observed_at desc limit ${NOTES_PER_FAN}) n) as notes,
               (select h.payload->>'cause' from conversations c
                join conversation_events h on h.conversation_id = c.id and h.type = 'handoff_requested'
                where c.fan_id = f.id and c.state = 'human'
                order by h.created_at desc limit 1) as alert
        from messages m
        join conversations c on c.id = m.conversation_id
        join fans f on f.id = c.fan_id
        where m.direction = 'outbound' and m.is_paid and m.price_minor is not null and m.currency = 'EUR'
          and m.platform_created_at >= ${periodStart}::timestamptz
        group by f.id, f.display_name, f.first_seen_at
        order by spent_minor desc limit ${TOP_FANS}`,
  );

  const isPaused =
    account?.paused_until !== null &&
    account?.paused_until !== undefined &&
    account.paused_until > window.now;
  const connected =
    account !== undefined && ['valid', 'warning'].includes(account.session_state) && !isPaused;
  // Stopped, or Reveal unread (session expired, paused): every conversation would fall in the net, the banner says it.
  const quiet = stopped.some((s) => s.active) || !connected;
  return {
    switches: {
      global: stopped.some((s) => s.scope === 'global' && s.active),
      creator: stopped.some((s) => s.scope === 'creator' && s.active),
    },
    autoConversations: counts.auto,
    decidedThreeWeeksAgo: await decided(tx, creatorId, window, new Date(window.now.getTime() - 21 * DAY_MS)),
    reveal: {
      connected,
      lastReadAt: account?.last_poll_at ?? null,
      conversations: counts.total,
    },
    voice: { medianWriteMs: voice.median_ms, outageHoursLast7d: voice.outage_hours },
    replies: {
      medianReplyMinutes: replies.median_minutes,
      fansWaitingOver10Min: counts.waiting,
      conversationsOpen: counts.open,
    },
    handoffsToday: handoffs,
    waiting: [
      ...handedOver.map((h) => ({
        conversationId: h.conversation_id,
        fanId: h.fan_id,
        fanName: h.fan_name,
        kind: h.cause ?? 'other',
        since: h.since,
      })),
      ...unread.map((u) => ({
        conversationId: u.conversation_id,
        fanId: u.fan_id,
        fanName: u.fan_name,
        kind: 'awaiting_approval' as const,
        since: u.since,
      })),
      ...failed.map((f) => ({
        conversationId: f.conversation_id,
        fanId: f.fan_id,
        fanName: f.fan_name,
        kind: 'send_failed' as const,
        since: f.since,
      })),
      // Out of her reply slots the net is silent; from her opening it counts again (P3-14).
      ...(quiet ? [] : unanswered).flatMap((u) => {
        const since = unansweredSince(u.since, window.now, her);
        return since === null
          ? []
          : [
              {
                conversationId: u.conversation_id,
                fanId: u.fan_id,
                fanName: u.fan_name,
                kind: 'unanswered' as const,
                since,
              },
            ];
      }),
    ],
    fans: fans.map((f) => ({
      id: f.id,
      name: f.name,
      firstSeenAt: f.first_seen_at,
      spentMinor: f.spent_minor,
      byAgentMinor: f.by_agent_minor,
      notes: f.notes ?? [],
      alert: f.alert ?? undefined,
    })),
  } satisfies Omit<DashboardFacts, 'creator'>;
}

export function createDashboardReader(db: Database): DashboardReader {
  return {
    read: (creatorId, windowFor) =>
      withTenant(db, creatorId, async (tx) => {
        const [creator] = await rows(
          tx,
          z.object({ display_name: z.string(), timezone: z.string(), agent_hours: z.unknown() }),
          sql`select display_name, timezone, agent_hours from creators where id = ${creatorId}::uuid`,
        );
        if (creator === undefined) return undefined;
        const window = windowFor(creator.timezone);
        // Her hours as the worker reads them: none stored, or unreadable, are the defaults (always open).
        const stored = AgentHoursSchema.safeParse(creator.agent_hours);
        const her = { hours: stored.success ? stored.data : DEFAULT_AGENT_HOURS, timeZone: creator.timezone };
        return {
          facts: {
            creator: { name: creator.display_name, timezone: creator.timezone },
            ...(await facts(tx, creatorId, window, her)),
          },
          window,
        };
      }),
  };
}
