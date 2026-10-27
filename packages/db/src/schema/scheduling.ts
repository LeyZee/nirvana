import { sql, type SQL } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  smallint,
  type PgColumn,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { createdAt, id, timestampTz, updatedAt } from './columns';
import { teamMembers } from './team';
import { creators, platformAccounts } from './tenancy';

/**
 * The planning (ADR 0023 § Données et RLS, EQ-02). Shifts and templates carry `creator_id` **and** `member_id`, and
 * their policies ask for both: the creator of `withTenant` (`app.creator_id`), and the member himself or the scope
 * `owner` | `agency` of `withMember` (`withTenantMember` sets the three). Only the owner and an active manager write.
 * The settings have no creator: every member reads them, the owner alone writes them.
 *
 * Two exclusion constraints, added by hand to the migration (Drizzle does not write them), keep a member off two
 * shifts at once and an account off two members at once, cancelled shifts aside. A composite key keeps each row's
 * account on its creator: no row can open the wrong creator in the access window of ADR 0025.
 */

const currentCreator: SQL = sql`nullif(current_setting('app.creator_id', true), '')::uuid`;
const currentUser: SQL = sql`nullif(current_setting('app.user_id', true), '')`;
const currentScope: SQL = sql`nullif(current_setting('app.team_scope', true), '')`;
const plans: SQL = sql`${currentScope} in ('owner', 'agency')`;
const isOwner: SQL = sql`${currentScope} = 'owner'`;

/** The member of the row is the signed-in account. */
const isMine = (memberId: PgColumn): SQL =>
  sql`exists (select 1 from team_members m where m.id = ${memberId} and m.user_id = ${currentUser})`;

