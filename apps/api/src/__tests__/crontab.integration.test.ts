import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { Logger, run } from 'graphile-worker';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { cronKnownSince, parsedCronJobs } from '../crontab';
import { createJobQueue } from '../jobs';

/** Graphile's own lines stay out of the test output. */
const silent = new Logger(() => () => undefined);

/** Where the rate job's first schedule is read from (ADR 0033): Graphile's known crontabs, never guessed. */
describe('cronKnownSince', () => {
  let test: TestDb;

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    // Graphile's schema, as the API installs it when it starts.
    const queue = await createJobQueue(test.admin.pool);
    await queue.close();
  });

  afterAll(() => test.close());

  const carry = async (): Promise<void> => {
    const runner = await run({
      pgPool: test.admin.pool,
      // Graphile refuses an empty list; the job itself is never due during the test.
      taskList: { noop: () => undefined },
      parsedCronItems: parsedCronJobs(),
      concurrency: 1,
      noHandleSignals: true,
      logger: silent,
    });
    await runner.stop();
  };

  it('is null until a worker carries the job, then the moment the first one started, kept across restarts', async () => {
    expect(await cronKnownSince(test.admin.db, 'payroll.fetch_exchange_rates')).toBeNull();
    const before = Date.now();
    await carry();
    const after = Date.now();
    const since = await cronKnownSince(test.admin.db, 'payroll.fetch_exchange_rates');
    expect(since?.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    expect(since?.getTime()).toBeLessThanOrEqual(after);
    await carry();
    expect(await cronKnownSince(test.admin.db, 'payroll.fetch_exchange_rates')).toEqual(since);
  });
});
