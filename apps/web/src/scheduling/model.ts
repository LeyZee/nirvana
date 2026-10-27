import type {
  MyShift,
  MyShifts,
  Planning,
  PlanningAccount,
  PlanningConflict,
  PlanningMember,
  Platform,
  Shift,
  ShiftTemplate,
} from '@nirvana/contracts';

import type { SchedulingRefusalCode } from './api';
import { clockOf, dayOf, rangeAt, shortDay } from './time';

/**
 * The planning without React (EQ-02): where each shift sits in a week, what a conflict says, and where the member is
 * in their day (Aujourd'hui, Suivi). The server decides who is on shift; this only reads what it sent.
 */

/** What each refusal says, in the words of the screens (contracts `SCHEDULING_ERROR_CODES`). */
export const ERROR_MESSAGES: Readonly<Record<SchedulingRefusalCode, string>> = {
  shift_not_found: 'Ce shift n’existe plus : le planning est relu.',
  shift_template_not_found: 'Ce shift qui revient n’existe plus : le planning est relu.',
  member_not_found: 'Ce membre n’existe plus.',
  creator_not_found: 'Cette créatrice n’existe plus.',
  platform_account_not_found: 'Ce compte n’est pas celui de cette créatrice.',
  member_left_conflict: 'Seul un membre actif reçoit un shift.',
  member_creator_conflict:
    'Ce membre ne travaille pas sur cette créatrice : ajoute-la à sa fiche dans Membres.',
  shift_member_conflict: 'Ce membre est déjà sur un autre shift à ces heures.',
  shift_account_conflict: 'Ce compte a déjà quelqu’un à ces heures.',
  shift_ended_conflict: 'Ce shift est fini, ou finirait avant maintenant : il ne change plus.',
  shift_started_conflict: 'Ce shift a commencé : tu peux seulement le finir plus tôt ou l’arrêter.',
  shift_range_invalid: 'Ces heures ne vont pas : la fin vient après le début, et un shift dure 24 h au plus.',
  planning_range_invalid: 'Cette période ne se lit pas d’un coup.',
  shift_template_date_invalid: 'Un shift qui revient commence aujourd’hui au plus tôt.',
  role_forbidden: 'Ton accès au planning a changé. Recharge la page.',
};

const PLATFORMS: Readonly<Record<Platform, string>> = {
  reveal: 'Reveal',
  onlyfans: 'OnlyFans',
  instagram: 'Instagram',
  nirvana: 'Nirvana',
};

export const platformName = (platform: Platform): string => PLATFORMS[platform];

/** « @nora sur Reveal ». */
export const accountLine = (account: { readonly platform: Platform; readonly handle: string }): string =>
  `@${account.handle} sur ${platformName(account.platform)}`;

export type Phase = 'later' | 'live' | 'past';

/** Where a shift is in time: to come, under way, or over. */
export function phaseOf(shift: Pick<Shift, 'startsAt' | 'endsAt'>, now: Date): Phase {
  const at = now.getTime();
  if (new Date(shift.endsAt).getTime() <= at) return 'past';
  return new Date(shift.startsAt).getTime() <= at ? 'live' : 'later';
}

/** A shift in one day of the grid. */
export interface Chip {
  readonly shift: Shift;
  readonly member: PlanningMember | null;
  /** It started on an earlier day of the range, before this one. */
  readonly continued: boolean;
  /** It ends on a later day: a night shift. */
  readonly overnight: boolean;
}

export interface GridRow {
  readonly account: PlanningAccount;
  /** Each day of the range, in order, with its shifts by start. */
  readonly days: ReadonlyMap<string, readonly Chip[]>;
}

/**
 * The week as rows of accounts and columns of days, read in `timeZone`. A shift sits on the day it starts; one that
 * started before the range sits on its first day, marked as continued, so a Sunday night shows on Monday morning.
 */
