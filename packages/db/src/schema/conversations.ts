import {
  ConversationModeSchema,
  ConversationStateSchema,
  CurrencySchema,
  DraftStatusSchema,
  EVENT_TYPES,
  MessageAuthorSchema,
  MessageDirectionSchema,
} from '@nirvana/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { createdAt, enumCheck, enumText, id, tenantPolicy, timestampTz, updatedAt } from './columns';
import { fans } from './fans';
import { personaVersions } from './persona';
import { creators, platformAccounts } from './tenancy';

/**
 * Module `conversations`. Every change to `conversations`, `drafts` and `messages` goes through a function that
 * writes the matching `conversation_events` row in the same transaction (ADR 0007).
 */

export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    platformAccountId: uuid('platform_account_id')
      .notNull()
      .references(() => platformAccounts.id),
    fanId: uuid('fan_id')
      .notNull()
      .references(() => fans.id),
    platformConversationId: text('platform_conversation_id').notNull(),
    state: enumText('state').notNull().default('idle'),
    mode: enumText('mode').notNull().default('copilot'),
    lastInboundAt: timestampTz('last_inbound_at'),
    lastOutboundAt: timestampTz('last_outbound_at'),
    unreadCount: integer('unread_count').notNull().default(0),
    cooldowns: jsonb('cooldowns').notNull().default({}),
    activeScriptRunId: uuid('active_script_run_id'),
    updatedAt: updatedAt(),
  },
  (t) => [
    enumCheck('conversations', t.state, ConversationStateSchema.options),
    enumCheck('conversations', t.mode, ConversationModeSchema.options),
    unique('conversations_platform_conversation_unique').on(t.platformAccountId, t.platformConversationId),
    index('conversations_account_state_idx').on(t.platformAccountId, t.state),
    index('conversations_creator_last_inbound_idx').on(t.creatorId, t.lastInboundAt.desc()),
    tenantPolicy(t.creatorId),
  ],
);

export const drafts = pgTable(
  'drafts',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    status: enumText('status').notNull().default('pending'),
    /** The brain's output. */
    brief: jsonb('brief'),
    bubbles: text('bubbles')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** After a human edit. */
    finalBubbles: text('final_bubbles').array(),
    personaVersionId: uuid('persona_version_id').references(() => personaVersions.id),
    promptHashes: jsonb('prompt_hashes').notNull().default({}),
    policyTrace: jsonb('policy_trace').notNull().default({}),
    guardTrace: jsonb('guard_trace').notNull().default({}),
    decidedBy: text('decided_by'),
    decidedAt: timestampTz('decided_at'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck('drafts', t.status, DraftStatusSchema.options),
    unique('drafts_idempotency_key_unique').on(t.idempotencyKey),
    index('drafts_conversation_idx').on(t.conversationId, t.createdAt.desc()),
    tenantPolicy(t.creatorId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    /** Denormalised so the platform message id is unique per account (idempotent ingestion). */
    platformAccountId: uuid('platform_account_id')
      .notNull()
      .references(() => platformAccounts.id),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    platformMessageId: text('platform_message_id').notNull(),
    direction: enumText('direction').notNull(),
    author: enumText('author').notNull(),
    text: text('text').notNull().default(''),
    mediaIds: uuid('media_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    priceMinor: integer('price_minor'),
    currency: char('currency', { length: 3 }),
    isPaid: boolean('is_paid').notNull().default(false),
    platformCreatedAt: timestampTz('platform_created_at').notNull(),
    createdAt: createdAt(),
    draftId: uuid('draft_id').references((): AnyPgColumn => drafts.id),
  },
  (t) => [
    enumCheck('messages', t.direction, MessageDirectionSchema.options),
    enumCheck('messages', t.author, MessageAuthorSchema.options),
    enumCheck('messages', t.currency, CurrencySchema.options),
    unique('messages_platform_message_unique').on(t.platformAccountId, t.platformMessageId),
    index('messages_conversation_created_idx').on(t.conversationId, t.platformCreatedAt.desc()),
    tenantPolicy(t.creatorId),
  ],
);

/** The conversation's journal (ADR 0007): append-only, ordered by `seq`, enforced by a trigger. */
export const conversationEvents = pgTable(
  'conversation_events',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    type: enumText('type').notNull(),
    payload: jsonb('payload').notNull(),
    /** `system | ai | fan | human:<userId>` */
    actor: text('actor').notNull(),
    correlationId: text('correlation_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck('conversation_events', t.type, EVENT_TYPES),
    unique('conversation_events_seq_unique').on(t.conversationId, t.seq),
    index('conversation_events_type_created_idx').on(t.type, t.createdAt),
    tenantPolicy(t.creatorId),
  ],
);
