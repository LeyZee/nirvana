import type { BackupRunStatus, BackupState } from '@nirvana/contracts';

/**
 * When the daily export counts as missing (ADR 0028 § 5). The export runs at 3 h, Paris time: 26 hours leave one
 * slow or retried run its margin, and turn a missed night into an alert the next morning.
 */
export const BACKUP_OVERDUE_HOURS = 26;

/** The time zone of the export's schedule, and of the day an alert counts once in. */
const BACKUP_TIME_ZONE = 'Europe/Paris';

const HOUR_MS = 3_600_000;

/** A row of `backup_runs`, as the module reads it. */
export interface BackupRun {
  readonly status: BackupRunStatus;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly sizeBytes: number | null;
  readonly error: string | null;
}

export function backupState(lastSucceededAt: Date | null, now: Date): BackupState {
  if (lastSucceededAt === null) return 'never';
  return now.getTime() - lastSucceededAt.getTime() > BACKUP_OVERDUE_HOURS * HOUR_MS ? 'overdue' : 'ok';
}

/**
 * Whether the state calls for the Telegram alert. `never` only where an export is expected (production): a
 * development database has no `backup` service, and would otherwise alert every day.
 */
export function needsAlert(state: BackupState, expectsExports: boolean): boolean {
  if (state === 'overdue') return true;
  return state === 'never' && expectsExports;
}

/** `2026-10-27`: the day `at` falls on in Paris. */
export function backupDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BACKUP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}
