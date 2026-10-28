import {
  TeamMemberIdSchema,
  TeamMemberStatusSchema,
  TeamRoleSchema,
  type TeamMemberId,
  type TeamMemberStatus,
  type TeamRole,
} from '@nirvana/contracts';
import { sql, type Transaction } from '@nirvana/db';
import { z } from 'zod';

/**
 * What pay reads of the team (EQ-04, ADR 0023 § Paie), in pay's own transaction: the module owns the members and
 * their rates, pay gets this function through the module's `index.ts`, never the tables.
 */

/** A member as pay computes a period: role, status, arrival, and the rate in force on the period's last day. */
export interface MemberForPay {
  readonly id: TeamMemberId;
  readonly teamRole: TeamRole;
  readonly status: TeamMemberStatus;
  readonly joinedOn: string;
  /** `null` when no rate is in force on that day yet. */
  readonly rate: { readonly rateBps: number; readonly teamShareBps: number | null } | null;
}

const RowSchema = z.object({
  id: TeamMemberIdSchema,
  team_role: TeamRoleSchema,
  status: TeamMemberStatusSchema,
  joined_on: z.iso.date(),
  rate_bps: z.number().int().nullable(),
  team_share_bps: z.number().int().nullable(),
});

/**
 * Every member, those who left included (their reports are still paid), each with the latest rate effective on `day`
 * or before (`member_commission_rates`, one per member and day), in the caller's transaction: pay's job on the admin
 * connection, or a validation as its member, whose scope (`owner`, `agency`) reads every member.
 */
export async function membersForPay(tx: Transaction, day: string): Promise<MemberForPay[]> {
  const result = await tx.execute(sql`
    select m.id, m.team_role, m.status, m.joined_on::text as joined_on, rate.rate_bps, rate.team_share_bps
    from team_members m
    left join lateral (
      select c.rate_bps, c.team_share_bps from member_commission_rates c
      where c.member_id = m.id and c.effective_from <= ${day}::date
      order by c.effective_from desc limit 1
    ) rate on true
    order by m.id`);
  return result.rows.map((raw) => {
    const row = RowSchema.parse(raw);
    return {
      id: row.id,
      teamRole: row.team_role,
      status: row.status,
      joinedOn: row.joined_on,
      rate: row.rate_bps === null ? null : { rateBps: row.rate_bps, teamShareBps: row.team_share_bps },
    };
  });
}
