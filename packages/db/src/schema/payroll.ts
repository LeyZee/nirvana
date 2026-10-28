import {
  COMMISSION_STATEMENT_STATUSES,
  CurrencySchema,
  EARNINGS_SOURCES,
  ForeignCurrencySchema,
  PAY_AMOUNT_MAX_MINOR,
  PAY_TARGET_MAX_MINOR,
  PENALTY_KINDS,
} from '@nirvana/contracts';
import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  type PgColumn,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { createdAt, enumCheck, id, timestampTz, updatedAt } from './columns';
import { teamMembers } from './team';
import { creators, platformAccounts } from './tenancy';

/**
 * Pay (ADR 0023 § Paie). The rules of an account carry `creator_id`: read inside `withTenantMember` of that creator,
 * by the owner and an active manager, and by a member who has a shift on the account (the currency of their reports).
 * Added only, by the owner alone: neither the policies nor the grants of the migration let a row change.
 */

const currentCreator: SQL = sql`nullif(current_setting('app.creator_id', true), '')::uuid`;
const currentUser: SQL = sql`nullif(current_setting('app.user_id', true), '')`;
const currentScope: SQL = sql`nullif(current_setting('app.team_scope', true), '')`;
const readsTeam: SQL = sql`${currentScope} in ('owner', 'agency')`;
const isOwner: SQL = sql`${currentScope} = 'owner'`;
const anyMember: SQL = sql`${currentScope} is not null`;

/** The member of the row is the signed-in account. */
const isMine = (memberId: PgColumn | SQL): SQL =>
  sql`exists (select 1 from team_members m where m.id = ${memberId} and m.user_id = ${currentUser})`;

/** A period: the first or the sixteenth of a month. */
const periodCheck = (name: string, period: PgColumn): ReturnType<typeof check> =>
  check(name, sql`extract(day from ${period}) in (1, 16)`);

const amountMax = sql.raw(String(PAY_AMOUNT_MAX_MINOR));
const targetMax = sql.raw(String(PAY_TARGET_MAX_MINOR));

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

/*
 * Commission statements (EQ-04, contracts `payroll.ts`). Out of the creators' RLS (no `creator_id`): a member reads
 * their own rows, the scope `owner` | `agency` of `withMember` reads every row. Statements and their lines are written
 * by the recalculation job (`withAdmin`); the application validates a draft (owner, active manager, never their own)
 * and marks a validated one paid (owner only). Triggers of the migration keep the past for every role: a validated
 * statement never changes but to `paid`, lines, adjustments, carry-overs, tiers, goals and rates are added only, and
 * nothing is written for a period a validated statement has closed.
 */

/** A period as pay first wrote it: its instants in the agency's zone of that day. Written by the job. */
export const payPeriods = pgTable(
  'pay_periods',
  {
    period: date('period').primaryKey(),
    startsAt: timestampTz('starts_at').notNull(),
    endsAt: timestampTz('ends_at').notNull(),
    timeZone: text('time_zone').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    periodCheck('pay_periods_period_check', t.period),
    check('pay_periods_window_check', sql`${t.endsAt} > ${t.startsAt}`),
    pgPolicy('team_read', { for: 'select', using: anyMember }),
  ],
);

/** Euros for one unit of a currency, in millionths, read by the rate job (`withAdmin`) once a day. */
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    currency: text('currency').notNull(),
    day: date('day').notNull(),
    rateMicros: bigint('rate_micros', { mode: 'number' }).notNull(),
    source: text('source').notNull(),
    fetchedAt: timestampTz('fetched_at').notNull(),
  },
  (t) => [
    primaryKey({ name: 'exchange_rates_pkey', columns: [t.currency, t.day] }),
    enumCheck('exchange_rates', t.currency, ForeignCurrencySchema.options),
    check('exchange_rates_rate_check', sql`${t.rateMicros} > 0`),
    check('exchange_rates_source_check', sql`char_length(${t.source}) between 1 and 100`),
    pgPolicy('team_read', { for: 'select', using: anyMember }),
  ],
);

/** One row at most (`id = 1`): no row means the contracts' defaults (`DEFAULT_MINIMUM_PAYOUT_MINOR`). */
export const payrollSettings = pgTable(
  'payroll_settings',
  {
    id: smallint('id').primaryKey(),
    minimumPayoutMinor: integer('minimum_payout_minor').notNull(),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => user.id),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('payroll_settings_single_check', sql`${t.id} = 1`),
    check('payroll_settings_minimum_check', sql`${t.minimumPayoutMinor} between 0 and ${amountMax}`),
    pgPolicy('team_read', { for: 'select', using: anyMember }),
    pgPolicy('owner_insert', {
      for: 'insert',
      withCheck: sql`${isOwner} and ${t.updatedBy} = ${currentUser}`,
    }),
    pgPolicy('owner_update', {
      for: 'update',
      using: isOwner,
      withCheck: sql`${isOwner} and ${t.updatedBy} = ${currentUser}`,
    }),
  ],
);

