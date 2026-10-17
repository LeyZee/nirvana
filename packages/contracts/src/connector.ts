import { z } from 'zod';

import { MessageDirectionSchema, PlatformSchema, SessionStateSchema } from './enums';
import { CurrencySchema } from './money';

/**
 * Data crossing the `PlatformConnector` port (docs/architecture/connectors.md). Platform identifiers are opaque
 * strings; the core never interprets them.
 */

/** A platform object as the platform names it. */
export const ExternalRefSchema = z.object({
  platform: PlatformSchema,
  id: z.string().min(1),
});
export type ExternalRef = z.infer<typeof ExternalRefSchema>;

export const ConversationSnapshotSchema = z.object({
  ref: ExternalRefSchema,
  fanRef: ExternalRefSchema,
  fanDisplayName: z.string(),
  /** `null` when the platform cannot tell without opening the conversation (`capabilities.unreadWithoutOpen`). */
  unreadCount: z.number().int().min(0).nullable(),
  lastMessageAt: z.iso.datetime().nullable(),
  lastMessagePreview: z.string().optional(),
});
export type ConversationSnapshot = z.infer<typeof ConversationSnapshotSchema>;

export const ExternalMediaSchema = z.object({
  ref: ExternalRefSchema,
  kind: z.enum(['image', 'video', 'audio']),
  /** Locked behind a price (PPV bundle) until bought. */
  isLocked: z.boolean(),
});
export type ExternalMedia = z.infer<typeof ExternalMediaSchema>;

export const ExternalMessageSchema = z.object({
  ref: ExternalRefSchema,
  conversationRef: ExternalRefSchema,
  direction: MessageDirectionSchema,
  text: z.string(),
  media: z.array(ExternalMediaSchema),
  priceMinor: z.number().int().min(0).nullable(),
  currency: CurrencySchema.nullable(),
  isPaid: z.boolean(),
  /** Name of the team member who sent an outbound message, when the platform shows it. */
  senderLabel: z.string().optional(),
  createdAt: z.iso.datetime(),
});
export type ExternalMessage = z.infer<typeof ExternalMessageSchema>;

export const ExternalTransactionSchema = z.object({
  ref: ExternalRefSchema,
  fanRef: ExternalRefSchema,
  conversationRef: ExternalRefSchema.optional(),
  messageRef: ExternalRefSchema.optional(),
  kind: z.enum(['ppv', 'tip', 'subscription', 'other']),
  amountMinor: z.number().int(),
  currency: CurrencySchema,
  createdAt: z.iso.datetime(),
});
export type ExternalTransaction = z.infer<typeof ExternalTransactionSchema>;

/** A media the core asks the platform to send: one of the creator's already-uploaded items, maybe priced. */
export const OutboundMediaSchema = z.object({
  mediaRefs: z.array(ExternalRefSchema).min(1),
  text: z.string(),
  priceMinor: z.number().int().min(0).nullable(),
  currency: CurrencySchema.nullable(),
});
export type OutboundMedia = z.infer<typeof OutboundMediaSchema>;

export const SendResultSchema = z.object({
  messageRef: ExternalRefSchema,
  sentAt: z.iso.datetime(),
});
export type SendResult = z.infer<typeof SendResultSchema>;

/** After a send whose outcome is unknown (timeout), whether the message really reached the platform. */
export const VerifyResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('sent'), messageRef: ExternalRefSchema }),
  z.object({ status: z.literal('not_found') }),
]);
export type VerifyResult = z.infer<typeof VerifyResultSchema>;

/** What a connector can do; the core adapts to it, never the other way round. */
export const ConnectorCapabilitiesSchema = z.object({
  unreadWithoutOpen: z.boolean(),
  sendMedia: z.boolean(),
  transactions: z.boolean(),
  markRead: z.boolean(),
  typing: z.boolean(),
  realtime: z.boolean(),
});
export type ConnectorCapabilities = z.infer<typeof ConnectorCapabilitiesSchema>;

export const ConnectorErrorCodeSchema = z.enum([
  'session_expired',
  'rate_limited',
  'not_found',
  'transient',
  'fatal',
]);
export type ConnectorErrorCode = z.infer<typeof ConnectorErrorCodeSchema>;

/** Pushed by a connector that subscribes to a realtime channel. */
export const ConnectorEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), message: ExternalMessageSchema }),
  z.object({ type: z.literal('transaction'), transaction: ExternalTransactionSchema }),
  z.object({ type: z.literal('session'), state: SessionStateSchema }),
]);
export type ConnectorEvent = z.infer<typeof ConnectorEventSchema>;

export type Unsubscribe = () => Promise<void>;