export function gridOf(planning: Planning, days: readonly string[], timeZone: string): GridRow[] {
  const first = days[0];
  const members = new Map(planning.members.map((member) => [member.id, member]));
  const accounts = [...planning.accounts].sort(
    (a, b) => a.creatorName.localeCompare(b.creatorName, 'fr') || a.handle.localeCompare(b.handle, 'fr'),
  );
  const shifts = [...planning.shifts].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return accounts.map((account) => {
    const cells = new Map<string, Chip[]>(days.map((day) => [day, []]));
    for (const shift of shifts) {
      if (shift.platformAccountId !== account.id) continue;
      const startDay = dayOf(shift.startsAt, timeZone);
      // An end at midnight sharp belongs to the day before: 18 h – 0 h is one day's shift.
      const endDay = dayOf(new Date(new Date(shift.endsAt).getTime() - 60_000), timeZone);
      const continued = first !== undefined && startDay < first;
      const day = continued ? first : startDay;
      cells.get(day)?.push({
        shift,
        member: members.get(shift.memberId) ?? null,
        continued,
        overnight: endDay > day,
      });
    }
    return { account, days: cells };
  });
}

/** « Lun. 26 · 23 h – 5 h · Théo est déjà sur un autre shift »: one occurrence a template could not place. */
export interface ConflictLine {
  readonly key: string;
  readonly when: string;
  readonly what: string;
  /** The shift in the way, to open it. */
  readonly shiftId: string;
}

export function conflictLines(
  conflicts: readonly PlanningConflict[],
  templates: readonly ShiftTemplate[],
  planning: Planning,
  timeZone: string,
): ConflictLine[] {
  const members = new Map(planning.members.map((member) => [member.id, member.displayName]));
  const accounts = new Map(planning.accounts.map((account) => [account.id, account]));
  return [...conflicts]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((conflict) => {
      const template = templates.find((one) => one.id === conflict.templateId);
      const who = template === undefined ? undefined : members.get(template.memberId);
      const account = template === undefined ? undefined : accounts.get(template.platformAccountId);
      const where = account === undefined ? '' : ` sur ${account.creatorName}`;
      const what =
        conflict.reason === 'member_busy'
          ? `${who ?? 'Son membre'} est déjà sur un autre shift`
          : `le compte${account === undefined ? '' : ` @${account.handle}`} a déjà quelqu’un`;
      return {
        key: `${conflict.templateId}-${conflict.startsAt}`,
        when: `${shortDay(dayOf(conflict.startsAt, timeZone))} · ${rangeAt(conflict.startsAt, conflict.endsAt, timeZone)}${where}`,
        what: what.charAt(0).toUpperCase() + what.slice(1),
        shiftId: conflict.shiftId,
      };
    });
}

/** « Chaque mardi, 23 h – 5 h ». */
export function templateLine(template: Pick<ShiftTemplate, 'weekday' | 'startMinute' | 'endMinute'>): string {
  const day = WEEKDAYS[template.weekday - 1] ?? '';
  return `Chaque ${day}, ${clockOf(template.startMinute)} – ${clockOf(template.endMinute)}`;
}

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;

/** Where the member is in their day, for Aujourd'hui: one state, the most pressing first. */
export type DayState =
  /** On shift now (`current`); `next` may follow it. */
  | { readonly kind: 'on'; readonly shift: MyShift; readonly next: MyShift | null }
  /** The shift is over, its creator still open until `accessEndsAt`. */
  | { readonly kind: 'ended'; readonly shift: MyShift; readonly next: MyShift | null }
  /** The next shift's start margin is open: its creator already is. */
  | { readonly kind: 'soon'; readonly shift: MyShift }
  | { readonly kind: 'later'; readonly shift: MyShift }
  | { readonly kind: 'none' };

export function dayStateOf(mine: MyShifts, now: Date): DayState {
  if (mine.current !== null) return { kind: 'on', shift: mine.current, next: mine.next };
  if (mine.ended !== null) return { kind: 'ended', shift: mine.ended, next: mine.next };
  if (mine.next === null) return { kind: 'none' };
  return new Date(mine.next.accessStartsAt).getTime() <= now.getTime()
    ? { kind: 'soon', shift: mine.next }
    : { kind: 'later', shift: mine.next };
}

/** Whether the member's creators are open in Nirvana now (ADR 0025): what Suivi says « Tu n'es pas en poste » about. */
export function accessOpen(mine: MyShifts, now: Date): boolean {
  const state = dayStateOf(mine, now);
  return state.kind === 'on' || state.kind === 'ended' || state.kind === 'soon';
}

/** How far a shift under way has gone, from 0 to 1. */
export function progressOf(shift: Pick<Shift, 'startsAt' | 'endsAt'>, now: Date): number {
  const start = new Date(shift.startsAt).getTime();
  const end = new Date(shift.endsAt).getTime();
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}
