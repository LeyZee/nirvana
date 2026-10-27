import { z } from 'zod';

import { CurrentUserSchema, type UserRole } from './auth';

/** What a member does in the team (ADR 0023): distinct from the access role, which stays `operator` for both. */
export const TEAM_ROLES = ['chatter', 'manager'] as const;
export const TeamRoleSchema = z.enum(TEAM_ROLES);
export type TeamRole = z.infer<typeof TeamRoleSchema>;

/** Imperium's statuses (EQ-01). A member who left is never deleted: his statements and invoices stay. */
export const TEAM_MEMBER_STATUSES = [
  'active',
  'on_leave',
  'sick',
  'travelling',
  'suspended',
  'left',
] as const;
export const TeamMemberStatusSchema = z.enum(TEAM_MEMBER_STATUSES);
export type TeamMemberStatus = z.infer<typeof TeamMemberStatusSchema>;

/**
 * What a transaction of `withMember` may read of the team (ADR 0024, EQ-01): `owner` everything and
 * alone writes rates and presets, `agency` the whole team, `self` one's own rows. Decided by the server, never read
 * from a request.
 */
export const TEAM_SCOPES = ['owner', 'agency', 'self'] as const;
export const TeamScopeSchema = z.enum(TEAM_SCOPES);
export type TeamScope = z.infer<typeof TeamScopeSchema>;

/** The scope of an account: the owner's, a manager's while `active`, and `self` for anyone else. */
export function teamScopeFor(
  role: UserRole,
  member: { readonly teamRole: TeamRole; readonly status: TeamMemberStatus } | null,
): TeamScope {
  if (role === 'owner') return 'owner';
  if (role === 'operator' && member?.teamRole === 'manager' && member.status === 'active') return 'agency';
  return 'self';
}

/** A rate in basis points (10 000 = 100 %): no float on money (ADR 0023 § Paie). */
export const BasisPointsSchema = z.number().int().min(0).max(10_000);

/** ISO 3166-1 alpha-2, upper case (`BJ`, `MG`, `FR`). */
export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/);

/** An account's place in the team: `null` for the owner, a creator, or an operator who is not a member. */
export const TeamMembershipSchema = z.object({ role: TeamRoleSchema, status: TeamMemberStatusSchema });
export type TeamMembership = z.infer<typeof TeamMembershipSchema>;

/**
 * `GET /v1/me` (ADR 0024): who is signed in, with his team role and the scope the server derives from it. The rail
 * and the route guards read it; the server's refusals stay the real barrier.
 */
export const MeSchema = CurrentUserSchema.extend({
  team: TeamMembershipSchema.nullable(),
  teamScope: TeamScopeSchema,
});
export type Me = z.infer<typeof MeSchema>;
