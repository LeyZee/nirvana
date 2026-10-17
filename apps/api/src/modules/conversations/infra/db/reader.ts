import {
  ConversationIdSchema,
  ConversationModeSchema,
  ConversationStateSchema,
  CurrencySchema,
  DraftIdSchema,
  DraftStatusSchema,
  FanIdSchema,
  MessageAuthorSchema,
  MessageDirectionSchema,
  MessageIdSchema,
  type ConversationSummary,
} from '@nirvana/contracts';
import { and, eq, schema, sql, withTenant, type Database, type Transaction } from '@nirvana/db';

import type { ConversationReader, PageRequest } from '../../domain/ports';

import { decodeCursor, decodeSeqCursor, encodeCursor, toStoredEvent } from './rows';

const OPEN_DRAFT_STATUSES = ['pending', 'approved', 'edited'];

/** One more row than asked tells whether a next page exists. */
function paged<T>(rows: readonly T[], page: PageRequest, cursorOf: (last: T) => string) {
  const items = rows.slice(0, page.limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > page.limit && last !== undefined ? cursorOf(last) : null };
}

async function summaries(
  tx: Transaction,
  where: ReturnType<typeof and>,
  limit: number,
): Promise<ConversationSummary[]> {
  const rows = await tx
    .select({
      id: schema.conversations.id,
      fanId: schema.conversations.fanId,
      fanDisplayName: schema.fans.displayName,
      state: schema.conversations.state,
      mode: schema.conversations.mode,
      lastInboundAt: schema.conversations.lastInboundAt,
      lastOutboundAt: schema.conversations.lastOutboundAt,
      unreadCount: schema.conversations.unreadCount,
      updatedAt: schema.conversations.updatedAt,
    })
    .from(schema.conversations)
    .innerJoin(schema.fans, eq(schema.fans.id, schema.conversations.fanId))
    .where(where)
    .orderBy(sql`${schema.conversations.updatedAt} desc, ${schema.conversations.id} desc`)
    .limit(limit);
  return rows.map((row) => ({
    id: ConversationIdSchema.parse(row.id),
    fanId: FanIdSchema.parse(row.fanId),
    fanDisplayName: row.fanDisplayName,
    state: ConversationStateSchema.parse(row.state),
    mode: ConversationModeSchema.parse(row.mode),
    lastInboundAt: row.lastInboundAt?.toISOString() ?? null,
    lastOutboundAt: row.lastOutboundAt?.toISOString() ?? null,
    unreadCount: row.unreadCount,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** The inbox's queries, in tenant transactions like everything else (RLS). */
export function createDrizzleConversationReader(db: Database): ConversationReader {
  return {
    list: (creatorId, page) =>
      withTenant(db, creatorId, async (tx) => {
        const after = decodeCursor(page.cursor);
        const rows = await summaries(
          tx,
          after === null
            ? undefined
            : sql`(${schema.conversations.updatedAt}, ${schema.conversations.id}) < (${after.at.toISOString()}::timestamptz, ${after.id}::uuid)`,
          page.limit + 1,
        );
        return paged(rows, page, (last) => encodeCursor(new Date(last.updatedAt), last.id));
      }),

    get: (creatorId, id) =>
      withTenant(db, creatorId, async (tx) => {
        const [summary] = await summaries(tx, eq(schema.conversations.id, id), 1);
        if (summary === undefined) return null;
        const drafts = await tx
          .select()
          .from(schema.drafts)
          .where(
            and(eq(schema.drafts.conversationId, id), sql`${schema.drafts.status} in ${OPEN_DRAFT_STATUSES}`),
          )
          .orderBy(schema.drafts.createdAt);
        return {
          ...summary,
          openDrafts: drafts.map((draft) => ({
            id: DraftIdSchema.parse(draft.id),
            status: DraftStatusSchema.parse(draft.status),
            bubbles: draft.bubbles,
            finalBubbles: draft.finalBubbles,
            createdAt: draft.createdAt.toISOString(),
          })),
        };
      }),

    messages: (creatorId, id, page) =>
      withTenant(db, creatorId, async (tx) => {
        const after = decodeCursor(page.cursor);
        const rows = await tx
          .select()
          .from(schema.messages)
          .where(
            and(
              eq(schema.messages.conversationId, id),
              after === null
                ? undefined
                : sql`(${schema.messages.platformCreatedAt}, ${schema.messages.id}) < (${after.at.toISOString()}::timestamptz, ${after.id}::uuid)`,
            ),
          )
          .orderBy(sql`${schema.messages.platformCreatedAt} desc, ${schema.messages.id} desc`)
          .limit(page.limit + 1);
        return paged(
          rows.map((row) => ({
            id: MessageIdSchema.parse(row.id),
            direction: MessageDirectionSchema.parse(row.direction),
            author: MessageAuthorSchema.parse(row.author),
            text: row.text,
            priceMinor: row.priceMinor,
            currency: row.currency === null ? null : CurrencySchema.parse(row.currency),
            isPaid: row.isPaid,
            draftId: row.draftId === null ? null : DraftIdSchema.parse(row.draftId),
            platformCreatedAt: row.platformCreatedAt.toISOString(),
          })),
          page,
          (last) => encodeCursor(new Date(last.platformCreatedAt), last.id),
        );
      }),

    events: (creatorId, id, page) =>
      withTenant(db, creatorId, async (tx) => {
        const before = decodeSeqCursor(page.cursor);
        const rows = await tx
          .select()
          .from(schema.conversationEvents)
          .where(
            and(
              eq(schema.conversationEvents.conversationId, id),
              before === null ? undefined : sql`${schema.conversationEvents.seq} < ${before}`,
            ),
          )
          .orderBy(sql`${schema.conversationEvents.seq} desc`)
          .limit(page.limit + 1);
        return paged(
          rows.map((row) => {
            const event = toStoredEvent(row);
            return { ...event.body, seq: event.seq, actor: event.actor, createdAt: event.at.toISOString() };
          }),
          page,
          (last) => String(last.seq),
        );
      }),
  };
}
