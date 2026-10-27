import {
  MyShiftSchema,
  MyShiftsSchema,
  PlanningSchema,
  ShiftSchema,
  ShiftTemplateSchema,
  type MyShift,
  type Shift,
} from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  accessOpen,
  accountLine,
  conflictLines,
  dayStateOf,
  gridOf,
  phaseOf,
  progressOf,
  templateLine,
} from './model';
import { weekOf } from './time';

const PARIS = 'Europe/Paris';
const id = (n: number): string => `0199f2a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const NORA = id(1);
const LEA = id(2);
const NORA_REVEAL = id(11);
const LEA_REVEAL = id(12);
const THEO = id(21);
const BASILE = id(22);

const shift = (n: number, patch: Partial<z.input<typeof ShiftSchema>>): Shift =>
  ShiftSchema.parse({
    id: id(100 + n),
    creatorId: NORA,
    platformAccountId: NORA_REVEAL,
    memberId: THEO,
    startsAt: '2026-10-27T05:00:00Z',
    endsAt: '2026-10-27T11:00:00Z',
    templateId: null,
    stoppedAt: null,
    ...patch,
  });

const planning = (shifts: Shift[], conflicts: unknown[] = []) =>
  PlanningSchema.parse({
    settings: { timeZone: PARIS, slotStartMinute: 0, slotLengthMinutes: 360, accessMarginMinutes: 15 },
    accounts: [
      { id: NORA_REVEAL, creatorId: NORA, creatorName: 'Nora Vidal', platform: 'reveal', handle: 'nora' },
      { id: LEA_REVEAL, creatorId: LEA, creatorName: 'Léa', platform: 'reveal', handle: 'lea' },
    ],
    members: [
      { id: THEO, displayName: 'Théo', color: '#c2410c' },
      { id: BASILE, displayName: 'Basile', color: null },
    ],
    shifts,
    conflicts,
  });

describe('the week grid', () => {
  const week = weekOf('2026-10-26');

  it('puts each account on a row, by creator, and each shift on the day it starts in the zone shown', () => {
    const night = shift(1, { startsAt: '2026-10-27T22:00:00Z', endsAt: '2026-10-28T04:00:00Z' });
    const rows = gridOf(planning([night]), week, PARIS);
    expect(rows.map((row) => row.account.creatorName)).toEqual(['Léa', 'Nora Vidal']);
    const nora = rows[1];
    // 22:00 UTC is 23 h in Paris: the night starts on Tuesday 27 and ends on Wednesday.
    expect(nora?.days.get('2026-10-28')).toEqual([]);
    expect(nora?.days.get('2026-10-27')?.[0]).toMatchObject({ continued: false, overnight: true });
    expect(nora?.days.get('2026-10-27')?.[0]?.member?.displayName).toBe('Théo');
  });

  it('keeps 18 h – 0 h on one day, and shows Sunday night on Monday morning as continued', () => {
    const evening = shift(1, { startsAt: '2026-10-27T17:00:00Z', endsAt: '2026-10-27T23:00:00Z' });
    const sunday = shift(2, { startsAt: '2026-10-25T22:00:00Z', endsAt: '2026-10-26T04:00:00Z' });
    const nora = gridOf(planning([evening, sunday]), week, PARIS)[1];
    expect(nora?.days.get('2026-10-27')?.[0]?.overnight).toBe(false);
    expect(nora?.days.get('2026-10-26')?.[0]).toMatchObject({ continued: true, overnight: false });
  });
});

describe('a shift in time', () => {
  const one = shift(1, {});
  it('is to come, under way or over, and says how far it has gone', () => {
    expect(phaseOf(one, new Date('2026-10-27T04:59:00Z'))).toBe('later');
    expect(phaseOf(one, new Date('2026-10-27T05:00:00Z'))).toBe('live');
    expect(phaseOf(one, new Date('2026-10-27T11:00:00Z'))).toBe('past');
    expect(progressOf(one, new Date('2026-10-27T08:00:00Z'))).toBe(0.5);
  });

  it('names an account and a template the way the screens say them', () => {
    expect(accountLine({ platform: 'reveal', handle: 'nora' })).toBe('@nora sur Reveal');
    expect(templateLine({ weekday: 2, startMinute: 1380, endMinute: 300 })).toBe('Chaque mardi, 23 h – 5 h');
  });
});

describe('conflicts', () => {
  const template = ShiftTemplateSchema.parse({
    id: id(31),
    creatorId: NORA,
    platformAccountId: NORA_REVEAL,
    memberId: THEO,
    weekday: 3,
    startMinute: 1380,
    endMinute: 300,
    validFrom: '2026-10-26',
    validUntil: null,
  });

  it('says when, where and who is in the way', () => {
    const week = planning(
      [],
      [
        {
          templateId: id(31),
          startsAt: '2026-10-27T22:00:00Z',
          endsAt: '2026-10-28T04:00:00Z',
          reason: 'member_busy',
          shiftId: id(101),
        },
      ],
    );
    const lines = conflictLines(week.conflicts, [template], week, PARIS);
    expect(lines).toEqual([
      {
        key: `${id(31)}-2026-10-27T22:00:00Z`,
        when: 'mar. 27 · 23 h – 5 h sur Nora Vidal',
        what: 'Théo est déjà sur un autre shift',
        shiftId: id(101),
      },
    ]);
  });

  it('says a member on leave, with no shift to open (ADR 0031)', () => {
    const week = planning(
      [],
      [
        {
          templateId: id(31),
          startsAt: '2026-10-27T22:00:00Z',
          endsAt: '2026-10-28T04:00:00Z',
          reason: 'member_on_leave',
          leaveRequestId: id(41),
        },
      ],
    );
    const [line] = conflictLines(week.conflicts, [template], week, PARIS);
    expect(line?.what).toBe('Théo est en congé');
    expect(line?.shiftId).toBe(null);
  });
});

describe('the member’s day', () => {
  const mine = (patch: Partial<z.input<typeof MyShiftSchema>>): MyShift =>
    MyShiftSchema.parse({
      ...shift(1, {}),
      creatorName: 'Nora Vidal',
      platform: 'reveal',
      handle: 'nora',
      accessStartsAt: '2026-10-27T04:45:00Z',
      accessEndsAt: '2026-10-27T11:15:00Z',
      ...patch,
    });
  const shifts = (patch: Partial<{ current: MyShift; next: MyShift; ended: MyShift }>) =>
    MyShiftsSchema.parse({ current: null, next: null, ended: null, ...patch });

  it('is on shift first, then the end margin, then the start margin, then later, then nothing', () => {
    const now = new Date('2026-10-27T04:50:00Z');
    expect(dayStateOf(shifts({ current: mine({}), ended: mine({}) }), now).kind).toBe('on');
    expect(dayStateOf(shifts({ ended: mine({}), next: mine({}) }), now).kind).toBe('ended');
    expect(dayStateOf(shifts({ next: mine({}) }), now).kind).toBe('soon');
    expect(dayStateOf(shifts({ next: mine({}) }), new Date('2026-10-27T04:00:00Z')).kind).toBe('later');
    expect(dayStateOf(shifts({}), now).kind).toBe('none');
  });

  it('keeps the creators open in the margins only, as the server does', () => {
    expect(accessOpen(shifts({ ended: mine({}) }), new Date('2026-10-27T11:05:00Z'))).toBe(true);
    expect(accessOpen(shifts({ next: mine({}) }), new Date('2026-10-27T04:00:00Z'))).toBe(false);
    expect(accessOpen(shifts({}), new Date('2026-10-27T04:00:00Z'))).toBe(false);
  });
});
