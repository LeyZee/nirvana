import { PlatformSchema, SessionStateSchema } from '@nirvana/contracts';
import { customType, index, integer, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { createdAt, enumCheck, enumText, id, tenantPolicy, timestampTz } from './columns';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

/** The tenant. Out of RLS: it has no `creator_id`, the server reads it through `withAdmin`. */
export const creators = pgTable('creators', {
  id: id(),
  displayName: text('display_name').notNull(),
  timezone: text('timezone').notNull(),
  /** `CreatorSettings` (packages/contracts), camelCase keys. */
  settings: jsonb('settings').notNull().default({}),
  createdAt: createdAt(),
});

export const platformAccounts = pgTable(
  'platform_accounts',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    platform: enumText('platform').notNull(),
    handle: text('handle').notNull(),
    sessionState: enumText('session_state').notNull().default('none'),
    /** Captured platform session, AES-256-GCM (crypto.ts); never logged, never sent back to a client. */
    sessionCiphertext: bytea('session_ciphertext'),
    sessionUpdatedAt: timestampTz('session_updated_at'),
    lastPollAt: timestampTz('last_poll_at'),
    /** Circuit breaker (connectors.md): failed polls in a row, and until when the account stays quiet. */
    consecutiveErrors: integer('consecutive_errors').notNull().default(0),
    pausedUntil: timestampTz('paused_until'),
    connectorConfig: jsonb('connector_config').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck('platform_accounts', t.platform, PlatformSchema.options),
    enumCheck('platform_accounts', t.sessionState, SessionStateSchema.options),
    unique('platform_accounts_platform_handle_unique').on(t.platform, t.handle),
    index('platform_accounts_creator_idx').on(t.creatorId),
    tenantPolicy(t.creatorId),
  ],
);

/** Who did what in the dashboard (append-only, out of RLS: read by the owner through `withAdmin`). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    userId: text('user_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    details: jsonb('details').notNull().default({}),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_created_at_idx').on(t.createdAt)],
);
