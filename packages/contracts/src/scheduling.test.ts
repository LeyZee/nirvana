import { describe, expect, it } from 'vitest';

import {
  CreateShiftBodySchema,
  CreateShiftTemplateBodySchema,
  MyShiftsSchema,
  PlanningSchema,
  SCHEDULING_ERROR_CODES,
  SchedulingSettingsSchema,
  SHIFT_TEMPLATE_MAX_MINUTES,
  shiftSlotsOf,
  templateLengthMinutes,
  UpdateShiftBodySchema,
} from './scheduling';

const CREATOR = '0199f2a0-0000-7000-8000-0000000000c1';
const ACCOUNT = '0199f2a0-0000-7000-8000-0000000000a1';
const MEMBER = '0199f2a0-0000-7000-8000-0000000000e1';

const shift = {
  id: '0199f2a0-0000-7000-8000-0000000000f1',
  creatorId: CREATOR,
  platformAccountId: ACCOUNT,
  memberId: MEMBER,
  startsAt: '2026-10-28T23:00:00Z',
  endsAt: '2026-10-29T05:00:00Z',
  templateId: null,
};

const settings = {
  timeZone: 'Europe/Paris',
  slotStartMinute: 0,
  slotLengthMinutes: 360,
  accessMarginMinutes: 15,
};

describe('planning settings', () => {
  it('tiles the day with Imperium’s four 6-hour slots by default', () => {
    expect(shiftSlotsOf(SchedulingSettingsSchema.parse(settings))).toEqual([
      { startMinute: 0, endMinute: 360 },
      { startMinute: 360, endMinute: 720 },
      { startMinute: 720, endMinute: 1080 },
      { startMinute: 1080, endMinute: 0 },
    ]);
  });

  it('lets the last slot run past midnight when the day starts later', () => {
    const slots = shiftSlotsOf({ slotStartMinute: 120, slotLengthMinutes: 360 });
    expect(slots.at(0)).toEqual({ startMinute: 120, endMinute: 480 });
    expect(slots.at(-1)).toEqual({ startMinute: 1200, endMinute: 120 });
  });

  it('refuses a length that does not divide the day, and a first slot that starts after its own end', () => {
    expect(SchedulingSettingsSchema.safeParse({ ...settings, slotLengthMinutes: 300 }).success).toBe(false);
    expect(SchedulingSettingsSchema.safeParse({ ...settings, slotStartMinute: 360 }).success).toBe(false);
    expect(SchedulingSettingsSchema.safeParse({ ...settings, slotStartMinute: 359 }).success).toBe(true);
  });

  it('keeps the chatter’s margin short: two hours at most (ADR 0025)', () => {
    expect(SchedulingSettingsSchema.safeParse({ ...settings, accessMarginMinutes: 121 }).success).toBe(false);
    expect(SchedulingSettingsSchema.safeParse({ ...settings, accessMarginMinutes: 0 }).success).toBe(true);
  });

  it('refuses an unknown zone for the grid', () => {
    expect(SchedulingSettingsSchema.safeParse({ ...settings, timeZone: 'Mars/Olympus' }).success).toBe(false);
  });
});

describe('shifts and templates', () => {
  it('takes a shift as two UTC instants, never a wall-clock time', () => {
    const body = {
      creatorId: CREATOR,
      platformAccountId: ACCOUNT,
      memberId: MEMBER,
      startsAt: '2026-10-28T23:00:00Z',
      endsAt: '2026-10-29T05:00:00Z',
    };
    expect(CreateShiftBodySchema.safeParse(body).success).toBe(true);
    expect(CreateShiftBodySchema.safeParse({ ...body, startsAt: '2026-10-29 00:00' }).success).toBe(false);
  });

  it('changes a shift only when something changes', () => {
    expect(UpdateShiftBodySchema.safeParse({}).success).toBe(false);
    expect(UpdateShiftBodySchema.safeParse({ endsAt: '2026-10-29T03:00:00Z' }).success).toBe(true);
  });

  it('takes a night template that ends the next day, never one that ends when it starts', () => {
    const template = {
      creatorId: CREATOR,
      platformAccountId: ACCOUNT,
      memberId: MEMBER,
      weekday: 7,
      startMinute: 1080,
      endMinute: 0,
      validFrom: '2026-11-02',
    };
    expect(CreateShiftTemplateBodySchema.safeParse(template).success).toBe(true);
    expect(CreateShiftTemplateBodySchema.safeParse({ ...template, endMinute: 1080 }).success).toBe(false);
    expect(CreateShiftTemplateBodySchema.safeParse({ ...template, weekday: 0 }).success).toBe(false);
  });

  it('keeps a template an hour short of a day, so the autumn change of time never stretches it past one', () => {
    const template = {
      creatorId: CREATOR,
      platformAccountId: ACCOUNT,
      memberId: MEMBER,
      weekday: 6,
      startMinute: 60,
      endMinute: 0,
      validFrom: '2026-11-02',
    };
    expect(templateLengthMinutes(template)).toBe(1380);
    expect(templateLengthMinutes({ startMinute: 1080, endMinute: 0 })).toBe(360);
    expect(SHIFT_TEMPLATE_MAX_MINUTES).toBe(1380);
    expect(CreateShiftTemplateBodySchema.safeParse(template).success).toBe(true);
    expect(CreateShiftTemplateBodySchema.safeParse({ ...template, startMinute: 59 }).success).toBe(false);
  });

  it('reads an empty planning', () => {
    const empty = { settings, accounts: [], members: [], shifts: [], conflicts: [] };
    expect(PlanningSchema.parse(empty).shifts).toEqual([]);
  });

  it('gives a chatter their own shifts, the accounts those are on, themselves alone and no conflict', () => {
    const chatterPlanning = {
      settings,
      accounts: [
        { id: ACCOUNT, creatorId: CREATOR, creatorName: 'Nora Vidal', platform: 'reveal', handle: 'nora' },
      ],
      members: [{ id: MEMBER, displayName: 'Théo', color: '#c2410c' }],
      shifts: [{ ...shift, stoppedAt: null }],
      conflicts: [],
    };
    const planning = PlanningSchema.parse(chatterPlanning);
    expect(planning.members.map((member) => member.id)).toEqual([MEMBER]);
    expect(planning.shifts.every((one) => one.memberId === MEMBER)).toBe(true);
  });

  it('tells Aujourd’hui which account to open and when the creators open and close', () => {
    const mine = {
      ...shift,
      stoppedAt: null,
      creatorName: 'Nora Vidal',
      platform: 'reveal',
      handle: 'nora',
      accessStartsAt: '2026-10-28T22:45:00Z',
      accessEndsAt: '2026-10-29T05:15:00Z',
    };
    expect(MyShiftsSchema.parse({ current: null, next: mine }).next?.handle).toBe('nora');
    expect(MyShiftsSchema.safeParse({ current: null, next: { ...mine, platform: undefined } }).success).toBe(
      false,
    );
    expect(MyShiftsSchema.parse({ current: null, next: null })).toEqual({ current: null, next: null });
  });

  it('gives every error code a suffix that sets its status (api.md)', () => {
    for (const code of SCHEDULING_ERROR_CODES) expect(code).toMatch(/_(not_found|invalid|conflict)$/u);
  });
});
