import { payPeriodLastDay, type ExchangeRate, type PayPeriod } from '@nirvana/contracts';

import { MissingExchangeRate } from './errors';
import { mulDivRound, RATE_SCALE } from './rounding';

/**
 * Pay's exchange rates (ADR 0033), their pure rules: the ECB's rate turned into pay's, and how old a rate a closing
 * may freeze. The job that reads the ECB lives in `application/exchange-rates.ts` and `infra/ecb.ts`.
 */

/** Where every rate pay writes comes from, as a statement copies it. */
export const ECB_SOURCE = 'BCE, taux de référence';

/** The longest normal gap between two ECB rates at a period's end: from the Thursday to Easter Monday. */
const RATE_MAX_AGE_DAYS = 4;

const DECIMAL = /^(\d{1,6})(?:\.(\d{1,8}))?$/;

/**
 * Euros for one unit of the currency, in millionths, from the ECB's units of the currency for one euro as it writes
 * them (`1.1188` → 893 815): computed on the decimal text, never on a float, rounded as all of pay.
 */
export function eurosPerUnitMicros(perEuro: string): number {
  const match = DECIMAL.exec(perEuro);
  if (match === null) throw new RangeError(`Not a decimal rate: ${perEuro}`);
  const [, whole = '', fraction = ''] = match;
  // At most 14 digits: a safe integer.
  const units = Number(whole + fraction);
  if (units === 0) throw new RangeError('A rate of zero');
  return mulDivRound(RATE_SCALE, 10 ** fraction.length, units);
}

/** Calendar days from `from` to `to`, two days of the agency's zone as written. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * A closing never freezes a rate more than `RATE_MAX_AGE_DAYS` before its period's last day: that is a stopped job,
 * not a weekend nor a holiday, and pay never guesses a rate (`exchange_rate_missing_conflict`).
 */
export function assertFreshRates(period: PayPeriod, rates: readonly ExchangeRate[]): void {
  const lastDay = payPeriodLastDay(period);
  for (const rate of rates) {
    if (daysBetween(rate.day, lastDay) > RATE_MAX_AGE_DAYS) throw new MissingExchangeRate(rate.currency);
  }
}
