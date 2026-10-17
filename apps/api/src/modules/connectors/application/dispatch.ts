import type { AccountJobs, AccountStore, Clock, JobLogger } from '../domain/ports';
import { isPaused, nextPollAt } from '../domain/rhythm';

import type { ConnectorResolver } from './resolver';

/** `connector.reconcile` runs on the dispatches whose minute is a multiple of this. */
const RECONCILE_EVERY_MINUTES = 10;

/**
 * `connector.dispatch`, the crontab's job (every minute): one `connector.poll` per pollable account, at the time
 * its interval and jitter give. The job key keeps a poll already waiting as it is, so dispatches never stack.
 */
export function createDispatchJob(deps: {
  readonly accounts: AccountStore;
  readonly jobs: AccountJobs;
  readonly resolver: ConnectorResolver;
  readonly clock: Clock;
  readonly random?: () => number;
}) {
  const random = deps.random ?? Math.random;
  return async (logger: JobLogger): Promise<void> => {
    const now = deps.clock.now();
    const correlationId = `dispatch:${now.toISOString()}`;
    const accounts = await deps.accounts.listPollable(deps.resolver.platforms);
    const reconcile = now.getUTCMinutes() % RECONCILE_EVERY_MINUTES === 0;
    let polls = 0;
    for (const account of accounts) {
      if (isPaused(account, now)) continue;
      await deps.jobs.enqueuePoll(
        account,
        nextPollAt(account.lastPollAt, account.config, now, random()),
        correlationId,
      );
      polls += 1;
      if (reconcile) await deps.jobs.enqueueReconcile(account, correlationId);
    }
    logger.info({ accounts: accounts.length, polls, reconcile }, 'dispatch: done');
  };
}
