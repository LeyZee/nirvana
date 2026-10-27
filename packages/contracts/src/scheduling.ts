import { z } from 'zod';

import { PlatformSchema } from './enums';
import {
  CreatorIdSchema,
  PlatformAccountIdSchema,
  ShiftIdSchema,
  ShiftTemplateIdSchema,
  TeamMemberIdSchema,
} from './ids';
import { TimezoneSchema } from './persona';
import { CalendarDaySchema, MemberColorSchema } from './team-members';

/**
 * Planning (EQ-02, ADR 0023 § Modules, ADR 0025), under `/v1/scheduling`.
 *
 * Time. A shift is the half-open range [`startsAt`, `endsAt`) of two UTC instants (ADR 0011): it covers its start and
 * stops covering at its end, so a shift that ends at 06:00 and the next one that starts at 06:00 never overlap. A
 * screen shows the instants in the zone it chooses (the grid's, the reader's, the member's). Only the slots and the
 * templates speak in wall-clock time, in the grid's zone (`SchedulingSettings.timeZone`), and they become instants
 * when a template makes its shifts: a slot keeps its wall-clock hours across a change of time, so a 6-hour night slot
 * lasts 5 or 7 hours that night.
 *
 * On shift (`onShift`, glossary « En poste »). A member is on shift on an account at an instant `at` when one of his
 * shifts there, not cancelled, has `startsAt ≤ at < endsAt`. A chatter's access window (ADR 0025, EQ-13) widens it by
 * `accessMarginMinutes` on each side: `startsAt − margin ≤ at < endsAt + margin`. The server computes both from the
 * database at each request, never from a request and never from a cache: a shift cancelled, moved or shortened
 * counts as it now is from the next request on.
 */

/** Slot lengths that divide a day, so the slots tile it (4 × 6 h by default, like Imperium's grid). */
export const SHIFT_SLOT_LENGTHS_MINUTES = [60, 120, 180, 240, 360, 480, 720] as const;

/** The longest shift: beyond a day, it is a typing mistake. */
export const SHIFT_MAX_MINUTES = 24 * 60;

/** The widest range one planning read covers (six weeks). */
export const PLANNING_MAX_DAYS = 42;

/** A minute of the day in the grid's zone, from midnight: 0 to 1439. */
export const MinuteOfDaySchema = z.number().int().min(0).max(1439);

/**
 * The owner's planning settings (`GET`, `PUT /v1/scheduling/settings`). Changing the slots moves no shift and no
 * template: they keep their hours.
 */
export const SchedulingSettingsSchema = z
  .object({
    /** The zone the slots and the templates speak in. */
    timeZone: TimezoneSchema,
    /** Where the day's first slot starts, in minutes after midnight; earlier than the end of that slot. */
    slotStartMinute: MinuteOfDaySchema,
    slotLengthMinutes: z.literal(SHIFT_SLOT_LENGTHS_MINUTES),
    /** ADR 0025: how long before and after his shift a chatter keeps his creators in Nirvana. */
    accessMarginMinutes: z.number().int().min(0).max(120),
  })
  .refine((settings) => settings.slotStartMinute < settings.slotLengthMinutes, {
    message: 'Le premier créneau commence moins d’une durée de créneau après minuit',
    path: ['slotStartMinute'],
  });
export type SchedulingSettings = z.infer<typeof SchedulingSettingsSchema>;

/** One slot of the day (`ShiftSlot`, never `slot` alone): an end at or before its start is the next day. */
export const ShiftSlotSchema = z.object({ startMinute: MinuteOfDaySchema, endMinute: MinuteOfDaySchema });
export type ShiftSlot = z.infer<typeof ShiftSlotSchema>;

const MINUTES_PER_DAY = 24 * 60;

/** The day's slots, in order from the first one: `{ 0, 360 }, { 360, 720 }…` with the defaults. */
export function shiftSlotsOf(
  settings: Pick<SchedulingSettings, 'slotStartMinute' | 'slotLengthMinutes'>,
): ShiftSlot[] {
  const count = MINUTES_PER_DAY / settings.slotLengthMinutes;
  return Array.from({ length: count }, (_, index) => {
    const startMinute = settings.slotStartMinute + index * settings.slotLengthMinutes;
    return {
      startMinute: startMinute % MINUTES_PER_DAY,
      endMinute: (startMinute + settings.slotLengthMinutes) % MINUTES_PER_DAY,
    };
  });
}

