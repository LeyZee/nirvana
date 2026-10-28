import {
  AlertTriggerSchema,
  ConversationIdSchema,
  EventIdSchema,
  FanIdSchema,
  type CreatorId,
  type EventId,
  type UserId,
} from '@nirvana/contracts';
import { and, eq, schema, sql, withTenant, type Database } from '@nirvana/db';
import { z } from 'zod';

import type { AlertHistory, AlertTriggerFilter } from '../../domain/ports';

import { decodeCursor, encodeCursor } from './rows';

const events = schema.conversationEvents;
const seen = schema.alertSeen;

/** Her triggers: every `alert_triggered`, and a `handoff_requested` that carries one (P4-01). */
const isTrigger = sql`(${events.type} = 'alert_triggered' or (${events.type} = 'handoff_requested' and ${events.payload} -> 'trigger' is not null))`;

const TriggerPayloadSchema = z.object({ trigger: AlertTriggerSchema });

function alertIs(alert: NonNullable<AlertTriggerFilter['alert']>): ReturnType<typeof sql> {
  return alert.kind === 'custom'
    ? sql`${events.payload} -> 'trigger' -> 'alert' ->> 'kind' = 'custom' and ${events.payload} -> 'trigger' -> 'alert' ->> 'id' = ${alert.id}`
    : sql`${events.payload} -> 'trigger' -> 'alert' ->> 'kind' = 'system' and ${events.payload} -> 'trigger' -> 'alert' ->> 'code' = ${alert.code}`;
}

/** The history of her alerts, under her RLS like everything else; the seen mark is the agency's, one per event. */
export function createDrizzleAlertHistory(db: Database): AlertHistory {
  return {
    list: (creatorId, filter, page) =>
      withTenant(db, creatorId, async (tx) => {
        const after = decodeCursor(page.cursor);
        const rows = await tx
          .select({
            id: events.id,
            type: events.type,
            payload: events.payload,
            conversationId: events.conversationId,
            fanId: schema.conversations.fanId,
            fanDisplayName: schema.fans.displayName,
            at: events.createdAt,
            seenAt: seen.seenAt,
          })
          .from(events)
          .innerJoin(schema.conversations, eq(schema.conversations.id, events.conversationId))
          .innerJoin(schema.fans, eq(schema.fans.id, schema.conversations.fanId))
          .leftJoin(seen, and(eq(seen.creatorId, events.creatorId), eq(seen.eventId, events.id)))
          .where(
            and(
              isTrigger,
              filter.seen === undefined
                ? undefined
                : filter.seen
                  ? sql`${seen.eventId} is not null`
                  : sql`${seen.eventId} is null`,
              filter.alert === undefined ? undefined : alertIs(filter.alert),
              after === null
                ? undefined
                : sql`(${events.createdAt}, ${events.id}) < (${after.at.toISOString()}::timestamptz, ${after.id}::uuid)`,
            ),
          )
          .orderBy(sql`${events.createdAt} desc, ${events.id} desc`)
          .limit(page.limit + 1);
        const items = rows.slice(0, page.limit).map((row) => ({
          id: EventIdSchema.parse(row.id),
          conversationId: ConversationIdSchema.parse(row.conversationId),
          fanId: FanIdSchema.parse(row.fanId),
          fanDisplayName: row.fanDisplayName,
          trigger: TriggerPayloadSchema.parse(row.payload).trigger,
          pausedAgent: row.type === 'handoff_requested',
          at: row.at,
          seenAt: row.seenAt,
        }));
        const last = items.at(-1);
        return {
          items,
          nextCursor: rows.length > page.limit && last !== undefined ? encodeCursor(last.at, last.id) : null,
        };
      }),

    markSeen: (creatorId: CreatorId, id: EventId, userId: UserId) =>
      withTenant(db, creatorId, async (tx) => {
        const [found] = await tx
          .select({ id: events.id })
          .from(events)
          .where(and(eq(events.id, id), isTrigger));
        if (found === undefined) return false;
        await tx.insert(seen).values({ creatorId, eventId: id, seenBy: userId }).onConflictDoNothing();
        return true;
      }),

    markSeenUntil: (creatorId, until, userId) =>
      withTenant(db, creatorId, async (tx) => {
        const marked = await tx.execute(sql`
          insert into ${seen} (creator_id, event_id, seen_by)
          select ${events.creatorId}, ${events.id}, ${userId}
          from ${events}
          where ${isTrigger} and ${events.createdAt} <= ${until.toISOString()}::timestamptz
          on conflict do nothing
          returning event_id`);
        return marked.rows.length;
      }),
  };
}
