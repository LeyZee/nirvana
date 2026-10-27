import {
  MyShiftSchema,
  MyShiftsSchema,
  PlanningSchema,
  ShiftSchema,
  ShiftSwapRequestSchema,
  ShiftTemplateSchema,
  type MyShift,
  type Shift,
  type ShiftSwapRequest,
} from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  accessOpen,
  accountLine,
  conflictLines,
  dayStateOf,
  gridOf,
  leaveAhead,
  leaveDaysLine,
  leaveLength,
  phaseOf,
  progressOf,
  swapRefusalText,
  swapViewOf,
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
        fill: null,
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
    expect(line?.what).toBe('Théo est en congé : ce shift est à pourvoir');
    expect(line?.shiftId).toBe(null);
    const fill = {
      accountId: NORA_REVEAL,
      day: '2026-10-27',
      startMinute: 1380,
      endMinute: 300,
      awayMemberId: THEO,
      awayName: 'Théo',
    };
    expect(line?.fill).toEqual(fill);
    // Read from Antananarivo, the line says its hours; the shift to fill keeps the agency's.
    const [far] = conflictLines(week.conflicts, [template], week, 'Indian/Antananarivo');
    expect(far?.when.replaceAll('\u00a0', ' ')).toBe('mer. 28 · 1 h – 7 h sur Nora Vidal');
    expect(far?.fill).toEqual(fill);
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

/** As read: no-break spaces (« 23 h ») as plain ones. */
const plain = (line: string): string => line.replaceAll('\u00a0', ' ');

describe('leaves', () => {
  it('says its days and how many, the last one included', () => {
    const one = { firstDay: '2026-11-04', lastDay: '2026-11-04' };
    const three = { firstDay: '2026-11-03', lastDay: '2026-11-05' };
    expect(plain(leaveDaysLine(one))).toBe('Le mer. 4 nov.');
    expect(leaveLength(one)).toBe('1 jour');
    expect(plain(leaveDaysLine(three))).toBe('Du mar. 3 nov. au jeu. 5 nov.');
    expect(leaveLength(three)).toBe('3 jours');
    // Over the change of hour (25/10), days stay whole.
    expect(leaveLength({ firstDay: '2026-10-24', lastDay: '2026-10-26' })).toBe('3 jours');
  });

  it('is ahead until its end', () => {
    const leave = { endsAt: '2026-11-05T21:00:00Z' };
    expect(leaveAhead(leave, new Date('2026-11-05T20:59:00Z'))).toBe(true);
    expect(leaveAhead(leave, new Date('2026-11-05T21:00:00Z'))).toBe(false);
  });
});

