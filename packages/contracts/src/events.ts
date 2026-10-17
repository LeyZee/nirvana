import { z } from 'zod';

import {
  ActorSchema,
  ConversationModeSchema,
  DraftStatusSchema,
  FactCategorySchema,
  MessageAuthorSchema,
  MessageDirectionSchema,
  SessionStateSchema,
} from './enums';
import {
  ConversationIdSchema,
  CreatorIdSchema,
  DraftIdSchema,
  FanIdSchema,
  MediaAssetIdSchema,
  MessageIdSchema,
  PlatformAccountIdSchema,
  UserIdSchema,
} from './ids';
import { CurrencySchema } from './money';

/**
 * The closed list of event types (data-model.md) and their payloads (camelCase, never media content, never a
 * secret). `conversation_events` and the `domain_events` outbox share the list.
 */

const messagePayload = z.object({
  messageId: MessageIdSchema,
  platformMessageId: z.string().min(1),
  direction: MessageDirectionSchema,
  author: MessageAuthorSchema,
  mediaIds: z.array(MediaAssetIdSchema),
});

const sendPayload = z.object({
  draftId: DraftIdSchema,
  idempotencyKey: z.string().min(1),
  attempt: z.number().int().min(1),
  error: z.string().min(1).optional(),
});

const draftPayload = z.object({
  draftId: DraftIdSchema,
  status: DraftStatusSchema,
  decidedBy: UserIdSchema.optional(),
  editedBubbles: z.array(z.string()).optional(),
  /** Why a human rejected or the system expired it; kept for the evals (message-flow.md §3). */
  reason: z.string().min(1).max(500).optional(),
});

const factPayload = z.object({
  fanId: FanIdSchema,
  factId: z.uuid().optional(),
  summaryId: z.uuid().optional(),
  category: FactCategorySchema.optional(),
});

const controlPayload = z.object({
  userId: UserIdSchema.optional(),
  reason: z.string().min(1).optional(),
  mode: ConversationModeSchema.optional(),
});

const commercePayload = z.object({
  offerId: z.uuid().optional(),
  saleId: z.uuid().optional(),
  amountMinor: z.number().int(),
  currency: CurrencySchema,
});

const scriptPayload = z.object({
  scriptRunId: z.uuid(),
  stepIndex: z.number().int().min(0).optional(),
});

const followUpPayload = z.object({
  jobKey: z.string().min(1),
  runAt: z.iso.datetime().optional(),
});

export const KillSwitchScopeSchema = z.enum(['global', 'creator', 'conversation']);
export type KillSwitchScope = z.infer<typeof KillSwitchScopeSchema>;

export const EVENT_TYPES = [
  'message_received',
  'message_sent',
  'send_attempted',
  'send_failed',
  'send_verified',
  'media_described',
  'draft_created',
  'draft_approved',
  'draft_edited',
  'draft_rejected',
  'draft_expired',
  'fact_proposed',
  'fact_confirmed',
  'fact_rejected',
  'summary_refreshed',
  'handoff_requested',
  'reply_skipped',
  'takeover_started',
  'takeover_ended',
  'mode_changed',
  'kill_switch_toggled',
  'follow_up_scheduled',
  'follow_up_cancelled',
  'offer_made',
  'sale_detected',
  'script_started',
  'script_step_sent',
  'script_ended',
  'session_state_changed',
  'error',
] as const;
export const EventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventTypeSchema>;

