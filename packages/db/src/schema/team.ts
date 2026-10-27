import { TEAM_MEMBER_STATUSES, TEAM_ROLES } from '@nirvana/contracts';
import { sql, type SQL } from 'drizzle-orm';
import { check, date, index, integer, pgPolicy, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { createdAt, enumCheck, enumText, id, updatedAt } from './columns';

/**
 * The agency's team (ADR 0023, EQ-01): out of the creators' RLS (no `creator_id`), under a policy per account.
 * `withMember` sets `app.user_id` and `app.team_scope` (`owner` | `agency` | `self`), both derived by the server in
 * the same transaction. Outside it neither is set and every policy matches nothing.
 */

const currentUser: SQL = sql`nullif(current_setting('app.user_id', true), '')`;
const currentScope: SQL = sql`nullif(current_setting('app.team_scope', true), '')`;
const readsTeam: SQL = sql`${currentScope} in ('owner', 'agency')`;
const isOwner: SQL = sql`${currentScope} = 'owner'`;

/** A chatter or a manager, linked to one dashboard account; the e-mail and the photo stay on `user`. */
export const teamMembers = pgTable(
  'team_members',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id),
    teamRole: enumText('team_role').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    displayName: text('display_name').notNull(),
    /** ISO 3166-1 alpha-2: decides the time zone offered and, with EQ-06, the invoicing rules. */
    country: text('country').notNull(),
    timeZone: text('time_zone').notNull(),
    status: enumText('status').notNull().default('active'),
    /** The member's colour on the planning, `#rrggbb`. */
    color: text('color'),
    joinedOn: date('joined_on').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    enumCheck('team_members', t.teamRole, TEAM_ROLES),
    enumCheck('team_members', t.status, TEAM_MEMBER_STATUSES),
    check('team_members_country_check', sql`${t.country} ~ '^[A-Z]{2}$'`),
    check('team_members_color_check', sql`${t.color} is null or ${t.color} ~ '^#[0-9a-f]{6}$'`),
    pgPolicy('member_read', { for: 'select', using: sql`${t.userId} = ${currentUser} or ${readsTeam}` }),
    pgPolicy('owner_insert', { for: 'insert', withCheck: isOwner }),
    pgPolicy('owner_update', { for: 'update', using: isOwner, withCheck: isOwner }),
  ],
);

/** Internal notes about a member, read by the owner and the managers only: never on his own row (RLS is per row). */
export const teamMemberNotes = pgTable(
  'team_member_notes',
  {
    id: id(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => teamMembers.id),
    body: text('body').notNull(),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('team_member_notes_body_check', sql`char_length(${t.body}) between 1 and 2000`),
    index('team_member_notes_member_idx').on(t.memberId, t.createdAt),
    pgPolicy('team_read', { for: 'select', using: readsTeam }),
    pgPolicy('team_insert', {
      for: 'insert',
      withCheck: sql`${readsTeam} and ${t.authorUserId} = ${currentUser}`,
    }),
  ],
);

/** Named commission rates the owner offers when adding a member; a change is a new row from a date. */
export const commissionPresets = pgTable(
  'commission_presets',
  {
    id: id(),
    name: text('name').notNull(),
    rateBps: integer('rate_bps').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('commission_presets_name_check', sql`char_length(${t.name}) between 1 and 60`),
    check('commission_presets_rate_check', sql`${t.rateBps} between 0 and 10000`),
    unique('commission_presets_name_from_unique').on(t.name, t.effectiveFrom),
    pgPolicy('team_read', { for: 'select', using: readsTeam }),
    pgPolicy('owner_insert', { for: 'insert', withCheck: isOwner }),
  ],
);

/**
 * A member's commission, and a manager's share of the team's net, from a date: the rate of a day is the latest row
 * effective on that day. Never changed: a new rate is a new row, written by the owner only.
 */
export const memberCommissionRates = pgTable(
  'member_commission_rates',
  {
    id: id(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => teamMembers.id),
    rateBps: integer('rate_bps').notNull(),
    teamShareBps: integer('team_share_bps'),
    presetId: uuid('preset_id').references(() => commissionPresets.id),
    effectiveFrom: date('effective_from').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('member_commission_rates_rate_check', sql`${t.rateBps} between 0 and 10000`),
    check(
      'member_commission_rates_team_share_check',
      sql`${t.teamShareBps} is null or ${t.teamShareBps} between 0 and 10000`,
    ),
    unique('member_commission_rates_member_from_unique').on(t.memberId, t.effectiveFrom),
    pgPolicy('member_read', {
      for: 'select',
      using: sql`${readsTeam} or exists (select 1 from team_members m where m.id = ${t.memberId} and m.user_id = ${currentUser})`,
    }),
    pgPolicy('owner_insert', { for: 'insert', withCheck: isOwner }),
  ],
);
