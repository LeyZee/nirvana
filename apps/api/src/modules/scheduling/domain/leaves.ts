import type { LeaveRequestStatus } from '@nirvana/contracts';

/** Leave rules (ADR 0031, contract `scheduling.ts`), pure. */

export interface LeaveSpan {
  readonly status: LeaveRequestStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly cancelledAt: Date | null;
}

/**
 * What a leave covers: an approved one, from its start to its end; a cancelled one, up to its cancellation (nothing
 * when cancelled before it started); any other, nothing. The store's `coveringLeave` says the same in SQL.
 */
export function leaveCover(leave: LeaveSpan): { readonly startsAt: Date; readonly endsAt: Date } | null {
  if (leave.status === 'approved') return { startsAt: leave.startsAt, endsAt: leave.endsAt };
  if (leave.status !== 'cancelled' || leave.cancelledAt === null) return null;
  const endsAt = leave.cancelledAt.getTime() < leave.endsAt.getTime() ? leave.cancelledAt : leave.endsAt;
  return endsAt.getTime() > leave.startsAt.getTime() ? { startsAt: leave.startsAt, endsAt } : null;
}