/** One row at most (`id = 1`): no row means the defaults of the `scheduling` module. */
export const schedulingSettings = pgTable(
  'scheduling_settings',
  {
    id: smallint('id').primaryKey(),
    timeZone: text('time_zone').notNull(),
    slotStartMinute: integer('slot_start_minute').notNull(),
    slotLengthMinutes: integer('slot_length_minutes').notNull(),
    accessMarginMinutes: integer('access_margin_minutes').notNull(),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => user.id),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('scheduling_settings_single_check', sql`${t.id} = 1`),
    check(
      'scheduling_settings_slots_check',
      sql`${t.slotLengthMinutes} in (60, 120, 180, 240, 360, 480, 720) and ${t.slotStartMinute} >= 0 and ${t.slotStartMinute} < ${t.slotLengthMinutes}`,
    ),
    check('scheduling_settings_margin_check', sql`${t.accessMarginMinutes} between 0 and 120`),
    pgPolicy('team_read', { for: 'select', using: sql`${currentScope} is not null` }),
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

/**
 * A weekly shift, in wall-clock minutes of the grid's zone (an end at or before the start is the next day), 23 hours
 * at most. Never edited: only `valid_until` changes, when it ends (the migration grants that column alone, and a
 * trigger refuses any other change, whoever asks).
 */
export const shiftTemplates = pgTable(
  'shift_templates',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    platformAccountId: uuid('platform_account_id').notNull(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => teamMembers.id),
    /** ISO weekday: 1 Monday … 7 Sunday. */
    weekday: smallint('weekday').notNull(),
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
    validFrom: date('valid_from').notNull(),
    /** Its last day; the day before `valid_from` for a template ended before it ran. */
    validUntil: date('valid_until'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('shift_templates_weekday_check', sql`${t.weekday} between 1 and 7`),
    check(
      'shift_templates_minutes_check',
      sql`${t.startMinute} between 0 and 1439 and ${t.endMinute} between 0 and 1439 and ${t.startMinute} <> ${t.endMinute}`,
    ),
    check('shift_templates_length_check', sql`(${t.endMinute} - ${t.startMinute} + 1440) % 1440 <= 1380`),
    check(
      'shift_templates_validity_check',
      sql`${t.validUntil} is null or ${t.validUntil} >= ${t.validFrom} - 1`,
    ),
    foreignKey({
      name: 'shift_templates_account_creator_fk',
      columns: [t.platformAccountId, t.creatorId],
      foreignColumns: [platformAccounts.id, platformAccounts.creatorId],
    }),
    index('shift_templates_creator_idx').on(t.creatorId),
    pgPolicy('member_read', {
      for: 'select',
      using: sql`${t.creatorId} = ${currentCreator} and (${plans} or ${isMine(t.memberId)})`,
    }),
    pgPolicy('team_insert', {
      for: 'insert',
      withCheck: sql`${t.creatorId} = ${currentCreator} and ${plans} and ${t.createdBy} = ${currentUser}`,
    }),
    pgPolicy('team_update', {
      for: 'update',
      using: sql`${t.creatorId} = ${currentCreator} and ${plans}`,
      withCheck: sql`${t.creatorId} = ${currentCreator} and ${plans}`,
    }),
  ],
);

/**
 * A member's shift on one account, the half-open range [`starts_at`, `ends_at`) on whole minutes, a day at most. A
 * cancelled shift stays (`cancelled_at`), out of every read and of the exclusion constraints; `(template_id,
 * template_starts_at)` is unique, cancelled rows included, so a template never makes an occurrence twice, nor again
 * once it is cancelled or moved by hand.
 * A shift that has ended no longer changes, and its creator, account and template never do (triggers of the
 * migration).
 */
export const shifts = pgTable(
  'shifts',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    platformAccountId: uuid('platform_account_id').notNull(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => teamMembers.id),
    startsAt: timestampTz('starts_at').notNull(),
    endsAt: timestampTz('ends_at').notNull(),
    templateId: uuid('template_id').references(() => shiftTemplates.id),
    /**
     * The start the template gave it, kept when a person moves the shift: with `template_id`, the occurrence it was
     * made for, so the template never makes that occurrence again.
     */
    templateStartsAt: timestampTz('template_starts_at'),
    cancelledAt: timestampTz('cancelled_at'),
    /** When a person stopped it under way: it ends at that minute, and the access window closes with it. */
    stoppedAt: timestampTz('stopped_at'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'shifts_range_check',
      sql`${t.endsAt} > ${t.startsAt} and ${t.endsAt} - ${t.startsAt} <= interval '24 hours'`,
    ),
    check(
      'shifts_whole_minutes_check',
      sql`date_trunc('minute', ${t.startsAt}) = ${t.startsAt} and date_trunc('minute', ${t.endsAt}) = ${t.endsAt}`,
    ),
    check(
      'shifts_stopped_check',
      sql`${t.stoppedAt} is null or ${t.endsAt} = date_trunc('minute', ${t.stoppedAt})`,
    ),
    foreignKey({
      name: 'shifts_account_creator_fk',
      columns: [t.platformAccountId, t.creatorId],
      foreignColumns: [platformAccounts.id, platformAccounts.creatorId],
    }),
    check('shifts_template_check', sql`(${t.templateId} is null) = (${t.templateStartsAt} is null)`),
    unique('shifts_template_occurrence_unique').on(t.templateId, t.templateStartsAt),
    index('shifts_creator_start_idx').on(t.creatorId, t.startsAt),
    /** A member's shifts still to end: the access window of ADR 0025 reads them at every request. */
    index('shifts_member_end_idx')
      .on(t.memberId, t.endsAt)
      .where(sql`${t.cancelledAt} is null`),
    pgPolicy('member_read', {
      for: 'select',
      using: sql`${t.creatorId} = ${currentCreator} and (${plans} or ${isMine(t.memberId)})`,
    }),
    pgPolicy('team_insert', {
      for: 'insert',
      withCheck: sql`${t.creatorId} = ${currentCreator} and ${plans} and ${t.createdBy} = ${currentUser} and ${t.updatedBy} = ${currentUser}`,
    }),
    pgPolicy('team_update', {
      for: 'update',
      using: sql`${t.creatorId} = ${currentCreator} and ${plans}`,
      withCheck: sql`${t.creatorId} = ${currentCreator} and ${plans} and ${t.updatedBy} = ${currentUser}`,
    }),
  ],
);
