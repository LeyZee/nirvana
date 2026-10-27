import { describe, expect, it } from 'vitest';

import {
  requestedChange,
  withAgeDisputed,
  withDeclaredAge,
  withFlag,
  withFlagIfUnset,
  withHumanConfirmation,
  withoutFlag,
} from '../flags';

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

  it('keeps the first confirmation date, and the start of a freeze for the same reason', () => {
    const confirmed = { ageConfirmedAt: '2026-10-01T09:00:00Z' };
    expect(withFlag(confirmed, { flag: 'ageConfirmedAt', value: '2026-10-20T09:00:00Z' })).toBeNull();
    const later = { reason: 'money_trouble', since: '2026-10-20T09:00:00Z' } as const;
    expect(withFlag({ salesFrozen: frozen }, { flag: 'salesFrozen', value: later })).toBeNull();
    const other = { reason: 'distress', since: '2026-10-20T09:00:00Z' } as const;
    expect(withFlag({ salesFrozen: frozen }, { flag: 'salesFrozen', value: other })).toEqual({
      salesFrozen: other,
    });
  });
});

describe('requestedChange', () => {
  const now = new Date('2026-10-23T12:00:00Z');

  it('dates a confirmation and a freeze with the server clock', () => {
    expect(requestedChange({ flag: 'ageConfirmedAt', set: true }, now)).toEqual({
      flag: 'ageConfirmedAt',
      value: '2026-10-23T12:00:00.000Z',
    });
    expect(requestedChange({ flag: 'salesFrozen', set: true, freezeReason: 'operator' }, now)).toEqual({
      flag: 'salesFrozen',
      value: { reason: 'operator', since: '2026-10-23T12:00:00.000Z' },
    });
  });

  it('takes the ceiling as asked and turns the switches on', () => {
    expect(requestedChange({ flag: 'spendingLimitMinor', set: true, limitMinor: 2500 }, now)).toEqual({
      flag: 'spendingLimitMinor',
      value: 2500,
    });
    expect(requestedChange({ flag: 'doNotContact', set: true }, now)).toEqual({
      flag: 'doNotContact',
      value: true,
    });
  });
});

describe('withoutFlag', () => {
  it('lifts one limit, or changes nothing when it was not set', () => {
    expect(withoutFlag({ fragile: true, noExplicit: true }, 'fragile')).toEqual({ noExplicit: true });
    expect(withoutFlag({ noExplicit: true }, 'fragile')).toBeNull();
  });
});

describe('withFlagIfUnset', () => {
  const money = { reason: 'money_trouble', since: '2026-10-17T20:00:00.000Z' } as const;

  it('sets a limit nobody set yet', () => {
    expect(withFlagIfUnset({}, { flag: 'salesFrozen', value: money })).toEqual({ salesFrozen: money });
  });

  it('keeps a freeze a human set, whatever its reason', () => {
    const operator = { salesFrozen: { reason: 'operator', since: '2026-10-10T09:00:00.000Z' } } as const;
    expect(withFlagIfUnset(operator, { flag: 'salesFrozen', value: money })).toBeNull();
  });
});

describe('his age taken back, and confirmed again', () => {
  const NOW = new Date('2026-10-17T20:00:00.000Z');
  const confirmed = { ageConfirmedAt: '2026-10-01T09:00:00.000Z', fragile: true } as const;

  it('takes back a confirmation and disputes it, even when nothing was confirmed yet', () => {
    expect(withAgeDisputed(confirmed, 'policy', NOW)).toEqual({
      fragile: true,
      ageDisputed: { since: NOW.toISOString(), by: 'policy' },
    });
    expect(withAgeDisputed({}, 'human', NOW)).toEqual({
      ageDisputed: { since: NOW.toISOString(), by: 'human' },
    });
    expect(
      withAgeDisputed({ ageDisputed: { since: '2026-10-02T09:00:00.000Z', by: 'human' } }, 'policy', NOW),
    ).toBeNull();
  });

  it('confirms his own statement only where nothing was confirmed and nothing taken back', () => {
    expect(withDeclaredAge({}, NOW)).toEqual({ ageConfirmedAt: NOW.toISOString() });
    expect(withDeclaredAge(confirmed, NOW)).toBeNull();
    expect(withDeclaredAge({ ageDisputed: { since: NOW.toISOString(), by: 'policy' } }, NOW)).toBeNull();
  });

  it('lets a human confirm a disputed age, which settles the dispute', () => {
    const change = { flag: 'ageConfirmedAt', value: NOW.toISOString() } as const;
    expect(
      withHumanConfirmation({ ageDisputed: { since: NOW.toISOString(), by: 'policy' } }, change),
    ).toEqual({
      ageConfirmedAt: NOW.toISOString(),
    });
    expect(withHumanConfirmation({}, change)).toEqual({ ageConfirmedAt: NOW.toISOString() });
  });
});
