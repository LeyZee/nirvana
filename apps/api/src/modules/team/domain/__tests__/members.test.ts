import { CreatorIdSchema, newId } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import {
  assertCreatorsExist,
  assertOwnerScope,
  assertReadsTeam,
  assertStartsFromToday,
  assertStillInTeam,
  assertTeamShareFits,
  calendarDayIn,
  leavesTeam,
  normalizeEmail,
  presetsInForce,
  rateInForce,
  uniqueCreatorIds,
} from '../members';

/** Invented values only (ADR 0010). */
describe('team rules', () => {
  it('reads the day in the agency’s time zone, not in UTC', () => {
    const lateEvening = new Date('2026-10-27T23:30:00Z');
    expect(calendarDayIn(lateEvening, 'Europe/Paris')).toBe('2026-10-28');
    expect(calendarDayIn(lateEvening, 'America/New_York')).toBe('2026-10-27');
  });

  it('keeps the e-mail the way Better Auth looks it up at sign-in', () => {
    expect(normalizeEmail(' Theo@Example.TEST ')).toBe('theo@example.test');
  });

  it('never starts a rate on a day already worked', () => {
    expect(() => {
      assertStartsFromToday('2026-10-26', '2026-10-27');
    }).toThrow(expect.objectContaining({ code: 'commission_date_invalid' }));
    expect(() => {
      assertStartsFromToday('2026-10-27', '2026-10-27');
    }).not.toThrow();
    expect(() => {
      assertStartsFromToday('2026-11-01', '2026-10-27');
    }).not.toThrow();
  });

  it('gives a share of the team’s net to a manager only', () => {
    expect(() => {
      assertTeamShareFits('chatter', 500);
    }).toThrow(expect.objectContaining({ code: 'team_share_invalid' }));
    expect(() => {
      assertTeamShareFits('chatter', null);
    }).not.toThrow();
    expect(() => {
      assertTeamShareFits('manager', 500);
    }).not.toThrow();
  });

  it('changes nothing of a member who left', () => {
    expect(() => {
      assertStillInTeam('left');
    }).toThrow(expect.objectContaining({ code: 'member_left_conflict' }));
    for (const status of ['active', 'on_leave', 'sick', 'travelling', 'suspended'] as const) {
      expect(() => {
        assertStillInTeam(status);
      }).not.toThrow();
    }
  });

  it('keeps the notes and the presets from a chatter, and from a manager who is not active', () => {
    expect(() => {
      assertReadsTeam('self');
    }).toThrow(expect.objectContaining({ code: 'role_forbidden' }));
    expect(() => {
      assertReadsTeam('agency');
    }).not.toThrow();
    expect(() => {
      assertReadsTeam('owner');
    }).not.toThrow();
  });

  it('lets the owner alone write members, rates and presets', () => {
    expect(() => {
      assertOwnerScope('agency');
    }).toThrow(expect.objectContaining({ code: 'role_forbidden' }));
    expect(() => {
      assertOwnerScope('self');
    }).toThrow(expect.objectContaining({ code: 'role_forbidden' }));
    expect(() => {
      assertOwnerScope('owner');
    }).not.toThrow();
  });

  it('takes the latest rate effective on the day, none before the first', () => {
    const rates = [
      { effectiveFrom: '2026-11-01', rateBps: 1300 },
      { effectiveFrom: '2026-10-01', rateBps: 1250 },
    ];
    expect(rateInForce(rates, '2026-09-30')).toBeNull();
    expect(rateInForce(rates, '2026-10-01')?.rateBps).toBe(1250);
    expect(rateInForce(rates, '2026-10-31')?.rateBps).toBe(1250);
    expect(rateInForce(rates, '2026-11-01')?.rateBps).toBe(1300);
  });

  it('offers each preset once, at its rate of the day, by name', () => {
    const presets = [
      { name: 'Palier B', effectiveFrom: '2026-10-01', rateBps: 1500 },
      { name: 'Palier A', effectiveFrom: '2026-10-01', rateBps: 1000 },
      { name: 'Palier A', effectiveFrom: '2026-11-01', rateBps: 1100 },
      { name: 'Palier C', effectiveFrom: '2026-12-01', rateBps: 2000 },
    ];
    expect(presetsInForce(presets, '2026-10-27')).toEqual([
      { name: 'Palier A', effectiveFrom: '2026-10-01', rateBps: 1000 },
      { name: 'Palier B', effectiveFrom: '2026-10-01', rateBps: 1500 },
    ]);
    expect(presetsInForce(presets, '2026-11-01').map((preset) => preset.rateBps)).toEqual([1100, 1500]);
  });

  it('names the creators that do not exist, and keeps each one once', () => {
    const [known, unknown] = [newId(CreatorIdSchema), newId(CreatorIdSchema)];
    expect(uniqueCreatorIds([known, known])).toEqual([known]);
    expect(() => {
      assertCreatorsExist([known], new Set([known]));
    }).not.toThrow();
    expect(() => {
      assertCreatorsExist([known, unknown], new Set([known]));
    }).toThrow(expect.objectContaining({ code: 'creator_not_found', details: { missing: [unknown] } }));
  });

  it('leaves the team once, on the way to left', () => {
    expect(leavesTeam('active', 'left')).toBe(true);
    expect(leavesTeam('suspended', 'left')).toBe(true);
    expect(leavesTeam('left', 'left')).toBe(false);
    expect(leavesTeam('active', 'on_leave')).toBe(false);
  });
});