/** A member's shift on one account of a creator. A cancelled shift is never sent back. */
export const ShiftSchema = z.object({
  id: ShiftIdSchema,
  creatorId: CreatorIdSchema,
  platformAccountId: PlatformAccountIdSchema,
  memberId: TeamMemberIdSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  /** The template that made it, or `null` for a shift set by hand. */
  templateId: ShiftTemplateIdSchema.nullable(),
});
export type Shift = z.infer<typeof ShiftSchema>;

/**
 * `POST /v1/scheduling/shifts` (owner, active manager) → 201 `ShiftSchema`. The member works on this creator, the
 * account is hers, and the range lasts a whole number of minutes, `SHIFT_MAX_MINUTES` at most. A member is never on
 * two shifts at once, and an account never has two members at once: either answers 409 with the shift in the way.
 */
export const CreateShiftBodySchema = z.object({
  creatorId: CreatorIdSchema,
  platformAccountId: PlatformAccountIdSchema,
  memberId: TeamMemberIdSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});
export type CreateShiftBody = z.infer<typeof CreateShiftBodySchema>;

/**
 * `PATCH /v1/scheduling/shifts/:shiftId` (owner, active manager) → `ShiftSchema`: another member, or other times
 * (shortened to now, it ends now). Same rules as a new shift. A template's shift changed by hand stays changed.
 */
export const UpdateShiftBodySchema = z
  .object({ memberId: TeamMemberIdSchema, startsAt: z.iso.datetime(), endsAt: z.iso.datetime() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Rien à changer');
export type UpdateShiftBody = z.infer<typeof UpdateShiftBodySchema>;

/*
 * `DELETE /v1/scheduling/shifts/:shiftId` (owner, active manager) → 204: the shift is cancelled, kept in the audit
 * trail, and its template never makes it again.
 */

/**
 * A weekly shift: every `weekday` from `validFrom`, from `startMinute` to `endMinute` in the grid's zone (an end at
 * or before the start is the next day). A template is never edited: it is ended, and a new one starts.
 */
export const ShiftTemplateSchema = z.object({
  id: ShiftTemplateIdSchema,
  creatorId: CreatorIdSchema,
  platformAccountId: PlatformAccountIdSchema,
  memberId: TeamMemberIdSchema,
  /** ISO weekday in the grid's zone: 1 Monday … 7 Sunday. */
  weekday: z.number().int().min(1).max(7),
  startMinute: MinuteOfDaySchema,
  endMinute: MinuteOfDaySchema,
  validFrom: CalendarDaySchema,
  /** Its last day, or `null` while it runs. */
  validUntil: CalendarDaySchema.nullable(),
});
export type ShiftTemplate = z.infer<typeof ShiftTemplateSchema>;

/** `GET /v1/scheduling/shift-templates` (owner, active manager): the templates still running, of every creator. */
export const ShiftTemplateListSchema = z.object({ templates: z.array(ShiftTemplateSchema) });

/**
 * `POST /v1/scheduling/shift-templates` (owner, active manager) → 201 `ShiftTemplateSchema`, from today at the
 * earliest in the grid's zone. Its shifts are made ahead (`SHIFT_TEMPLATE_HORIZON_DAYS`) by a job that can run again
 * without making one twice; an occurrence that would overlap another shift is not made, and the planning shows it in
 * `conflicts`.
 */
export const CreateShiftTemplateBodySchema = z
  .object({
    creatorId: CreatorIdSchema,
    platformAccountId: PlatformAccountIdSchema,
    memberId: TeamMemberIdSchema,
    weekday: z.number().int().min(1).max(7),
    startMinute: MinuteOfDaySchema,
    endMinute: MinuteOfDaySchema,
    validFrom: CalendarDaySchema,
  })
  .refine((body) => body.startMinute !== body.endMinute, {
    message: 'Un modèle commence et finit à des heures différentes',
    path: ['endMinute'],
  });
export type CreateShiftTemplateBody = z.infer<typeof CreateShiftTemplateBodySchema>;

/*
 * `DELETE /v1/scheduling/shift-templates/:templateId` (owner, active manager) → 204: the template ends today, and its
 * shifts that have not started are cancelled with it.
 */

/** How far ahead a template's shifts exist. */
export const SHIFT_TEMPLATE_HORIZON_DAYS = 28;

/** An account the reader can see on the planning, with its creator's name for the rows. */
export const PlanningAccountSchema = z.object({
  id: PlatformAccountIdSchema,
  creatorId: CreatorIdSchema,
  creatorName: z.string().min(1),
  platform: PlatformSchema,
  handle: z.string().min(1),
});
export type PlanningAccount = z.infer<typeof PlanningAccountSchema>;

/** A member as the planning names him: on a shift, in a template, or in a conflict. */
export const PlanningMemberSchema = z.object({
  id: TeamMemberIdSchema,
  displayName: z.string().min(1),
  color: MemberColorSchema.nullable(),
});
export type PlanningMember = z.infer<typeof PlanningMemberSchema>;

/** Why an occurrence of a template has no shift: its member is busy elsewhere, or its account already has someone. */
export const PLANNING_CONFLICT_REASONS = ['member_busy', 'account_taken'] as const;
export const PlanningConflictReasonSchema = z.enum(PLANNING_CONFLICT_REASONS);

export const PlanningConflictSchema = z.object({
  templateId: ShiftTemplateIdSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  reason: PlanningConflictReasonSchema,
  /** The shift in the way. */
  shiftId: ShiftIdSchema,
});
export type PlanningConflict = z.infer<typeof PlanningConflictSchema>;

/**
 * `GET /v1/scheduling/planning?from=…&to=…[&creatorId=…]`: the shifts that overlap [`from`, `to`), at most
 * `PLANNING_MAX_DAYS`. The owner and an active manager read every creator; any other member reads his own shifts
 * only, on his own creators, and gets no conflicts.
 */
export const PlanningQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  creatorId: CreatorIdSchema.optional(),
});
export type PlanningQuery = z.infer<typeof PlanningQuerySchema>;

