import type { JobName } from '@nirvana/contracts';
import { parseCronItems, type CronItem, type ParsedCronItem } from 'graphile-worker';

export interface CronJob extends CronItem {
  readonly task: JobName;
}

/**
 * Periodic jobs (ADR 0006). In code rather than in a Graphile `crontab` file: the text format refuses dots in
 * task names (`connector.dispatch`), and here each entry is checked against the contract's job names.
 */
const CRON_JOBS: readonly CronJob[] = [
  // Enqueues one poll per platform account on its serial queue `account:<id>` (P0-06). No backfill: minutes
  // missed during an outage are not replayed, the next run polls everything anyway.
  { task: 'connector.dispatch', match: '* * * * *', options: { backfillPeriod: 0, maxAttempts: 1 } },
];

export function parsedCronJobs(jobs: readonly CronJob[] = CRON_JOBS): ParsedCronItem[] {
  return parseCronItems([...jobs]);
}
