import {
  AGENT_SLOTS_MAX,
  AgentHoursSchema,
  DEFAULT_AGENT_HOURS,
  nextFollowUpAllowed,
  SUGGESTED_REPLY_SLOTS,
  type AgentHours,
  type AgentSlot,
  type MinuteRange,
} from '@nirvana/contracts';

import { clockOf, MINUTES_PER_DAY } from '@/scheduling/time';

/*
 * Créatrices › Heures (P3-14) in words and shapes: her slots on a week of her clock, the sentences the planning uses
 * (« 9 h – 1 h », « jusqu'au lendemain »), the issues of the contract placed on the line they belong to. Pure
 * functions: the section lays them out.
 */

export const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;

const NBSP = '\u00a0';

/** « 23 h – 5 h », with the spaces of the planning: a range never splits across two lines. */
export const rangeOf = (range: MinuteRange): string =>
  `${clockOf(range.startMinute)}${NBSP}–${NBSP}${clockOf(range.endMinute)}`;

/**
 * What a slot covers: « toute la journée », « 9 h – 1 h, jusqu'au lendemain », « 9 h – 18 h ». A slot that ends at
 * 0 h closes with her day: nothing of it falls on the next one.
 */
export function slotWords(slot: Pick<AgentSlot, 'startMinute' | 'endMinute'>): string {
  if (slot.startMinute === slot.endMinute) return 'toute la journée';
  const overnight = slot.endMinute !== 0 && slot.endMinute < slot.startMinute;
  return `${rangeOf(slot)}${overnight ? ', jusqu’au lendemain' : ''}`;
}

/** « Paris » from « Europe/Paris », « Sao Paulo » from « America/Sao_Paulo ». */
export const zoneCity = (timeZone: string): string =>
  (timeZone.split('/').at(-1) ?? timeZone).replaceAll('_', ' ');

/**
 * The header that says whose clock the page reads: the planning reads at the agency's hour, these hours at hers.
 * Her first name only, like the reader of Suivi.
 */
export const clockHeader = (name: string, timeZone: string): string =>
  `À l’heure de ${name.trim().split(/\s+/u)[0] ?? name} (${zoneCity(timeZone)})`;

/** `HH:MM` for an `<input type="time">`. */
export const inputOf = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** The minute of the day an `<input type="time">` holds, or null while it is empty or half typed. */
export function minuteOfInput(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/u.exec(value);
  if (match === null) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute < MINUTES_PER_DAY && Number(match[2]) < 60 ? minute : null;
}

/** A slot drawn on one day of the week: an overnight slot is two bars, the second one « continued » the next day. */
export interface Bar {
  /** 1 Monday … 7 Sunday. */
  readonly day: number;
  /** Minutes from midnight; `to` may be 1440. */
  readonly from: number;
  readonly to: number;
  readonly enabled: boolean;
  /** The part of an overnight slot that falls after midnight. */
  readonly continued: boolean;
  /** Its index in the setting, to name it. */
  readonly index: number;
}

/** Every slot on the week of her clock; a slot past Sunday night continues on Monday. */
export function barsOf(slots: readonly AgentSlot[]): Bar[] {
  return slots.flatMap((slot, index) => {
    const base = { enabled: slot.enabled, index };
    if (slot.startMinute === slot.endMinute)
      return [{ ...base, day: slot.day, from: 0, to: MINUTES_PER_DAY, continued: false }];
    if (slot.endMinute > slot.startMinute)
      return [{ ...base, day: slot.day, from: slot.startMinute, to: slot.endMinute, continued: false }];
    const next = (slot.day % 7) + 1;
    return [
      { ...base, day: slot.day, from: slot.startMinute, to: MINUTES_PER_DAY, continued: false },
      ...(slot.endMinute === 0 ? [] : [{ ...base, day: next, from: 0, to: slot.endMinute, continued: true }]),
    ];
  });
}

/** The slots in the order of the week (day, then start), each with its index in the setting. */
export const orderedSlots = (
  slots: readonly AgentSlot[],
): { readonly slot: AgentSlot; readonly index: number }[] =>
  slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => a.slot.day - b.slot.day || a.slot.startMinute - b.slot.startMinute || a.index - b.index);

/** The slot « Ajouter un créneau » adds: 9 h – 1 h on the first day with none, else on Monday. */
export function newSlot(slots: readonly AgentSlot[]): AgentSlot {
  const taken = new Set(slots.map((slot) => slot.day));
  const day = [1, 2, 3, 4, 5, 6, 7].find((d) => !taken.has(d)) ?? 1;
  return { day, startMinute: 9 * 60, endMinute: 60, enabled: true };
}

export const canAddSlot = (slots: readonly AgentSlot[]): boolean => slots.length < AGENT_SLOTS_MAX;

/** The slots offered when the owner switches to slots: the ones she had, or 9 h – 1 h every day. */
export const slotsToOffer = (kept: readonly AgentSlot[] | null): AgentSlot[] =>
  kept !== null && kept.length > 0 ? [...kept] : [...SUGGESTED_REPLY_SLOTS];

/** The contract's issues, by path (`reply.slots.3.startMinute`): the first message of each. */
export function issuesOf(hours: AgentHours): ReadonlyMap<string, string> {
  const parsed = AgentHoursSchema.safeParse(hours);
  const issues = new Map<string, string>();
  if (parsed.success) return issues;
  for (const issue of parsed.error.issues) {
    const path = issue.path.map(String).join('.');
    if (!issues.has(path)) issues.set(path, issue.message);
  }
  return issues;
}

/** The issue of one slot line: its overlap, or a field of it. */
export function slotIssue(issues: ReadonlyMap<string, string>, index: number): string | null {
  const prefix = `reply.slots.${String(index)}`;
  for (const [path, message] of issues) if (path === prefix || path.startsWith(`${prefix}.`)) return message;
  return null;
}

/** The issue of a range (`followUpQuiet`, `night`). */
export function rangeIssue(
  issues: ReadonlyMap<string, string>,
  key: 'followUpQuiet' | 'night',
): string | null {
  for (const [path, message] of issues) if (path === key || path.startsWith(`${key}.`)) return message;
  return null;
}

/** Two settings say the same thing (the screen compares a draft with what is stored). */
export const sameHours = (a: AgentHours, b: AgentHours): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The draft is the defaults: saving it stores none (`null`), so that she follows them as they are. */
export const isDefaultHours = (hours: AgentHours): boolean => sameHours(hours, DEFAULT_AGENT_HOURS);

/**
 * No follow-up can ever go out: no minute of her week is both in a slot and out of her quiet hours (slots from
 * 23 h to 1 h with quiet hours from 23 h to 9 h). A warning, not an error: she may want it. Said of a setting the
 * contract takes only: with every slot off, the contract's own error is the one to read.
 */
export const noFollowUpEver = (hours: AgentHours, timeZone: string, now: Date): boolean =>
  hours.reply.mode === 'slots' &&
  AgentHoursSchema.safeParse(hours).success &&
  nextFollowUpAllowed(hours, timeZone, now) === null;