/** The individual tiers from a period on; the newest of the latest period at or before a period is in force. */
export const bonusTierSets = pgTable(
  'bonus_tier_sets',
  {
    id: id(),
    fromPeriod: date('from_period').notNull(),
    tiers: jsonb('tiers').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    periodCheck('bonus_tier_sets_period_check', t.fromPeriod),
    check('bonus_tier_sets_tiers_check', sql`jsonb_typeof(${t.tiers}) = 'array'`),
    index('bonus_tier_sets_period_idx').on(t.fromPeriod),
    pgPolicy('team_read', { for: 'select', using: anyMember }),
    pgPolicy('owner_insert', {
      for: 'insert',
      withCheck: sql`${isOwner} and ${t.createdBy} = ${currentUser}`,
    }),
  ],
);

/** The team's goal for a period; its newest row is in force, none when it has no tier. */
export const collectiveGoals = pgTable(
  'collective_goals',
  {
    id: id(),
    period: date('period').notNull(),
    targetMinor: bigint('target_minor', { mode: 'number' }).notNull(),
    tiers: jsonb('tiers').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    periodCheck('collective_goals_period_check', t.period),
    check('collective_goals_target_check', sql`${t.targetMinor} between 1 and ${targetMax}`),
    check('collective_goals_tiers_check', sql`jsonb_typeof(${t.tiers}) = 'array'`),
    index('collective_goals_period_idx').on(t.period),
    pgPolicy('team_read', { for: 'select', using: anyMember }),
    pgPolicy('owner_insert', {
      for: 'insert',
      withCheck: sql`${isOwner} and ${t.createdBy} = ${currentUser}`,
    }),
  ],
);

/** Who reads a member's pay row: the member, and the scope `owner` | `agency`. */
const memberRead = (memberId: PgColumn): ReturnType<typeof pgPolicy> =>
  pgPolicy('member_read', { for: 'select', using: sql`${readsTeam} or ${isMine(memberId)}` });

/** Written by the owner or an active manager, never for themselves. */
const agencyWrites = (memberId: PgColumn, by: PgColumn): SQL =>
  sql`${readsTeam} and ${by} = ${currentUser} and not ${isMine(memberId)}`;

/** A manual bonus for a member and a period, cancelled (never deleted) while the period is open for the member. */
export const bonuses = pgTable(
  'bonuses',
  {
    id: id(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => teamMembers.id),
    period: date('period').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    reason: text('reason').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    cancelledAt: timestampTz('cancelled_at'),
    cancelledBy: text('cancelled_by').references(() => user.id),
  },
  (t) => [
    periodCheck('bonuses_period_check', t.period),
    check('bonuses_amount_check', sql`${t.amountMinor} between 1 and ${amountMax}`),
    check('bonuses_reason_check', sql`char_length(${t.reason}) between 1 and 500`),
    check('bonuses_cancellation_check', sql`(${t.cancelledAt} is null) = (${t.cancelledBy} is null)`),
    index('bonuses_member_period_idx').on(t.memberId, t.period),
    memberRead(t.memberId),
    pgPolicy('agency_insert', {
      for: 'insert',
      withCheck: sql`${agencyWrites(t.memberId, t.createdBy)} and ${t.cancelledAt} is null`,
    }),
    pgPolicy('agency_cancel', {
      for: 'update',
      using: sql`${readsTeam} and not ${isMine(t.memberId)} and ${t.cancelledAt} is null`,
      withCheck: agencyWrites(t.memberId, t.cancelledBy),
    }),
  ],
);

