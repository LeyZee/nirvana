import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Dashboard users (Better Auth core schema, Drizzle adapter), plus `role` and `creator_ids` on `user`. Out of RLS:
 * the server reads them through `withAdmin`. P0-07 wires Better Auth; if its CLI output (`@better-auth/cli generate`)
 * differs from these tables, the CLI wins and a new migration follows.
 */

const tz = (name: string) => timestamp(name, { withTimezone: true });

export const USER_ROLES = ['owner', 'operator', 'creator'] as const;

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    role: text('role').notNull().default('operator'),
    creatorIds: uuid('creator_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: tz('created_at').notNull().defaultNow(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
  },
  (t) => [check('user_role_check', sql`${t.role} in ('owner', 'operator', 'creator')`)],
);

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: tz('expires_at').notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: tz('created_at').notNull().defaultNow(),
  updatedAt: tz('updated_at').notNull().defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: tz('access_token_expires_at'),
  refreshTokenExpiresAt: tz('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: tz('created_at').notNull().defaultNow(),
  updatedAt: tz('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: tz('expires_at').notNull(),
  createdAt: tz('created_at').notNull().defaultNow(),
  updatedAt: tz('updated_at').notNull().defaultNow(),
});
