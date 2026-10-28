import type { ForeignCurrency } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import type { EcbRate, JobLogger, OverdueRate } from '../../domain/ports';
import { fetchExchangeRates, type RateJobDeps } from '../exchange-rates';

const logger: JobLogger = { warn: () => undefined, error: () => undefined };

/** The job against fakes: an ECB that answers or not, the last day written, the alerts already out today. */
function job(options: { ecb: readonly EcbRate[] | Error; lastDay: string | null; at: string }) {
  const published: OverdueRate[] = [];
  const deps: RateJobDeps = {
    source: {
      history: () =>
        options.ecb instanceof Error ? Promise.reject(options.ecb) : Promise.resolve(options.ecb),
    },
    store: {
      addUnscoped: (rates) => Promise.resolve({ written: rates.length, differing: [] }),
      latestDaysUnscoped: () =>
        Promise.resolve(
          new Map<ForeignCurrency, string>(options.lastDay === null ? [] : [['USD', options.lastDay]]),
        ),
    },
    alerts: {
      publishOverdue: (alert) => {
        const keyOf = (one: OverdueRate): string => `${one.currency} ${one.day}`;
        const already = published.map(keyOf).includes(keyOf(alert));
        if (!already) published.push(alert);
        return Promise.resolve(!already);
      },
    },
    now: () => new Date(options.at),
  };
  return { run: () => fetchExchangeRates(deps, logger), published };
}

describe('payroll.fetch_exchange_rates, when rates stop coming (ADR 0033)', () => {
  it('rings once a day while the ECB cannot be reached, then still fails the job so that it retries', async () => {
    // Last rate Friday 23 October; Thursday 29 is the third weekday without one.
    const { run, published } = job({
      ecb: new Error('network down'),
      lastDay: '2026-10-23',
      at: '2026-10-29T07:07:00Z',
    });
    await expect(run()).rejects.toThrow('network down');
    await expect(run()).rejects.toThrow('network down');
    expect(published).toEqual([{ currency: 'USD', lastRateDay: '2026-10-23', day: '2026-10-29' }]);
  });

  it('stays quiet two weekdays without a rate, and once the rate is back', async () => {
    const quiet = job({ ecb: new Error('network down'), lastDay: '2026-10-23', at: '2026-10-28T15:07:00Z' });
    await expect(quiet.run()).rejects.toThrow('network down');
    expect(quiet.published).toEqual([]);

    const back = job({
      ecb: [{ day: '2026-10-29', currency: 'USD', perEuro: '1.1650' }],
      lastDay: '2026-10-29',
      at: '2026-10-29T15:07:00Z',
    });
    expect(await back.run()).toEqual({ read: 1, written: 1, alerted: [] });
  });

  it('rings on a file the ECB still serves but without new days, and says it in its outcome', async () => {
    const { run, published } = job({
      ecb: [{ day: '2026-10-23', currency: 'USD', perEuro: '1.1600' }],
      lastDay: '2026-10-23',
      at: '2026-10-29T08:07:00Z',
    });
    expect(await run()).toEqual({ read: 1, written: 1, alerted: ['USD'] });
    expect(await run()).toEqual({ read: 1, written: 1, alerted: [] });
    expect(published).toHaveLength(1);
  });

  it('measures nothing before a first rate: the failed read is the job’s error', async () => {
    const { run, published } = job({
      ecb: new Error('network down'),
      lastDay: null,
      at: '2026-10-29T08:07:00Z',
    });
    await expect(run()).rejects.toThrow('network down');
    expect(published).toEqual([]);
  });
});
