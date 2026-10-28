import { describe, expect, it } from 'vitest';

import {
  nextPayPeriod,
  PayPeriodSchema,
  payPeriodLastDay,
  payPeriodOfDay,
  previousPayPeriod,
} from './pay-periods';

const period = (day: string) => PayPeriodSchema.parse(day);

describe('pay periods (ADR 0023)', () => {
  it('names a fortnight by its first day, the 1st or the 16th', () => {
    expect(PayPeriodSchema.safeParse('2026-10-01').success).toBe(true);
    expect(PayPeriodSchema.safeParse('2026-10-16').success).toBe(true);
    for (const day of ['2026-10-02', '2026-10-15', '2026-13-01', '2026-02-30', 'octobre']) {
      expect(PayPeriodSchema.safeParse(day).success).toBe(false);
    }
  });

  it('puts the 15th in the first fortnight and the 16th in the second', () => {
    expect(payPeriodOfDay('2026-10-01')).toBe('2026-10-01');
    expect(payPeriodOfDay('2026-10-15')).toBe('2026-10-01');
    expect(payPeriodOfDay('2026-10-16')).toBe('2026-10-16');
    expect(payPeriodOfDay('2026-10-31')).toBe('2026-10-16');
  });

  it('ends a second fortnight on the last day of its month', () => {
    expect(payPeriodLastDay(period('2026-10-01'))).toBe('2026-10-15');
    expect(payPeriodLastDay(period('2026-10-16'))).toBe('2026-10-31');
    expect(payPeriodLastDay(period('2026-11-16'))).toBe('2026-11-30');
    expect(payPeriodLastDay(period('2026-02-16'))).toBe('2026-02-28');
    expect(payPeriodLastDay(period('2028-02-16'))).toBe('2028-02-29');
  });

  it('steps from one period to the next and back, across the year', () => {
    expect(nextPayPeriod(period('2026-10-01'))).toBe('2026-10-16');
    expect(nextPayPeriod(period('2026-10-16'))).toBe('2026-11-01');
    expect(nextPayPeriod(period('2026-12-16'))).toBe('2027-01-01');
    expect(previousPayPeriod(period('2027-01-01'))).toBe('2026-12-16');
    expect(previousPayPeriod(period('2026-11-01'))).toBe('2026-10-16');
    expect(previousPayPeriod(period('2026-10-16'))).toBe('2026-10-01');
  });

  it('sorts like the periods', () => {
    const periods = ['2026-10-16', '2025-12-16', '2026-01-01', '2026-10-01'].map(period);
    expect([...periods].sort()).toEqual(['2025-12-16', '2026-01-01', '2026-10-01', '2026-10-16']);
  });
});
