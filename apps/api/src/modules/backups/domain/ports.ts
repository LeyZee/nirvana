import type { BackupRun } from './status';

export interface BackupRunsReader {
  /** The end of the latest export that succeeded; null when none ever did. */
  lastSucceededAt(): Promise<Date | null>;
  /** The latest export started, whatever its outcome. */
  latestRun(): Promise<BackupRun | null>;
}

export interface BackupOverduePayload {
  readonly lastSucceededAt: Date | null;
  readonly day: string;
}

export interface BackupAlerts {
  /** Publishes `backup_overdue` for `day`, unless that day already has one. True when it published. */
  publishOverdue(payload: BackupOverduePayload): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}
