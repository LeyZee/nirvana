import { z } from 'zod';

import {
  ConversationModeSchema,
  ConversationStateSchema,
  DraftStatusSchema,
  MessageAuthorSchema,
  MessageDirectionSchema,
} from './enums';
import { EventBodySchema } from './events';
import { ConversationIdSchema, DraftIdSchema, FanIdSchema, MessageIdSchema } from './ids';
import { CurrencySchema } from './money';

/** DTOs of `/v1/conversations` (api.md): what the dashboard's inbox reads. Dates are ISO strings. */

/** Cursor pages (api.md § Pagination): `limit` 1 to 200, 50 by default; the cursor is opaque. */
export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
});
export type PageQuery = z.infer<typeof PageQuerySchema>;

export function pageOf<T extends z.ZodType>(
  item: T,
): z.ZodObject<{ items: z.ZodArray<T>; nextCursor: z.ZodNullable<z.ZodString> }> {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const ConversationSummarySchema = z.object({
  id: ConversationIdSchema,
  fanId: FanIdSchema,
  fanDisplayName: z.string(),
  state: ConversationStateSchema,
  mode: ConversationModeSchema,
  lastInboundAt: z.iso.datetime().nullable(),
  lastOutboundAt: z.iso.datetime().nullable(),
  unreadCount: z.number().int().min(0),
  updatedAt: z.iso.datetime(),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const DraftViewSchema = z.object({
  id: DraftIdSchema,
  status: DraftStatusSchema,
  bubbles: z.array(z.string()),
  finalBubbles: z.array(z.string()).nullable(),
  createdAt: z.iso.datetime(),
});
export type DraftView = z.infer<typeof DraftViewSchema>;

export const ConversationDetailSchema = ConversationSummarySchema.extend({
  /** Drafts still waiting for a decision or being sent, oldest first. */
  openDrafts: z.array(DraftViewSchema),
});
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;

export const MessageViewSchema = z.object({
  id: MessageIdSchema,
  direction: MessageDirectionSchema,
  author: MessageAuthorSchema,
  text: z.string(),
  priceMinor: z.number().int().nullable(),
  currency: CurrencySchema.nullable(),
  isPaid: z.boolean(),
  draftId: DraftIdSchema.nullable(),
  platformCreatedAt: z.iso.datetime(),
});
export type MessageView = z.infer<typeof MessageViewSchema>;

export const ConversationEventViewSchema = z.intersection(
  z.object({ seq: z.number().int().min(1), actor: z.string(), createdAt: z.iso.datetime() }),
  EventBodySchema,
);
export type ConversationEventView = z.infer<typeof ConversationEventViewSchema>;

/** Bodies of the dashboard's commands. */
export const ApproveDraftBodySchema = z.object({
  /** Present when the operator edited the bubbles before approving. */
  bubbles: z.array(z.string().trim().min(1).max(2_000)).min(1).max(10).optional(),
});
export const RejectDraftBodySchema = z.object({ reason: z.string().trim().min(1).max(500).optional() });
export const TakeoverBodySchema = z.object({ reason: z.string().trim().min(1).max(500).optional() });
export const SetModeBodySchema = z.object({ mode: ConversationModeSchema });