/** Payload schema of every event type. Adding a type here is a contract change (ADR 0007). */
export const EVENT_PAYLOADS = {
  message_received: messagePayload,
  message_sent: messagePayload,
  send_attempted: sendPayload,
  send_failed: sendPayload,
  send_verified: sendPayload,
  media_described: z.object({
    mediaAssetId: MediaAssetIdSchema,
    mediaDescriptionId: z.uuid(),
    model: z.string().min(1),
  }),
  draft_created: draftPayload,
  draft_approved: draftPayload,
  draft_edited: draftPayload,
  draft_rejected: draftPayload,
  draft_expired: draftPayload,
  fact_proposed: factPayload,
  fact_confirmed: factPayload,
  fact_rejected: factPayload,
  summary_refreshed: factPayload,
  handoff_requested: controlPayload,
  /** The engine answered nothing (no reply needed, or no model reachable): the conversation goes back to `idle`. */
  reply_skipped: z.object({
    reason: z.enum(['no_reply', 'llm_unavailable']),
    detail: z.array(z.string().max(500)).max(20),
  }),
  takeover_started: controlPayload,
  takeover_ended: controlPayload,
  mode_changed: controlPayload,
  kill_switch_toggled: z.object({
    scope: KillSwitchScopeSchema,
    scopeId: z.uuid().nullable(),
    active: z.boolean(),
    reason: z.string().min(1),
  }),
  follow_up_scheduled: followUpPayload,
  follow_up_cancelled: followUpPayload,
  offer_made: commercePayload,
  sale_detected: commercePayload,
  script_started: scriptPayload,
  script_step_sent: scriptPayload,
  script_ended: scriptPayload,
  session_state_changed: z.object({
    platformAccountId: PlatformAccountIdSchema,
    from: SessionStateSchema,
    to: SessionStateSchema,
  }),
  error: z.object({
    code: z.string().min(1),
    jobName: z.string().min(1).optional(),
    retryable: z.boolean(),
  }),
} as const satisfies Record<EventType, z.ZodType>;

export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_PAYLOADS)[T]>;

/** One `{ type, payload }` member per event type, so a parsed event narrows on `type`. */
const typedEvent = <T extends EventType>(type: T) =>
  z.object({ type: z.literal(type), payload: EVENT_PAYLOADS[type] });

export const EventBodySchema = z.discriminatedUnion('type', [
  typedEvent('message_received'),
  typedEvent('message_sent'),
  typedEvent('send_attempted'),
  typedEvent('send_failed'),
  typedEvent('send_verified'),
  typedEvent('media_described'),
  typedEvent('draft_created'),
  typedEvent('draft_approved'),
  typedEvent('draft_edited'),
  typedEvent('draft_rejected'),
  typedEvent('draft_expired'),
  typedEvent('fact_proposed'),
  typedEvent('fact_confirmed'),
  typedEvent('fact_rejected'),
  typedEvent('summary_refreshed'),
  typedEvent('handoff_requested'),
  typedEvent('reply_skipped'),
  typedEvent('takeover_started'),
  typedEvent('takeover_ended'),
  typedEvent('mode_changed'),
  typedEvent('kill_switch_toggled'),
  typedEvent('follow_up_scheduled'),
  typedEvent('follow_up_cancelled'),
  typedEvent('offer_made'),
  typedEvent('sale_detected'),
  typedEvent('script_started'),
  typedEvent('script_step_sent'),
  typedEvent('script_ended'),
  typedEvent('session_state_changed'),
  typedEvent('error'),
]);
export type EventBody = z.infer<typeof EventBodySchema>;

const eventEnvelope = z.object({
  id: z.uuid(),
  actor: ActorSchema,
  correlationId: z.string().min(1),
  createdAt: z.iso.datetime(),
});

/** A row of `conversation_events`: ordered per conversation by `seq` (ADR 0007). */
export const ConversationEventSchema = z.intersection(
  eventEnvelope.extend({
    creatorId: CreatorIdSchema,
    conversationId: ConversationIdSchema,
    seq: z.number().int().min(1),
  }),
  EventBodySchema,
);
export type ConversationEvent = z.infer<typeof ConversationEventSchema>;

/** A row of the `domain_events` outbox: what does not belong to one conversation (persona, session, kill switch). */
export const DomainEventSchema = z.intersection(
  eventEnvelope.extend({ creatorId: CreatorIdSchema.nullable() }),
  EventBodySchema,
);
export type DomainEvent = z.infer<typeof DomainEventSchema>;
