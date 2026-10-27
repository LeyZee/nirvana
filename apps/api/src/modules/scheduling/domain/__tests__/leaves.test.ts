import { describe, expect, it } from 'vitest';

import { leaveCover } from '../leaves';

const at = (value: string): Date => new Date(value);

describe('what a leave covers (ADR 0031)', () => {
  const days = { startsAt: at('2026-12-23T23:00:00Z'), endsAt: at('2026-12-26T23:00:00Z') };

  it('covers its days once approved, and nothing while pending, refused or withdrawn', () => {
    expect(leaveCover({ ...days, status: 'approved', cancelledAt: null })).toEqual(days);
    for (const status of ['pending', 'refused'] as const) {
      expect(leaveCover({ ...days, status, cancelledAt: null })).toBeNull();
    }
    expect(leaveCover({ ...days, status: 'withdrawn', cancelledAt: at('2026-12-20T10:00:00Z') })).toBeNull();
  });

  it('covers the days already taken when cancelled under way, and nothing when cancelled before', () => {
    expect(leaveCover({ ...days, status: 'cancelled', cancelledAt: at('2026-12-25T08:00:00Z') })).toEqual({
      startsAt: days.startsAt,
      endsAt: at('2026-12-25T08:00:00Z'),
    });
    expect(leaveCover({ ...days, status: 'cancelled', cancelledAt: at('2026-12-20T08:00:00Z') })).toBeNull();
    expect(leaveCover({ ...days, status: 'cancelled', cancelledAt: days.startsAt })).toBeNull();
  });
});
