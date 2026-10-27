import { describe, expect, it } from 'vitest';

import {
  addDays,
  clockAt,
  clockOf,
  dayOf,
  lengthOf,
  minuteOf,
  mondayOf,
  rangeAt,
  untilOf,
  weekdayOf,
  weekLabel,
  weekOf,
  zonedInstant,
} from './time';

const PARIS = 'Europe/Paris';
const PORTO_NOVO = 'Africa/Porto-Novo';

describe('wall-clock time', () => {
  it('reads an instant in the zone that shows it', () => {
    expect(dayOf('2026-10-28T23:30:00Z', PARIS)).toBe('2026-10-29');
    expect(minuteOf('2026-10-28T23:30:00Z', PARIS)).toBe(30);
    expect(clockAt('2026-10-28T23:00:00Z', PORTO_NOVO)).toBe('0 h');
    expect(rangeAt('2026-10-28T17:00:00Z', '2026-10-28T23:00:00Z', PARIS)).toBe('18 h – 0 h');
  });

  it('turns a day and an hour of a zone into its instant, the next day past midnight', () => {
    expect(zonedInstant('2026-10-28', 18 * 60, PARIS).toISOString()).toBe('2026-10-28T17:00:00.000Z');
    expect(zonedInstant('2026-10-28', 1440, PARIS).toISOString()).toBe('2026-10-28T23:00:00.000Z');
    expect(zonedInstant('2026-10-28', 23 * 60, PORTO_NOVO).toISOString()).toBe('2026-10-28T22:00:00.000Z');
  });

  it('takes the first of the two autumn hours, and the first instant after the spring gap', () => {
    // 25 October 2026: 02:30 happens twice in Paris, at +02:00 then at +01:00.
    expect(zonedInstant('2026-10-25', 150, PARIS).toISOString()).toBe('2026-10-25T00:30:00.000Z');
    // 29 March 2026: 02:30 does not exist in Paris; the clock goes from 02:00 to 03:00.
    expect(zonedInstant('2026-03-29', 150, PARIS).toISOString()).toBe('2026-03-29T01:00:00.000Z');
  });

  it('keeps a 6-hour night slot on its wall-clock hours when the clock changes: 7 h that night', () => {
    const start = zonedInstant('2026-10-25', 0, PARIS);
    const end = zonedInstant('2026-10-25', 360, PARIS);
    expect(lengthOf(end.getTime() - start.getTime())).toBe('7 h');
  });
});

describe('days and weeks', () => {
  it('walks the calendar and finds the week', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(weekdayOf('2026-11-01')).toBe(7);
    expect(mondayOf('2026-10-28')).toBe('2026-10-26');
    expect(weekOf('2026-10-26').at(-1)).toBe('2026-11-01');
    expect(weekLabel('2026-10-26')).toBe('26 oct. – 1 nov.');
  });
});

describe('words for time', () => {
  it('says hours the French way, and how long and how far', () => {
    expect(clockOf(23 * 60)).toBe('23 h');
    expect(clockOf(5 * 60 + 15)).toBe('5 h 15');
    expect(clockOf(1440)).toBe('0 h');
    expect(lengthOf(45 * 60_000)).toBe('45 min');
    expect(lengthOf(330 * 60_000)).toBe('5 h 30');
    expect(untilOf(12 * 60_000)).toBe('dans 12 min');
    expect(untilOf(3 * 86_400_000)).toBe('dans 3 jours');
  });
});
