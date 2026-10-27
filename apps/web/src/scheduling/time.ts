/**
 * Instants and wall-clock time for the planning (EQ-02, ADR 0011). The server speaks in UTC instants; a screen shows
 * them in the zone it chooses (the agency's grid, the reader's), and turns a day and an hour of that zone back into
 * an instant. The browser knows every zone: no table to keep.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
export const MINUTES_PER_DAY = 1440;

const PARTS = new Map<string, Intl.DateTimeFormat>();

function partsFormat(timeZone: string): Intl.DateTimeFormat {
  let format = PARTS.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    PARTS.set(timeZone, format);
  }
  return format;
}

interface Wall {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function wallOf(instant: number, timeZone: string): Wall {
  const found: Record<string, number> = {};
  for (const part of partsFormat(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') found[part.type] = Number(part.value);
  }
  return {
    year: found['year'] ?? 1970,
    month: found['month'] ?? 1,
    day: found['day'] ?? 1,
    hour: found['hour'] ?? 0,
    minute: found['minute'] ?? 0,
    second: found['second'] ?? 0,
  };
}

/** How far ahead of UTC the zone's clock is at this instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const wall = wallOf(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - (instant - (((instant % 1000) + 1000) % 1000));
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** The calendar day of an instant in a zone, `YYYY-MM-DD`. */
export function dayOf(instant: Date | string, timeZone: string): string {
  const wall = wallOf(new Date(instant).getTime(), timeZone);
  return `${String(wall.year)}-${pad(wall.month)}-${pad(wall.day)}`;
}

/** The minute of the day of an instant in a zone, 0 to 1439. */
export function minuteOf(instant: Date | string, timeZone: string): number {
  const wall = wallOf(new Date(instant).getTime(), timeZone);
  return wall.hour * 60 + wall.minute;
}

function utcMidnight(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1);
}

/**
 * The instant at which a zone's clock reads `minute` on `day` (`minute` may reach 1440 and beyond: the next day). An
 * hour that happens twice, in the autumn, is the first of the two; an hour that does not exist, in the spring gap,
 * becomes the first instant after the gap. The same rules as the server's (contract of `/v1/scheduling`).
 */
export function zonedInstant(day: string, minute: number, timeZone: string): Date {
  const wall = utcMidnight(day) + minute * MINUTE_MS;
  const offsets = new Set([offsetAt(wall - DAY_MS / 2, timeZone), offsetAt(wall + DAY_MS / 2, timeZone)]);
  const valid = [...offsets]
    .map((offset) => wall - offset)
    .filter((instant) => wall - offsetAt(instant, timeZone) === instant);
  if (valid.length > 0) return new Date(Math.min(...valid));
  // In the gap: the clock jumps over this hour. The first instant after it is where the offset changes.
  const ordered = [...offsets].map((offset) => wall - offset).sort((a, b) => a - b);
  let low = ordered[0] ?? wall;
  let high = ordered.at(-1) ?? wall;
  const after = offsetAt(high, timeZone);
  while (high - low > MINUTE_MS) {
    const middle = Math.floor((low + high) / 2 / MINUTE_MS) * MINUTE_MS;
    if (middle <= low) break;
    if (offsetAt(middle, timeZone) === after) high = middle;
    else low = middle;
  }
  return new Date(high);
}

/** The day `count` days after `day` (before, when negative). */
export function addDays(day: string, count: number): string {
  return new Date(utcMidnight(day) + count * DAY_MS).toISOString().slice(0, 10);
}

/** ISO weekday of a calendar day: 1 Monday … 7 Sunday. */
export function weekdayOf(day: string): number {
  const weekday = new Date(utcMidnight(day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** The Monday of the week that holds `day`. */
export const mondayOf = (day: string): string => addDays(day, 1 - weekdayOf(day));

/** The seven days of the week that starts on `monday`. */
export const weekOf = (monday: string): string[] =>
  Array.from({ length: 7 }, (_, index) => addDays(monday, index));

/** No-break spaces: « 1 h 17 » never splits across two lines. */
const NBSP = '\u00a0';

/** « 23 h », « 23 h 30 »: the French way, short enough for a grid. */
export function clockOf(minute: number): string {
  const inDay = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(inDay / 60);
  const minutes = inDay % 60;
  return minutes === 0 ? `${String(hours)}${NBSP}h` : `${String(hours)}${NBSP}h${NBSP}${pad(minutes)}`;
}

/** An instant's clock in a zone: « 23 h », « 5 h 15 ». */
export const clockAt = (instant: Date | string, timeZone: string): string =>
  clockOf(minuteOf(instant, timeZone));

/** « 23 h – 5 h », a range of two instants read in a zone. */
export const rangeAt = (from: Date | string, to: Date | string, timeZone: string): string =>
  `${clockAt(from, timeZone)} – ${clockAt(to, timeZone)}`;

/** « 6 h », « 5 h 30 », « 45 min »: how long something lasts. */
export function lengthOf(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / MINUTE_MS));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${String(minutes)}${NBSP}min`;
  return minutes === 0 ? `${String(hours)}${NBSP}h` : `${String(hours)}${NBSP}h${NBSP}${pad(minutes)}`;
}

/** « dans 12 min », « dans 3 h 05 », « dans 2 jours »: how far ahead an instant is. */
export function untilOf(milliseconds: number): string {
  if (milliseconds < DAY_MS) return `dans ${lengthOf(Math.max(milliseconds, MINUTE_MS))}`;
  const days = Math.round(milliseconds / DAY_MS);
  return days === 1 ? 'dans 1 jour' : `dans ${String(days)} jours`;
}

const SHORT_DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const LONG_DAY = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const MONTH_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** « mar. 28 ». */
export const shortDay = (day: string): string => SHORT_DAY.format(utcMidnight(day));

/** « mardi 28 octobre ». */
export const longDay = (day: string): string => LONG_DAY.format(utcMidnight(day));

/** « 26 oct. – 1 nov. », the week that starts on `monday`. */
export const weekLabel = (monday: string): string =>
  `${MONTH_DAY.format(utcMidnight(monday))} – ${MONTH_DAY.format(utcMidnight(addDays(monday, 6)))}`;

/** The zone the browser reads in: the reader's own time. */
export const readerZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** « Paris », « Porto-Novo »: a zone named by its city. */
export const cityOf = (timeZone: string): string =>
  (timeZone.split('/').at(-1) ?? timeZone).replaceAll('_', ' ');

/** « 23:30 » from a time field into minutes of the day; null when it is not a time. */
export function minuteOfInput(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(text.trim());
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** Minutes of the day into a time field's « 23:30 ». */
export const inputOf = (minute: number): string =>
  `${pad(Math.floor((minute % MINUTES_PER_DAY) / 60))}:${pad(minute % 60)}`;

/** The minute this instant falls in: the server takes instants on the minute only. */
export const onTheMinute = (instant: Date): Date =>
  new Date(Math.floor(instant.getTime() / MINUTE_MS) * MINUTE_MS);