export const PlanningSchema = z.object({
  settings: SchedulingSettingsSchema,
  accounts: z.array(PlanningAccountSchema),
  members: z.array(PlanningMemberSchema),
  shifts: z.array(ShiftSchema),
  conflicts: z.array(PlanningConflictSchema),
});
export type Planning = z.infer<typeof PlanningSchema>;

/** Who is on shift right now on one account (`GET /v1/scheduling/on-duty`, owner and active manager). */
export const OnDutySchema = z.object({
  creatorId: CreatorIdSchema,
  platformAccountId: PlatformAccountIdSchema,
  member: PlanningMemberSchema,
  shiftId: ShiftIdSchema,
  endsAt: z.iso.datetime(),
});
export type OnDuty = z.infer<typeof OnDutySchema>;

export const OnDutyListSchema = z.object({ onDuty: z.array(OnDutySchema) });

/** A member's own shift, with its creator's name: a chatter does not read the creators' list (ADR 0025). */
export const MyShiftSchema = ShiftSchema.extend({ creatorName: z.string().min(1) });
export type MyShift = z.infer<typeof MyShiftSchema>;

/**
 * `GET /v1/scheduling/my-shifts` (any team member): the shift he is on now, if any, and his next one, for Aujourd'hui.
 * Both `null` for an account that is not in the team.
 */
export const MyShiftsSchema = z.object({ current: MyShiftSchema.nullable(), next: MyShiftSchema.nullable() });
export type MyShifts = z.infer<typeof MyShiftsSchema>;

/**
 * The error codes of `/v1/scheduling`, for the screens to say them in French (the suffix gives the status, api.md):
 * `shift_not_found` 404 ; `shift_template_not_found` 404 ; `member_not_found` 404 ; `creator_not_found` 404 ;
 * `platform_account_not_found` 404, an account that is not this creator's ; `member_left_conflict` 409, a member who
 * left gets no shift ; `member_creator_conflict` 409, the member does not work on this creator ;
 * `shift_member_conflict` 409, the member already has a shift then ; `shift_account_conflict` 409, the account already
 * has a member then (both with `details.shiftId`, the shift in the way) ; `shift_range_invalid` 400, an end at or
 * before the start, a range longer than `SHIFT_MAX_MINUTES` or not in whole minutes ; `planning_range_invalid` 400,
 * `to` at or before `from`, or more than `PLANNING_MAX_DAYS` ; `shift_template_date_invalid` 400, a template that
 * starts before today.
 */
export const SCHEDULING_ERROR_CODES = [
  'shift_not_found',
  'shift_template_not_found',
  'member_not_found',
  'creator_not_found',
  'platform_account_not_found',
  'member_left_conflict',
  'member_creator_conflict',
  'shift_member_conflict',
  'shift_account_conflict',
  'shift_range_invalid',
  'planning_range_invalid',
  'shift_template_date_invalid',
] as const;
export type SchedulingErrorCode = (typeof SCHEDULING_ERROR_CODES)[number];