describe('swaps', () => {
  const names = {
    member: (memberId: string) => (memberId === THEO ? 'Théo' : memberId === BASILE ? 'Basile' : 'Quelqu’un'),
    creator: (creatorId: string) => (creatorId === NORA ? 'Nora Vidal' : undefined),
  };
  const swap = (patch: Partial<z.input<typeof ShiftSwapRequestSchema>> = {}): ShiftSwapRequest =>
    ShiftSwapRequestSchema.parse({
      id: id(61),
      requesterId: THEO,
      shiftId: id(101),
      creatorId: NORA,
      shiftStartsAt: '2026-10-29T22:00:00Z',
      shiftEndsAt: '2026-10-30T04:00:00Z',
      targetMemberId: BASILE,
      targetShiftId: null,
      targetCreatorId: null,
      targetShiftStartsAt: null,
      targetShiftEndsAt: null,
      message: null,
      status: 'proposed',
      resolvedAt: null,
      revertedAt: null,
      withdrawnByAgency: false,
      createdAt: '2026-10-27T10:00:00Z',
      ...patch,
    });
  const exchange = swap({
    targetShiftId: id(102),
    targetCreatorId: LEA,
    targetShiftStartsAt: '2026-10-31T11:00:00Z',
    targetShiftEndsAt: '2026-10-31T17:00:00Z',
  });
  const view = (one: ShiftSwapRequest, side: 'requester' | 'target' | 'agency') => {
    const seen = swapViewOf(one, side, names, PARIS);
    return {
      title: seen.title,
      lines: seen.lines.map(({ label, text }) => `${label} : ${plain(text)}`),
      status: `${seen.status.label} (${seen.status.tone})`,
    };
  };

  it('says a shift given in the words of each one who reads it', () => {
    const line = 'jeu. 29 oct. · 23 h – 5 h · Nora Vidal';
    expect(view(swap(), 'requester')).toEqual({
      title: 'Ton shift pour Basile',
      lines: [`Ton shift : ${line}`],
      status: 'En attente de Basile (away)',
    });
    expect(view(swap(), 'target')).toEqual({
      title: 'Théo te propose son shift',
      lines: [`Tu prendrais : ${line}`],
      status: 'À toi de répondre (away)',
    });
    expect(view(swap(), 'agency')).toEqual({
      title: 'Théo donne son shift à Basile',
      lines: [`Shift de Théo : ${line}`],
      status: 'En attente de Basile (away)',
    });
  });

  it('says both shifts of an exchange, without a creator it cannot name', () => {
    expect(view(exchange, 'requester').title).toBe('Échange avec Basile');
    expect(view(exchange, 'requester').lines).toEqual([
      'Ton shift : jeu. 29 oct. · 23 h – 5 h · Nora Vidal',
      'Celui de Basile : sam. 31 oct. · 12 h – 18 h',
    ]);
    expect(view(exchange, 'target').title).toBe('Théo te propose un échange');
    expect(view(exchange, 'target').lines[1]).toBe('Tu lui donnerais : sam. 31 oct. · 12 h – 18 h');
    expect(view(exchange, 'agency').title).toBe('Échange entre Théo et Basile');
  });

  it('says how it ended, a withdrawal by the agency never by whom', () => {
    const ended = (patch: Partial<z.input<typeof ShiftSwapRequestSchema>>) =>
      (['requester', 'target', 'agency'] as const).map((side) => view(swap(patch), side).status);
    const at = '2026-10-28T10:00:00Z';
    expect(ended({ status: 'accepted', resolvedAt: at })).toEqual([
      'Accepté par Basile (ok)',
      'Tu as accepté (ok)',
      'Accepté par Basile (ok)',
    ]);
    expect(ended({ status: 'declined', resolvedAt: at })).toEqual([
      'Refusé par Basile (gone)',
      'Tu as refusé (gone)',
      'Refusé par Basile (gone)',
    ]);
    expect(ended({ status: 'withdrawn', resolvedAt: at })).toEqual([
      'Tu l’as retiré (gone)',
      'Retiré par Théo (gone)',
      'Retiré par Théo (gone)',
    ]);
    expect(ended({ status: 'withdrawn', resolvedAt: at, withdrawnByAgency: true })).toEqual([
      'Retiré par l’agence (gone)',
      'Retiré par l’agence (gone)',
      'Retiré par l’agence (gone)',
    ]);
    expect(ended({ status: 'lapsed', resolvedAt: at })[1]).toBe('Tombé : il ne tenait plus (gone)');
    expect(ended({ status: 'reverted', resolvedAt: at, revertedAt: at })[1]).toBe(
      'Annulé par l’agence (gone)',
    );
  });

  it('words a refusal without the colleague’s shift or anyone else’s leave (ADR 0031)', () => {
    expect(swapRefusalText('shift_member_conflict', 'propose', 'Basile', null)).toBe(
      'Basile est déjà sur un autre shift à ces heures.',
    );
    expect(swapRefusalText('shift_member_conflict', 'propose', 'Basile', id(103))).toBe(
      'Le shift rendu tombe sur un autre de tes shifts.',
    );
    expect(swapRefusalText('shift_member_conflict', 'accept', 'Théo', null)).toBe(
      'Tu es déjà sur un autre shift à ces heures : l’échange ne peut pas se faire.',
    );
    expect(swapRefusalText('member_on_leave_conflict', 'accept', 'Théo', null)).toBe(
      'Un congé tombe sur ces heures : l’échange ne peut pas se faire.',
    );
    expect(swapRefusalText('member_on_leave_conflict', 'propose', 'Basile', null)).toBe(
      'Tu es en congé quand tombe le shift rendu.',
    );
    expect(swapRefusalText('member_left_conflict', 'propose', 'Basile', null)).toBe(
      'Basile ne peut plus recevoir de shift.',
    );
  });
});
