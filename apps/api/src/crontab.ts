import { JOB_MAX_ATTEMPTS, type JobName } from '@nirvana/contracts';
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
  {
    task: 'connector.dispatch',
    match: '* * * * *',
    options: { backfillPeriod: 0, maxAttempts: JOB_MAX_ATTEMPTS['connector.dispatch'] },
  },
  // Re-checks the saved AI service keys (ADR 0016): credit, revoked keys, recovery after a refusal. No backfill:
  // the next run checks everything anyway.
  {
    task: 'providers.check_credentials',
    match: '*/15 * * * *',
    options: { backfillPeriod: 0, maxAttempts: JOB_MAX_ATTEMPTS['providers.check_credentials'] },
  },
  // Telegram notifications (ADR 0020). The scan is the trigger's safety net: an event whose trigger could not
  // enqueue is read within the minute. The polls read the groups the bots sit in; the digest decides each hour
  // whether it is morning somewhere; the purge drops the deliveries past their retention.
  ...(['telegram.scan', 'telegram.dispatch_polls'] as const).map((task) => ({
    task,
    match: '* * * * *',
    options: { backfillPeriod: 0, maxAttempts: 1 },
  })),
  { task: 'telegram.morning_digest', match: '0 * * * *', options: { backfillPeriod: 0, maxAttempts: 1 } },
  { task: 'telegram.purge', match: '30 3 * * *', options: { backfillPeriod: 0, maxAttempts: 1 } },
  // Her facts about a fan last seen a year ago go (security.md, P3-02).
  { task: 'fans.purge_facts', match: '45 3 * * *', options: { backfillPeriod: 0, maxAttempts: 1 } },
  // The rate limiter's ended windows go, and the hashed IPs and accounts they counted with them (ADR 0027).
  { task: 'rate_limit.purge', match: '*/10 * * * *', options: { backfillPeriod: 0, maxAttempts: 1 } },
];

export function parsedCronJobs(jobs: readonly CronJob[] = CRON_JOBS): ParsedCronItem[] {
  return parseCronItems([...jobs]);
}
