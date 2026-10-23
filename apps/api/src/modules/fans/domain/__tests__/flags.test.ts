import { describe, expect, it } from 'vitest';

import { withFlag, withoutFlag } from '../flags';

const frozen = { reason: 'money_trouble', since: '2026-10-02T10:00:00Z' } as const;

describe('withFlag', () => {
  it('adds a limit and keeps the others', () => {
    expect(withFlag({ fragile: true }, { flag: 'salesFrozen', value: frozen })).toEqual({
      fragile: true,
      salesFrozen: frozen,
    });
  });

  it('changes nothing when the limit already has this value', () => {
    expect(withFlag({ salesFrozen: frozen }, { flag: 'salesFrozen', value: { ...frozen } })).toBeNull();
    expect(withFlag({ spendingLimitMinor: 5000 }, { flag: 'spendingLimitMinor', value: 3000 })).toEqual({
      spendingLimitMinor: 3000,
    });
  });
});

describe('withoutFlag', () => {
  it('lifts one limit, or changes nothing when it was not set', () => {
    expect(withoutFlag({ fragile: true, noExplicit: true }, 'fragile')).toEqual({ noExplicit: true });
    expect(withoutFlag({ noExplicit: true }, 'fragile')).toBeNull();
  });
});
