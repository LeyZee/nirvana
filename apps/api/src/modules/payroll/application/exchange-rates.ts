import { ExchangeRateSchema } from '@nirvana/contracts';

import { ECB_SOURCE, eurosPerUnitMicros } from '../domain/exchange-rates';
import type { JobLogger, PayrollRateStore, RateSource } from '../domain/ports';

/** What one run of the rate job did, for its log line. */
export interface RateFetchOutcome {
  /** The ECB's days of a currency pay uses. */
  readonly read: number;
  /** Those not written yet: a run that finds nothing new writes nothing. */
  readonly written: number;
}

/**
 * `payroll.fetch_exchange_rates` (ADR 0033): the ECB's last 90 days, each day of a currency pay uses written once, in
 * pay's terms. A failure to read throws, and the job's attempts and the next hour retry; no other source fills in.
 */
export async function fetchExchangeRates(
  source: RateSource,
  store: PayrollRateStore,
  logger: JobLogger,
  now: () => Date,
): Promise<RateFetchOutcome> {
  const fetchedAt = now().toISOString();
  const rates = (await source.history()).map((rate) =>
    ExchangeRateSchema.parse({
      currency: rate.currency,
      day: rate.day,
      rateMicros: eurosPerUnitMicros(rate.perEuro),
      source: ECB_SOURCE,
      fetchedAt,
    }),
  );
  if (rates.length === 0) throw new Error('The ECB file has no rate of a currency pay uses');
  const { written, differing } = await store.addUnscoped(rates);
  if (differing.length > 0) {
    logger.error(
      { days: differing.map((rate) => `${rate.currency} ${rate.day}`) },
      'payroll: the ECB gives another rate for a day already written, which stays as it is; this repeats each hour until the day leaves the ECB’s 90 days',
    );
  }
  return { read: rates.length, written };
}
