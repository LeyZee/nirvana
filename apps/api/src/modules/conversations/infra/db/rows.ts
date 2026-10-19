import {
  ActorSchema,
  ConversationIdSchema,
  ConversationModeSchema,
  ConversationStateSchema,
  CreatorIdSchema,
  DraftIdSchema,
  DomainError,
  DraftStatusSchema,
  EventBodySchema,
  FanIdSchema,
  PlatformAccountIdSchema,
} from '@nirvana/contracts';
import type { schema } from '@nirvana/db';
import { z } from 'zod';

import type { Conversation, Draft, StoredEvent } from '../../domain/ports';

/** Rows read back from Postgres are validated like any other boundary (CLAUDE.md rule 6). */

export function toConversation(row: typeof schema.conversations.$inferSelect): Conversation {
  return {
    id: ConversationIdSchema.parse(row.id),
    creatorId: CreatorIdSchema.parse(row.creatorId),
    platformAccountId: PlatformAccountIdSchema.parse(row.platformAccountId),
    fanId: FanIdSchema.parse(row.fanId),
    platformConversationId: row.platformConversationId,
    state: ConversationStateSchema.parse(row.state),
    mode: ConversationModeSchema.parse(row.mode),
    lastInboundAt: row.lastInboundAt,
    lastOutboundAt: row.lastOutboundAt,
    unreadCount: row.unreadCount,
  };
}

export function toDraft(row: typeof schema.drafts.$inferSelect): Draft {
  return {
    id: DraftIdSchema.parse(row.id),
    conversationId: ConversationIdSchema.parse(row.conversationId),
    status: DraftStatusSchema.parse(row.status),
    bubbles: row.bubbles,
    finalBubbles: row.finalBubbles,
    createdAt: row.createdAt,
  };
}

const PayloadObjectSchema = z.record(z.string(), z.unknown());

/**
 * Payload shapes the journal still holds from before a contract change, brought to the current shape on read (ADR
 * 0007, « Évolution des payloads »): the journal is never rewritten. A field the current shape requires and an old
 * row lacks gets the value the old writer meant; what the row holds always wins.
 */
function upcast(row: typeof schema.conversationEvents.$inferSelect): unknown {
  const payload = PayloadObjectSchema.safeParse(row.payload);
  if (!payload.success) return row.payload;
  switch (row.type) {
    // Before #54: { userId?, reason?, mode? }, no cause (alerts rank an unknown cause as `other`).
    case 'handoff_requested':
      return { conversationId: row.conversationId, cause: 'other', ...payload.data };
    // Before #60: without the conversation it belongs to.
    case 'takeover_started':
      return { conversationId: row.conversationId, ...payload.data };
    default:
      return row.payload;
  }
}

export function toStoredEvent(row: typeof schema.conversationEvents.$inferSelect): StoredEvent {
  return {
    seq: row.seq,
    body: EventBodySchema.parse({ type: row.type, payload: upcast(row) }),
    actor: ActorSchema.parse(row.actor),
    at: row.createdAt,
  };
}

/** Opaque cursors (api.md § Pagination): base64url of the sort key of the last item returned. */
const KeyCursorSchema = z.tuple([z.iso.datetime(), z.uuid()]);

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify([at.toISOString(), id])).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (cursor === undefined) return null;
  const parsed = KeyCursorSchema.safeParse(safeJson(Buffer.from(cursor, 'base64url').toString()));
  if (!parsed.success) throw new CursorInvalid();
  return { at: new Date(parsed.data[0]), id: parsed.data[1] };
}

export function decodeSeqCursor(cursor: string | undefined): number | null {
  if (cursor === undefined) return null;
  const parsed = z.coerce.number().int().min(1).safeParse(cursor);
  if (!parsed.success) throw new CursorInvalid();
  return parsed.data;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

class CursorInvalid extends DomainError {
  constructor() {
    super('cursor_invalid', 'Curseur de pagination invalide');
  }
}
