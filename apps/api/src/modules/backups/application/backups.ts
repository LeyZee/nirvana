import type { BackupStatus } from '@nirvana/contracts';

import type { BackupAlerts, BackupRunsReader, Clock } from '../domain/ports';
import { BACKUP_OVERDUE_HOURS, backupDay, backupState, needsAlert } from '../domain/status';

export interface BackupsDeps {
  readonly runs: BackupRunsReader;
  readonly alerts: BackupAlerts;
  readonly clock: Clock;
  /** Production: no export at all is an alert too (`needsAlert`). */
  readonly expectsExports: boolean;
}

/** `GET /v1/backups/status`: where the daily export stands, for the owner's Dashboard. */
export async function readBackupStatus(deps: Pick<BackupsDeps, 'runs' | 'clock'>): Promise<BackupStatus> {
  const [lastSucceededAt, lastRun] = await Promise.all([deps.runs.lastSucceededAt(), deps.runs.latestRun()]);
  return {
    state: backupState(lastSucceededAt, deps.clock.now()),
    lastSucceededAt: lastSucceededAt?.toISOString() ?? null,
    overdueAfterHours: BACKUP_OVERDUE_HOURS,
    lastRun:
      lastRun === null
        ? null
        : {
            status: lastRun.status,
            startedAt: lastRun.startedAt.toISOString(),
            finishedAt: lastRun.finishedAt?.toISOString() ?? null,
            sizeBytes: lastRun.sizeBytes,
            error: lastRun.error,
          },
  };
}

export type BackupCheck = 'ok' | 'alerted' | 'already_alerted';

/**
 * The hourly check (`backups.check`): an export missing for 26 hours publishes `backup_overdue`, at most once per
 * Paris day while it lasts, so the alert comes back each morning until an export succeeds.
 */
export async function checkBackups(deps: BackupsDeps): Promise<BackupCheck> {
  const now = deps.clock.now();
  const lastSucceededAt = await deps.runs.lastSucceededAt();
  if (!needsAlert(backupState(lastSucceededAt, now), deps.expectsExports)) return 'ok';
  const published = await deps.alerts.publishOverdue({ lastSucceededAt, day: backupDay(now) });
  return published ? 'alerted' : 'already_alerted';
}
