import { describe, expect, it } from 'vitest';

import { backupDay, backupState, needsAlert } from '../status';

const now = new Date('2026-10-27T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

describe('the 26-hour rule (ADR 0028 § 5)', () => {
  it('is ok up to 26 hours after the last success, overdue past it, never without one', () => {
    expect(backupState(hoursAgo(9), now)).toBe('ok');
    expect(backupState(hoursAgo(26), now)).toBe('ok');
    expect(backupState(hoursAgo(26.01), now)).toBe('overdue');
    expect(backupState(null, now)).toBe('never');
  });

  it('alerts when overdue, and for never only where exports are expected', () => {
    expect(needsAlert('ok', true)).toBe(false);
    expect(needsAlert('overdue', false)).toBe(true);
    expect(needsAlert('never', true)).toBe(true);
    expect(needsAlert('never', false)).toBe(false);
  });

  it('counts the day in Paris, summer time and winter time', () => {
    expect(backupDay(new Date('2026-10-26T22:30:00Z'))).toBe('2026-10-26');
    expect(backupDay(new Date('2026-10-26T23:30:00Z'))).toBe('2026-10-27');
    expect(backupDay(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
  });
});
