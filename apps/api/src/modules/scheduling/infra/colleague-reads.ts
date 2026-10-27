import { TeamMemberIdSchema, TeamMemberStatusSchema } from '@nirvana/contracts';
import { and, eq, inArray, schema, sql, withAdmin, type Database } from '@nirvana/db';

import type { ColleagueReads } from '../domain/ports';

import { shiftColumns, StoredAccountSchema, toShift } from './rows';

const { leaveRequests, platformAccounts, shiftSwapRequests, shifts, teamMembers, user } = schema;

/**
 * What a chatter reads of their colleagues (ADR 0031), on the admin connection: the team's policies show a chatter
 * their own row alone, and a policy would open a colleague's whole row (the RLS picks rows, not columns). Each read is
 * bounded to what the contract gives (a display name, a colour, shifts and their accounts), and is called only after
 * the policies have shown that the reader may: a swap they read, a shift of their own (`*Unscoped`).
 */
export function createDrizzleColleagueReads(adminDb: Database): ColleagueReads {
  return {
    namesUnscoped: async (memberIds) => {
      if (memberIds.length === 0) return [];
      const rows = await withAdmin(adminDb, (tx) =>
        tx
          .select({ id: teamMembers.id, displayName: teamMembers.displayName, color: teamMembers.color })
          .from(teamMembers)
          .where(inArray(teamMembers.id, [...memberIds])),
      );
      return rows.map((row) => ({ ...row, id: TeamMemberIdSchema.parse(row.id) }));
    },

    candidatesUnscoped: (shift, creatorIds, now, until) =>
      withAdmin(adminDb, async (tx) => {
        // A leave that covers the shift's hours (`leaveCover`): approved, or cancelled under way before its end.
        const away = sql`exists (select 1 from ${leaveRequests} l where l.member_id = ${teamMembers.id} and (
          (l.status = 'approved' and tstzrange(l.starts_at, l.ends_at, '[)') && tstzrange(${shift.startsAt}, ${shift.endsAt}, '[)'))
          or (l.status = 'cancelled' and l.cancelled_at > l.starts_at
            and tstzrange(l.starts_at, least(l.ends_at, l.cancelled_at), '[)') && tstzrange(${shift.startsAt}, ${shift.endsAt}, '[)'))
        ))`;
        const members = await tx
          .select({ id: teamMembers.id, displayName: teamMembers.displayName, color: teamMembers.color })
          .from(teamMembers)
          .innerJoin(user, eq(user.id, teamMembers.userId))
          .where(
            and(
              eq(teamMembers.status, 'active'),
              sql`${shift.creatorId} = any(${user.creatorIds})`,
              sql`${teamMembers.id} <> ${shift.memberId}`,
              sql`not ${away}`,
            ),
          );
        const ids = members.map((member) => member.id);
        const theirs =
          ids.length === 0 || creatorIds.length === 0
            ? []
            : await tx
                .select(shiftColumns)
                .from(shifts)
                .where(
                  and(
                    inArray(shifts.memberId, ids),
                    inArray(shifts.creatorId, [...creatorIds]),
                    sql`${shifts.cancelledAt} is null`,
                    sql`${shifts.startsAt} > ${now}`,
                    sql`${shifts.startsAt} < ${until}`,
                  ),
                );
        const accountIds = [...new Set(theirs.map((row) => row.platformAccountId))];
        const accounts =
          accountIds.length === 0
            ? []
            : await tx
                .select({
                  id: platformAccounts.id,
                  creatorId: platformAccounts.creatorId,
                  platform: platformAccounts.platform,
                  handle: platformAccounts.handle,
                })
                .from(platformAccounts)
                .where(inArray(platformAccounts.id, accountIds));
        return {
          members: members.map((row) => ({ ...row, id: TeamMemberIdSchema.parse(row.id) })),
          shifts: theirs.map(toShift),
          accounts: accounts.map((row) => StoredAccountSchema.parse(row)),
        };
      }),

    memberWorkUnscoped: async (memberId) => {
      const [row] = await withAdmin(adminDb, (tx) =>
        tx
          .select({ status: teamMembers.status, creatorIds: user.creatorIds })
          .from(teamMembers)
          .innerJoin(user, eq(user.id, teamMembers.userId))
          .where(eq(teamMembers.id, memberId)),
      );
      return row === undefined
        ? null
        : { status: TeamMemberStatusSchema.parse(row.status), creatorIds: row.creatorIds };
    },

    shiftUnscoped: async (id) => {
      const [row] = await withAdmin(adminDb, (tx) =>
        tx
          .select({ ...shiftColumns, cancelledAt: shifts.cancelledAt })
          .from(shifts)
          .where(eq(shifts.id, id)),
      );
      return row === undefined ? null : { ...toShift(row), cancelled: row.cancelledAt !== null };
    },

    lapseSwapsUnscoped: (now) =>
      withAdmin(adminDb, async (tx) => {
        // A proposal holds while each of its shifts is still as noted: same member, same hours, not cancelled, ahead.
        const asNoted = (shiftId: unknown, memberId: unknown, startsAt: unknown, endsAt: unknown) =>
          sql`exists (select 1 from ${shifts} x where x.id = ${shiftId} and x.member_id = ${memberId}
            and x.starts_at = ${startsAt} and x.ends_at = ${endsAt} and x.cancelled_at is null and x.starts_at > ${now})`;
        const lapsed = await tx
          .update(shiftSwapRequests)
          .set({ status: 'lapsed', resolvedAt: sql`now()`, updatedAt: now })
          .where(
            and(
              eq(shiftSwapRequests.status, 'proposed'),
              sql`not (${asNoted(shiftSwapRequests.shiftId, shiftSwapRequests.requesterId, shiftSwapRequests.shiftStartsAt, shiftSwapRequests.shiftEndsAt)}
                and (${shiftSwapRequests.targetShiftId} is null or ${asNoted(shiftSwapRequests.targetShiftId, shiftSwapRequests.targetMemberId, shiftSwapRequests.targetShiftStartsAt, shiftSwapRequests.targetShiftEndsAt)}))`,
            ),
          )
          .returning({ id: shiftSwapRequests.id });
        return lapsed.length;
      }),
  };
}
