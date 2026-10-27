import type { CreatorId, TeamMemberStatus, TeamRole, TeamScope } from '@nirvana/contracts';

import {
  CommissionDateInvalid,
  CreatorNotFound,
  MemberLeftConflict,
  OwnerOnly,
  TeamScopeForbidden,
  TeamShareInvalid,
} from './errors';

/** Team rules (EQ-01, ADR 0023, ADR 0024), pure. A calendar day is `YYYY-MM-DD`, which sorts like the date. */

/** The day it is at `at` in `timeZone`: the agency's for rates and presets (ADR 0023 § Paie). */
export function calendarDayIn(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** A rate or a preset applies from a day on, never to a day already worked: today at the earliest. */
export function assertStartsFromToday(effectiveFrom: string, today: string): void {
  if (effectiveFrom < today) throw new CommissionDateInvalid();
}

/** A share of the team's net is a manager's; a chatter has none. */
export function assertTeamShareFits(teamRole: TeamRole, teamShareBps: number | null): void {
  if (teamShareBps !== null && teamRole !== 'manager') throw new TeamShareInvalid();
}

/** A member who left keeps his record, his statements and his invoices, but nothing of it changes any more. */
export function assertStillInTeam(status: TeamMemberStatus): void {
  if (status === 'left') throw new MemberLeftConflict();
}

/** The notes and the presets: the owner and the active managers only. */
export function assertReadsTeam(scope: TeamScope): void {
  if (scope === 'self') throw new TeamScopeForbidden();
}

/** Members, rates and presets are written by the owner only; the route guard and the policies say so too. */
export function assertOwnerScope(scope: TeamScope): void {
  if (scope !== 'owner') throw new OwnerOnly();
}

/** The rate of a day: the latest one effective on that day, or `null` before the first one starts. */
export function rateInForce<T extends { readonly effectiveFrom: string }>(
  rates: readonly T[],
  day: string,
): T | null {
  let found: T | null = null;
  for (const rate of rates) {
    if (rate.effectiveFrom <= day && (found === null || rate.effectiveFrom > found.effectiveFrom))
      found = rate;
  }
  return found;
}

/** The presets offered on a day: for each name, its rate in force that day; by name. */
export function presetsInForce<T extends { readonly name: string; readonly effectiveFrom: string }>(
  presets: readonly T[],
  day: string,
): T[] {
  const byName = new Map<string, T[]>();
  for (const preset of presets) byName.set(preset.name, [...(byName.get(preset.name) ?? []), preset]);
  return [...byName.values()]
    .map((versions) => rateInForce(versions, day))
    .filter((preset): preset is T => preset !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Each creator once, in the order given. */
export function uniqueCreatorIds(ids: readonly CreatorId[]): CreatorId[] {
  return [...new Set(ids)];
}

/** Refuses a creator that does not exist, naming the missing ones. */
export function assertCreatorsExist(asked: readonly CreatorId[], known: ReadonlySet<CreatorId>): void {
  const missing = asked.filter((id) => !known.has(id));
  if (missing.length > 0) throw new CreatorNotFound(missing);
}

/** Leaving empties the member's creators and ends his sessions (EQ-14 does the rest of the departure). */
export function leavesTeam(from: TeamMemberStatus, to: TeamMemberStatus): boolean {
  return from !== 'left' && to === 'left';
}
