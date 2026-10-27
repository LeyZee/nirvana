import type {
  CommissionPreset,
  CommissionPresetId,
  CommissionRate,
  CommissionRateId,
  CreatorId,
  TeamMember,
  TeamMemberId,
  TeamMemberNote,
  TeamMemberNoteId,
  TeamMemberStatus,
  TeamRole,
  UpdateTeamMemberBody,
  UserId,
} from '@nirvana/contracts';

/** Who writes, for the policies (`withMember`) and the audit line. */
export interface Actor {
  readonly userId: UserId;
  readonly ip: string | null;
}

/** A rate from a day on, resolved: a preset already turned into its rate. */
export interface NewRate {
  readonly id: CommissionRateId;
  readonly rateBps: number;
  readonly teamShareBps: number | null;
  readonly presetId: CommissionPresetId | null;
  readonly effectiveFrom: string;
}

/** A member to create: his account (no password yet), his record and his first rate. */
interface NewMember {
  readonly id: TeamMemberId;
  readonly userId: UserId;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
  readonly teamRole: TeamRole;
  readonly country: string;
  readonly timeZone: string;
  readonly color: string | null;
  readonly joinedOn: string;
  readonly creatorIds: readonly CreatorId[];
  readonly rate: NewRate;
}

/** What changes on a record; what is absent stays. The creators are checked and each kept once. */
type MemberPatch = Omit<UpdateTeamMemberBody, 'creatorIds'> & {
  readonly creatorIds?: readonly CreatorId[];
};

interface NewPreset {
  readonly id: CommissionPresetId;
  readonly name: string;
  readonly rateBps: number;
  readonly effectiveFrom: string;
}

/**
 * Storage of the team, implemented in `infra/` with `withMember`: the policies decide what each scope reads, and the
 * rules that need the stored record (a member who left, a share for a chatter) run in the same transaction.
 */
export interface TeamStore {
  /** What the actor's scope reads: everyone for the owner and an active manager, his own record otherwise. */
  members(actor: UserId, today: string): Promise<TeamMember[]>;
  member(actor: UserId, id: TeamMemberId, today: string): Promise<TeamMember | null>;
  /** Owner. `member_conflict` when an account already has this e-mail. */
  create(actor: Actor, member: NewMember): Promise<void>;
  /** Owner. `member_not_found`, `member_left_conflict`. */
  update(actor: Actor, id: TeamMemberId, patch: MemberPatch): Promise<void>;
  /** Owner. Leaving empties his creators and ends his sessions in the same transaction. */
  changeStatus(actor: Actor, id: TeamMemberId, status: TeamMemberStatus): Promise<void>;
  /** Owner. `team_share_invalid` for a chatter's share, `commission_rate_conflict` for a second rate that day. */
  addRate(actor: Actor, id: TeamMemberId, rate: NewRate): Promise<CommissionRate>;
  /** Every rate, newest first; `null` when the actor does not read this member. */
  rates(actor: UserId, id: TeamMemberId): Promise<CommissionRate[] | null>;
  /** Every preset row, all days; the owner and the active managers only. */
  presets(actor: UserId): Promise<CommissionPreset[]>;
  /** Owner. `commission_preset_conflict` for a second rate of this name that day. */
  addPreset(actor: Actor, preset: NewPreset): Promise<CommissionPreset>;
  /** Newest first; the owner and the active managers, never on their own record. `null` for an unknown member. */
  notes(actor: UserId, id: TeamMemberId): Promise<TeamMemberNote[] | null>;
  addNote(
    actor: Actor,
    id: TeamMemberId,
    note: { readonly id: TeamMemberNoteId; readonly body: string },
  ): Promise<TeamMemberNote>;
}

/** The creators that exist, among those asked (the `persona` module's, injected by the composition root). */
export interface CreatorRoster {
  existing(ids: readonly CreatorId[]): Promise<ReadonlySet<CreatorId>>;
}
