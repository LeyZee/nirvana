import {
  CustomAlertGroupIdSchema,
  SYSTEM_ALERT_CODES,
  SYSTEM_ALERT_LABELS,
  type AlertTriggerItem,
  type CreatorId,
  type CustomAlertGroupId,
  type EventId,
  type SystemAlertCode,
} from '@nirvana/contracts';

import { lastMessageAgo } from '../view';

import { addDays, clockAt, dayMonth, dayOf } from '@/scheduling/time';

/**
 * The history of her alerts without React (P4-01): several creators' pages read as one list, newest first, how a
 * moment reads, and what the filters offer. The server writes each line (`reason`); this only orders and says it.
 */

/** One alert to keep in the list: hers by its `groupId`, the system's by its code; absent, every alert. */
export type AlertChoice = CustomAlertGroupId | SystemAlertCode;

/** What a creator's pages hold once read: her triggers newest first, and where the next page starts. */
export interface CreatorTriggers {
  readonly creatorId: string;
  readonly items: readonly AlertTriggerItem[];
  readonly nextCursor: string | null;
}

/** The newest first, then by id: two triggers of the same millisecond keep one order from read to read. */
const newestFirst = (a: AlertTriggerItem, b: AlertTriggerItem): number =>
  b.at.localeCompare(a.at) || b.id.localeCompare(a.id);

/**
 * Every creator's triggers in one list, the newest first. A creator with more to read stops the list at her last
 * trigger read: past it, another creator's older trigger could come before one of hers not read yet, so it waits for
 * « Voir plus ».
 */
export function mergeTriggers(lists: readonly CreatorTriggers[]): {
  readonly items: AlertTriggerItem[];
  readonly hasMore: boolean;
} {
  const edges = lists.flatMap((list) => {
    const last = list.items.at(-1);
    return list.nextCursor === null || last === undefined ? [] : [last.at];
  });
  const edge = edges.toSorted().at(-1);
  const items = lists
    .flatMap((list) => list.items)
    .filter((item) => edge === undefined || item.at >= edge)
    .toSorted(newestFirst);
  return { items, hasMore: lists.some((list) => list.nextCursor !== null) };
}

/**
 * « Tout marquer comme vu »: for each creator with a line shown, the newest of hers, that one and all before it seen.
 * One come since stays unseen; the alert filter goes with it, so what the screen does not show is not marked.
 */
export function markAllTargets(
  items: readonly AlertTriggerItem[],
): readonly { readonly creatorId: CreatorId; readonly untilId: EventId }[] {
  const newest = new Map<CreatorId, EventId>();
  for (const item of items.toSorted(newestFirst)) {
    if (!newest.has(item.creatorId)) newest.set(item.creatorId, item.id);
  }
  return [...newest].map(([creatorId, untilId]) => ({ creatorId, untilId }));
}

/** « il y a 5 min » within the hour, then « aujourd’hui à 14 h 32 », « hier à 9 h », « mer. 21 oct. à 23 h 05 ». */
export function whenLine(at: string, now: Date, zone: string): string {
  if (now.getTime() - Date.parse(at) < 60 * 60_000) return lastMessageAgo(at, now) ?? '';
  const day = dayOf(at, zone);
  const today = dayOf(now, zone);
  const clock = clockAt(at, zone);
  if (day === today) return `aujourd’hui à ${clock}`;
  if (day === addDays(today, -1)) return `hier à ${clock}`;
  return `${dayMonth(day)} à ${clock}`;
}

/** The alerts the filter offers: the system's, then hers by name; an archived one stays while it has lines. */
export function alertChoices(
  known: readonly { readonly groupId: CustomAlertGroupId; readonly name: string }[],
): readonly { readonly value: AlertChoice; readonly label: string }[] {
  const custom = [...new Map(known.map((one) => [one.groupId, one.name])).entries()]
    .map(([value, label]) => ({ value, label }))
    .toSorted((a, b) => a.label.localeCompare(b.label, 'fr'));
  return [
    ...SYSTEM_ALERT_CODES.map((code) => ({ value: code, label: SYSTEM_ALERT_LABELS[code] })),
    ...custom,
  ];
}

/** A value of the alert `<select>` read back; anything else is every alert. */
export function choiceOf(value: string): AlertChoice | null {
  const system = SYSTEM_ALERT_CODES.find((code) => code === value);
  if (system !== undefined) return system;
  const group = CustomAlertGroupIdSchema.safeParse(value);
  return group.success ? group.data : null;
}

/** Her alerts named on the lines read, to keep them in the filter once it narrows the list. */
export const alertsOf = (
  items: readonly AlertTriggerItem[],
): readonly { readonly groupId: CustomAlertGroupId; readonly name: string }[] =>
  items.flatMap((item) =>
    item.alertGroupId === null ? [] : [{ groupId: item.alertGroupId, name: item.alertName }],
  );

/** « 3 alertes marquées comme vues », once « Tout marquer comme vu » answered. */
export const markedLine = (marked: number): string =>
  marked === 0
    ? 'Tout était déjà vu.'
    : marked === 1
      ? '1 alerte marquée comme vue.'
      : `${String(marked)} alertes marquées comme vues.`;
