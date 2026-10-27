import type { RestoreTestEntry, StoredRestoreTest } from './restore-tests';
import type { BackupRun } from './status';

export interface BackupRunsReader {
  /** The end of the latest export that succeeded; null when none ever did. */
  lastSucceededAt(): Promise<Date | null>;
  /** The latest export started, whatever its outcome. */
  latestRun(): Promise<BackupRun | null>;
  /** When the oldest row of `backup_runs` started: the service's first try. Null without any row. */
  firstRunStartedAt(): Promise<Date | null>;
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

/** Who entered a test, for `audit_log`. */
export interface RestoreTestActor {
  readonly userId: string;
  readonly ip: string | null;
}

export interface RestoreTestsStore {
  /** The export that succeeded with this fingerprint (lower case); null for none, or one that failed. */
  findSucceededBackup(sha256: string): Promise<{ readonly id: string; readonly finishedAt: Date } | null>;
  /**
   * Inserts the test and its `audit_log` line in one transaction, unless its `id` is already there: then the stored
   * test comes back, untouched (the table is append-only).
   */
  record(
    entry: RestoreTestEntry,
    actor: RestoreTestActor,
  ): Promise<{ readonly inserted: boolean; readonly test: StoredRestoreTest }>;
  /** The latest test by `testedAt`. */
  latest(): Promise<StoredRestoreTest | null>;
}
