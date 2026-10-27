import { describe, expect, it } from 'vitest';

import { followUpDecision, type FollowUpMoment } from '../follow-up';

// Paris is UTC+1 after the last Sunday of October: 14:00 UTC is 15:00 her time.
const AFTERNOON = new Date('2026-10-27T14:00:00.000Z');
const base: FollowUpMoment = { step: 0, steps: 2, flags: {}, now: AFTERNOON, timeZone: 'Europe/Paris' };

describe('followUpDecision', () => {
  it('writes a follow-up in her day, whatever his sales limits', () => {
    expect(followUpDecision(base)).toEqual({ kind: 'write' });
    expect(
      followUpDecision({
        ...base,
        step: 1,
        flags: { salesFrozen: { reason: 'money_trouble', since: '2026-10-20T10:00:00.000Z' }, fragile: true },
      }),
    ).toEqual({ kind: 'write' });
  });

  it('never writes to a fan nobody may write to, nor to one in distress', () => {
    expect(followUpDecision({ ...base, flags: { doNotContact: true } })).toEqual({
      kind: 'skip',
      reason: 'follow_up_do_not_contact',
    });
    expect(
      followUpDecision({
        ...base,
        flags: { salesFrozen: { reason: 'distress', since: '2026-10-20T10:00:00.000Z' } },
      }),
    ).toEqual({ kind: 'skip', reason: 'follow_up_distress' });
  });

  it('stops past her last delay', () => {
    expect(followUpDecision({ ...base, step: 2 })).toEqual({ kind: 'skip', reason: 'follow_up_plan_over' });
    expect(followUpDecision({ ...base, steps: 0 })).toEqual({ kind: 'skip', reason: 'follow_up_plan_over' });
  });

  it('puts it off to 9:00 her time in her quiet hours', () => {
    // 00:30 and 23:10 in Paris, then 08:59: the next 9:00 is 08:00 UTC.
    for (const now of ['2026-10-27T23:30:00.000Z', '2026-10-27T22:10:00.000Z', '2026-10-28T07:59:00.000Z']) {
      expect(followUpDecision({ ...base, now: new Date(now) })).toEqual({
        kind: 'later',
        reason: 'follow_up_quiet_hours',
        at: new Date('2026-10-28T08:00:00.000Z'),
      });
    }
    expect(followUpDecision({ ...base, now: new Date('2026-10-28T08:00:00.000Z') })).toEqual({
      kind: 'write',
    });
  });
});
