import { CurrencySchema, EARNINGS_SOURCES } from '@nirvana/contracts';
import { sql, type SQL } from 'drizzle-orm';
import { check, date, foreignKey, integer, pgPolicy, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { createdAt, enumCheck, id } from './columns';
import { creators, platformAccounts } from './tenancy';

/**
 * Pay (ADR 0023 § Paie). The rules of an account carry `creator_id`: read inside `withTenantMember` of that creator,
 * by the owner and an active manager, and by a member who has a shift on the account (the currency of their reports).
 * Added only, by the owner alone: neither the policies nor the grants of the migration let a row change.
 */

const currentCreator: SQL = sql`nullif(current_setting('app.creator_id', true), '')::uuid`;
const currentUser: SQL = sql`nullif(current_setting('app.user_id', true), '')`;
const currentScope: SQL = sql`nullif(current_setting('app.team_scope', true), '')`;

/**
 * An account's pay rules from `from_period` on (contracts `pay-rules.ts`, EQ-03): one per account and period at most,
 * whole basis points, a period's first day.
 */
export const accountPayRules = pgTable(
  'account_pay_rules',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    platformAccountId: uuid('platform_account_id').notNull(),
    fromPeriod: date('from_period').notNull(),
    currency: text('currency').notNull(),
    vatBps: integer('vat_bps').notNull(),
    platformFeeBps: integer('platform_fee_bps').notNull(),
    earningsSource: text('earnings_source').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'account_pay_rules_account_creator_fk',
      columns: [t.platformAccountId, t.creatorId],
      foreignColumns: [platformAccounts.id, platformAccounts.creatorId],
    }),
    unique('account_pay_rules_account_period_unique').on(t.platformAccountId, t.fromPeriod),
    check('account_pay_rules_period_check', sql`extract(day from ${t.fromPeriod}) in (1, 16)`),
    check(
      'account_pay_rules_bps_check',
      sql`${t.vatBps} between 0 and 10000 and ${t.platformFeeBps} between 0 and 10000`,
    ),
    enumCheck('account_pay_rules', t.currency, CurrencySchema.options),
    enumCheck('account_pay_rules', t.earningsSource, EARNINGS_SOURCES),
    pgPolicy('team_read', {
      for: 'select',
      using: sql`${t.creatorId} = ${currentCreator} and (${currentScope} in ('owner', 'agency') or exists (select 1 from shifts s join team_members m on m.id = s.member_id where s.platform_account_id = ${t.platformAccountId} and m.user_id = ${currentUser}))`,
    }),
    pgPolicy('owner_insert', {
      for: 'insert',
      withCheck: sql`${t.creatorId} = ${currentCreator} and ${currentScope} = 'owner' and ${t.createdBy} = ${currentUser}`,
    }),
  ],
);
