import { describe, expect, it } from 'vitest';

import { add, format, money, multiplyPercent } from './money';

describe('money', () => {
  it('builds integer amounts only', () => {
    expect(money(1250, 'EUR')).toEqual({ amountMinor: 1250, currency: 'EUR' });
    expect(() => money(12.5, 'EUR')).toThrow();
  });

  it('adds amounts of the same currency and refuses to mix currencies', () => {
    expect(add(money(500, 'EUR'), money(1250, 'EUR'))).toEqual(money(1750, 'EUR'));
    expect(() => add(money(500, 'EUR'), money(500, 'USD'))).toThrow(RangeError);
  });

  it('takes a percentage rounded half away from zero', () => {
    expect(multiplyPercent(money(1000, 'EUR'), 20)).toEqual(money(200, 'EUR'));
    expect(multiplyPercent(money(1250, 'EUR'), 5.5)).toEqual(money(69, 'EUR'));
    expect(multiplyPercent(money(-1250, 'EUR'), 5.5)).toEqual(money(-69, 'EUR'));
    expect(multiplyPercent(money(1, 'EUR'), 10)).toEqual(money(0, 'EUR'));
    expect(multiplyPercent(money(-1, 'EUR'), 10)).toEqual(money(0, 'EUR'));
  });

  it('formats without a locale', () => {
    expect(format(money(1250, 'EUR'))).toBe('12.50 EUR');
    expect(format(money(5, 'USD'))).toBe('0.05 USD');
    expect(format(money(-5, 'EUR'))).toBe('-0.05 EUR');
    expect(format(money(0, 'EUR'))).toBe('0.00 EUR');
  });
});
