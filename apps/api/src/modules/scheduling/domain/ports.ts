import type {
  CreatorId,
  CreatorSummary,
  Platform,
  PlatformAccountId,
  SchedulingSettings,
  ShiftId,
  ShiftTemplateId,
  TeamMemberId,
  TeamMemberStatus,
  TeamScope,
  UserId,
} from '@nirvana/contracts';

/** Who writes, for the policies (`withTenantMember`) and the audit line. */
export interface Actor {
  readonly userId: UserId;
  readonly ip: string | null;
}

/** The creators that exist, with their names (the `persona` module's directory, injected by the composition root). */
export interface CreatorDirectory {
  list(): Promise<readonly CreatorSummary[]>;
}

/** A shift as stored, cancelled ones never read. */
export interface StoredShift {
  readonly id: ShiftId;
  readonly creatorId: CreatorId;
  readonly platformAccountId: PlatformAccountId;
  readonly memberId: TeamMemberId;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly templateId: ShiftTemplateId | null;
  readonly stoppedAt: Date | null;
}

export interface StoredTemplate {
  readonly id: ShiftTemplateId;
  readonly creatorId: CreatorId;
  readonly platformAccountId: PlatformAccountId;
  readonly memberId: TeamMemberId;
  readonly weekday: number;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly validFrom: string;
  readonly validUntil: string | null;
}

export interface StoredAccount {
  readonly id: PlatformAccountId;
  readonly creatorId: CreatorId;
  readonly platform: Platform;
  readonly handle: string;
}

export interface StoredMember {
  readonly id: TeamMemberId;
  readonly displayName: string;
  readonly color: string | null;
  readonly status: TeamMemberStatus;
}

/**
 * What one reader's scope sees of the planning, on every creator asked. The owner and an active manager read every
 * shift, account and template; anyone else reads their own shifts, and no template.
 */
interface PlanningRead {
  readonly scope: TeamScope;
  /** Not cancelled, overlapping the range read. */
  readonly shifts: readonly StoredShift[];
  /** Every account of the creators for a planner; for anyone else, those their shifts are on. */
  readonly accounts: readonly StoredAccount[];
  /** Running in the range; planners only. */
  readonly templates: readonly StoredTemplate[];
  /** `occurrenceKey` of each shift the templates made in the range, cancelled or moved ones included. */
  readonly made: ReadonlySet<string>;
  /** The members the policies let the reader see, among those the shifts and templates name. */
  readonly members: readonly StoredMember[];
}

interface NewShift {
  readonly id: ShiftId;
  readonly creatorId: CreatorId;
  readonly platformAccountId: PlatformAccountId;
  readonly memberId: TeamMemberId;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

interface ShiftChange {
  readonly memberId?: TeamMemberId;
  readonly startsAt?: Date;
  readonly endsAt?: Date;
}

interface NewTemplate {
  readonly id: ShiftTemplateId;
  readonly creatorId: CreatorId;
  readonly platformAccountId: PlatformAccountId;
  readonly memberId: TeamMemberId;
  readonly weekday: number;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly validFrom: string;
}

/** Where the store reads « now » and « today » for the rules that need them. */
export interface PlanningClock {
  readonly now: Date;
  readonly timeZone: string;
}

/**
 * Storage of the planning, implemented in `infra/` with `withTenantMember`: the policies decide what each scope
 * reads, and the rules that need stored rows (a member's status, a shift under way) run in the same transaction.
 * The exclusion constraints decide overlaps; the store turns their violation into the module's conflict, with the
 * shift in the way.
 */
export interface PlanningStore {
  /** Any team scope; `null` until the owner saves them. */
  settings(actor: UserId): Promise<SchedulingSettings | null>;
  /** Owner. */
  saveSettings(actor: Actor, settings: SchedulingSettings): Promise<void>;
  read(
    actor: UserId,
    creatorIds: readonly CreatorId[],
    range: { readonly from: Date; readonly to: Date },
  ): Promise<PlanningRead>;
  /** Owner and active manager: each shift covering `at`, of an active member, with that member. */
  onDuty(
    actor: UserId,
    creatorIds: readonly CreatorId[],
    at: Date,
  ): Promise<{ shift: StoredShift; member: StoredMember }[]>;
  /** Owner and active manager. */
  createShift(actor: Actor, shift: NewShift, clock: PlanningClock): Promise<StoredShift>;
  /**
   * Owner and active manager; `shift_not_found` for a cancelled shift or one the actor cannot read. `null` when the
   * change cancelled it (stopped in the minute it started).
   */
  updateShift(
    actor: Actor,
    id: ShiftId,
    change: ShiftChange,
    clock: PlanningClock,
  ): Promise<StoredShift | null>;
  cancelShift(actor: Actor, id: ShiftId, clock: PlanningClock): Promise<void>;
  /** Owner and active manager: the templates running from `today`. */
  templates(actor: UserId, creatorIds: readonly CreatorId[], today: string): Promise<StoredTemplate[]>;
  /** Owner and active manager: the template, and its shifts ahead, made in the same transaction. */
  createTemplate(actor: Actor, template: NewTemplate, clock: PlanningClock): Promise<StoredTemplate>;
  /** Owner and active manager: ends today, its shifts not yet started cancelled with it. */
  endTemplate(actor: Actor, id: ShiftTemplateId, clock: PlanningClock): Promise<void>;
}

/** Who is on shift on one account of a creator (glossary « En poste »). */
export interface OnShift {
  readonly memberId: TeamMemberId;
  readonly platformAccountId: PlatformAccountId;
  readonly shiftId: ShiftId;
  readonly endsAt: Date;
}

/** The reads and the job that cross creators, on the admin connection (`*Unscoped`). */
export interface PlanningAdmin {
  /** The member's shifts not cancelled whose access window may still be open at `now`, with their accounts. */
  memberShiftsUnscoped(
    userId: UserId,
    since: Date,
  ): Promise<{
    status: TeamMemberStatus;
    shifts: (StoredShift & { platform: Platform; handle: string })[];
  } | null>;
  /** `onShift` on a creator at `at`, without the margin: her active members whose shift covers it. */
  onShiftUnscoped(creatorId: CreatorId, at: Date): Promise<OnShift[]>;
  /** The settings, for the job (no member behind it). */
  settingsUnscoped(): Promise<SchedulingSettings | null>;
  /** The templates running on `today` (a calendar day in the grid's zone), for the job. */
  runningTemplatesUnscoped(today: string): Promise<ShiftTemplateId[]>;
  /**
   * One template's shifts ahead, in a transaction of its own with the template locked as `endTemplate` locks it: none
   * once it has ended, or while its member is not `active` on its creator; how many were new.
   */
  makeTemplateShiftsUnscoped(id: ShiftTemplateId, clock: PlanningClock): Promise<number>;
}

/** What the job logs through; the composition root passes the job's own logger. */
export interface JobLogger {
  warn(object: object, message: string): void;
}
