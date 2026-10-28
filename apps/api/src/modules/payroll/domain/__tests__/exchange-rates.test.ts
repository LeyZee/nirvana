import { DomainError, PayPeriodSchema } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import { assertFreshRates, eurosPerUnitMicros } from '../exchange-rates';

import { USD } from './fixtures';

describe('the ECB’s rate in pay’s terms (ADR 0033)', () => {
  it('turns dollars for one euro into euros for one dollar, in millionths, on integers', () => {
    // Rates the ECB published, as it writes them.
    expect(eurosPerUnitMicros('1.1188')).toBe(893_815);
    expect(eurosPerUnitMicros('1.0850')).toBe(921_659);
    expect(eurosPerUnitMicros('1.1')).toBe(909_091);
    expect(eurosPerUnitMicros('1')).toBe(1_000_000);
    expect(eurosPerUnitMicros('0.5')).toBe(2_000_000);
    // 39 062.5 exactly: half away from zero, as every rounding of pay.
    expect(eurosPerUnitMicros('25.6')).toBe(39_063);
    expect(eurosPerUnitMicros('162.84')).toBe(6_141);
  });

  it('refuses a rate that is not a positive decimal written with a point', () => {
    for (const written of [
      '1,1188',
      '',
      ' 1.1',
      '1.',
      '.5',
      '-1.1',
      '0',
      '0.0000',
      '1.123456789',
      '1e3',
      'NaN',
    ]) {
      expect(() => eurosPerUnitMicros(written), written).toThrow(RangeError);
    }
  });
});

describe('the age of a rate a closing freezes (ADR 0033)', () => {
  const codeOf = (period: string, day: string): string => {
    try {
      assertFreshRates(PayPeriodSchema.parse(period), [{ ...USD, day }]);
    } catch (error) {
      return error instanceof DomainError ? error.code : 'not a domain error';
    }
    return 'fresh';
  };

  it('takes up to four calendar days before the period’s last day, never five', () => {
    // Easter Monday on the 31st: the Thursday's rate.
    expect(codeOf('2025-03-16', '2025-03-27')).toBe('fresh');
    expect(codeOf('2025-03-16', '2025-03-26')).toBe('exchange_rate_missing_conflict');
    // The 31st of December on a Sunday: the Friday's rate, and the days before it up to four.
    expect(codeOf('2023-12-16', '2023-12-29')).toBe('fresh');
    expect(codeOf('2023-12-16', '2023-12-27')).toBe('fresh');
    expect(codeOf('2023-12-16', '2023-12-26')).toBe('exchange_rate_missing_conflict');
    // The first half of a month ends on the 15th.
    expect(codeOf('2025-02-01', '2025-02-15')).toBe('fresh');
    expect(codeOf('2025-02-01', '2025-02-10')).toBe('exchange_rate_missing_conflict');
  });

  it('says which currency has no fresh rate, and lets a period without one close', () => {
    try {
      assertFreshRates(PayPeriodSchema.parse('2025-03-16'), [{ ...USD, day: '2025-03-01' }]);
      throw new Error('no error');
    } catch (error) {
      expect(error).toMatchObject({ code: 'exchange_rate_missing_conflict', details: { currency: 'USD' } });
    }
    expect(() => {
      assertFreshRates(PayPeriodSchema.parse('2025-03-16'), []);
    }).not.toThrow();
  });
});