/** A penalty over one or more periods, fixed or a percent of the member's net; cancelled from a period on. */
export const penalties = pgTable(
  'penalties',
  {
    id: id(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => teamMembers.id),
    fromPeriod: date('from_period').notNull(),
    toPeriod: date('to_period').notNull(),
    kind: text('kind').notNull(),
    amountMinor: integer('amount_minor'),
    bps: integer('bps'),
    reason: text('reason').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    cancelledAt: timestampTz('cancelled_at'),
    cancelledBy: text('cancelled_by').references(() => user.id),
    cancelledFrom: date('cancelled_from'),
  },
  (t) => [
    periodCheck('penalties_from_period_check', t.fromPeriod),
    periodCheck('penalties_to_period_check', t.toPeriod),
    check('penalties_periods_check', sql`${t.toPeriod} >= ${t.fromPeriod}`),
    enumCheck('penalties', t.kind, PENALTY_KINDS),
    check(
      'penalties_amount_check',
      sql`case when ${t.kind} = 'fixed' then ${t.amountMinor} between 1 and ${amountMax} and ${t.bps} is null else ${t.bps} between 1 and 10000 and ${t.amountMinor} is null end`,
    ),
    check('penalties_reason_check', sql`char_length(${t.reason}) between 1 and 500`),
    check(
      'penalties_cancellation_check',
      sql`(${t.cancelledAt} is null) = (${t.cancelledBy} is null) and (${t.cancelledAt} is null) = (${t.cancelledFrom} is null) and (${t.cancelledFrom} is null or (extract(day from ${t.cancelledFrom}) in (1, 16) and ${t.cancelledFrom} between ${t.fromPeriod} and ${t.toPeriod}))`,
    ),
    index('penalties_member_period_idx').on(t.memberId, t.fromPeriod),
    memberRead(t.memberId),
    pgPolicy('agency_insert', {
      for: 'insert',
      withCheck: sql`${agencyWrites(t.memberId, t.createdBy)} and ${t.cancelledAt} is null`,
    }),
    pgPolicy('agency_cancel', {
      for: 'update',
      using: sql`${readsTeam} and not ${isMine(t.memberId)} and ${t.cancelledAt} is null`,
      withCheck: agencyWrites(t.memberId, t.cancelledBy),
    }),
  ],
);

/**
 * A member's statement for a period: one per member and period, its amounts as the engine gave them, the rules and
 * rates it used (`rules`), what it counted (`counted`: bonuses, penalties, carry-overs, adjustments) and the team's
 * figures. `revision` grows at each recalculation that changes it.
 */
export const commissionStatements = pgTable(
  'commission_statements',
  {
    id: id(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => teamMembers.id),
    period: date('period')
      .notNull()
      .references(() => payPeriods.period),
    status: text('status').notNull(),
    revision: integer('revision').notNull(),
    engineVersion: text('engine_version').notNull(),
    inputsHash: text('inputs_hash').notNull(),
    netMinor: integer('net_minor').notNull(),
    commissionMinor: integer('commission_minor').notNull(),
    teamShareBaseMinor: bigint('team_share_base_minor', { mode: 'number' }),
    teamShareBps: integer('team_share_bps'),
    teamShareMinor: integer('team_share_minor'),
    tierBonus: jsonb('tier_bonus'),
    collectiveBonusMinor: integer('collective_bonus_minor').notNull(),
    bonusesMinor: integer('bonuses_minor').notNull(),
    penaltiesRequestedMinor: integer('penalties_requested_minor').notNull(),
    penaltiesMinor: integer('penalties_minor').notNull(),
    carryOversInMinor: integer('carry_overs_in_minor').notNull(),
    adjustmentsMinor: integer('adjustments_minor').notNull(),
    totalMinor: integer('total_minor').notNull(),
    carryOverOutMinor: integer('carry_over_out_minor').notNull(),
    payableMinor: integer('payable_minor').notNull(),
    teamNetMinor: bigint('team_net_minor', { mode: 'number' }).notNull(),
    collective: jsonb('collective'),
    rules: jsonb('rules').notNull(),
    counted: jsonb('counted').notNull(),
    computedAt: timestampTz('computed_at').notNull(),
    validatedAt: timestampTz('validated_at'),
    validatedBy: text('validated_by').references(() => user.id),
    paidAt: timestampTz('paid_at'),
    paidBy: text('paid_by').references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('commission_statements_member_period_unique').on(t.memberId, t.period),
    enumCheck('commission_statements', t.status, COMMISSION_STATEMENT_STATUSES),
    check('commission_statements_revision_check', sql`${t.revision} >= 1`),
    check('commission_statements_engine_check', sql`${t.engineVersion} ~ '^nirvana-[0-9]+$'`),
    check('commission_statements_hash_check', sql`${t.inputsHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'commission_statements_amounts_check',
      sql`${t.payableMinor} >= 0 and ${t.payableMinor} = ${t.totalMinor} - ${t.carryOverOutMinor} and ${t.penaltiesMinor} between 0 and greatest(${t.penaltiesRequestedMinor}, 0)`,
    ),
    check(
      'commission_statements_team_share_check',
      sql`(${t.teamShareBps} is null) = (${t.teamShareMinor} is null) and (${t.teamShareBps} is null) = (${t.teamShareBaseMinor} is null) and (${t.teamShareBps} is null or ${t.teamShareBps} between 0 and 10000)`,
    ),
    check(
      'commission_statements_state_check',
      sql`(${t.validatedAt} is null) = (${t.validatedBy} is null) and (${t.paidAt} is null) = (${t.paidBy} is null) and (${t.status} = 'draft') = (${t.validatedAt} is null) and (${t.status} = 'paid') = (${t.paidAt} is not null)`,
    ),
    index('commission_statements_period_idx').on(t.period),
    memberRead(t.memberId),
    pgPolicy('agency_validate', {
      for: 'update',
      using: sql`${readsTeam} and ${t.status} = 'draft' and not ${isMine(t.memberId)}`,
      withCheck: sql`${readsTeam} and ${t.status} = 'validated' and ${t.validatedBy} = ${currentUser} and not ${isMine(t.memberId)}`,
    }),
    pgPolicy('owner_pay', {
      for: 'update',
      using: sql`${isOwner} and ${t.status} = 'validated'`,
      withCheck: sql`${isOwner} and ${t.status} = 'paid' and ${t.paidBy} = ${currentUser}`,
    }),
  ],
);

/** One account of a statement's revision, each step of Imperium's chain; added only, by the job. */
export const commissionStatementLines = pgTable(
  'commission_statement_lines',
  {
    id: id(),
    statementId: uuid('statement_id')
      .notNull()
      .references(() => commissionStatements.id),
    revision: integer('revision').notNull(),
    platformAccountId: uuid('platform_account_id')
      .notNull()
      .references(() => platformAccounts.id),
    currency: text('currency').notNull(),
    vatBps: integer('vat_bps').notNull(),
    platformFeeBps: integer('platform_fee_bps').notNull(),
    rateMicros: bigint('rate_micros', { mode: 'number' }).notNull(),
    grossMinor: integer('gross_minor').notNull(),
    grossEurMinor: integer('gross_eur_minor').notNull(),
    exclVatMinor: integer('excl_vat_minor').notNull(),
    netMinor: integer('net_minor').notNull(),
    commissionMinor: integer('commission_minor').notNull(),
    shiftReportIds: uuid('shift_report_ids').array().notNull(),
    lateReports: jsonb('late_reports').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('commission_statement_lines_rules_unique').on(
      t.statementId,
      t.revision,
      t.platformAccountId,
      t.currency,
      t.vatBps,
      t.platformFeeBps,
    ),
    enumCheck('commission_statement_lines', t.currency, CurrencySchema.options),
    check(
      'commission_statement_lines_rules_check',
      sql`${t.revision} >= 1 and ${t.rateMicros} > 0 and ${t.vatBps} between 0 and 10000 and ${t.platformFeeBps} between 0 and 10000`,
    ),
    check('commission_statement_lines_late_check', sql`jsonb_typeof(${t.lateReports}) = 'array'`),
    pgPolicy('member_read', {
      for: 'select',
      using: sql`exists (select 1 from commission_statements s where s.id = ${t.statementId} and (${readsTeam} or ${isMine(sql`s.member_id`)}))`,
    }),
  ],
);

/** A correction landed on the member's first open period; added only. */
export const payAdjustments = pgTable(
  'pay_adjustments',
  {
    id: id(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => teamMembers.id),
    period: date('period').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    reason: text('reason').notNull(),
    correctsStatementId: uuid('corrects_statement_id').references(() => commissionStatements.id),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    periodCheck('pay_adjustments_period_check', t.period),
    check(
      'pay_adjustments_amount_check',
      sql`${t.amountMinor} between -${amountMax} and ${amountMax} and ${t.amountMinor} <> 0`,
    ),
    check('pay_adjustments_reason_check', sql`char_length(${t.reason}) between 1 and 500`),
    index('pay_adjustments_member_period_idx').on(t.memberId, t.period),
    memberRead(t.memberId),
    pgPolicy('agency_insert', { for: 'insert', withCheck: agencyWrites(t.memberId, t.createdBy) }),
  ],
);

/** What a validated statement carried to the next period: one per member and period it comes from, added only. */
export const carryOvers = pgTable(
  'carry_overs',
  {
    id: id(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => teamMembers.id),
    fromPeriod: date('from_period').notNull(),
    toPeriod: date('to_period').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    statementId: uuid('statement_id')
      .notNull()
      .unique()
      .references(() => commissionStatements.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('carry_overs_member_period_unique').on(t.memberId, t.fromPeriod),
    periodCheck('carry_overs_from_period_check', t.fromPeriod),
    periodCheck('carry_overs_to_period_check', t.toPeriod),
    check('carry_overs_periods_check', sql`${t.toPeriod} > ${t.fromPeriod}`),
    check('carry_overs_amount_check', sql`${t.amountMinor} <> 0`),
    index('carry_overs_member_to_idx').on(t.memberId, t.toPeriod),
    memberRead(t.memberId),
    pgPolicy('agency_insert', { for: 'insert', withCheck: readsTeam }),
  ],
);
