/** Public entry point of the `backups` module (ADR 0028 § 5 and § 6, OPS-02). Other modules import this file only. */
import type { BackupStatus } from '@nirvana/contracts';
import type { Database } from '@nirvana/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import {
  checkBackups,
  readBackupStatus,
  recordRestoreTest,
  restoreTestFresh,
  type BackupCheck,
  type BackupsDeps,
} from './application/backups';
import type { Clock } from './domain/ports';
import {
  createPostgresBackupAlerts,
  createPostgresBackupRunsReader,
  createPostgresRestoreTestsStore,
} from './infra/postgres';
import { createBackupsRoutes, type BackupsRoutesOptions } from './infra/routes';

export interface BackupsModule {
  readonly name: 'backups';
  readonly status: () => Promise<BackupStatus>;
  readonly jobs: { readonly check: () => Promise<BackupCheck> };
  /**
   * EQ-17's pay guard, wired by the composition root on its port: the latest restore test found no mismatch and is
   * at most RESTORE_TEST_FRESH_DAYS old at `at`.
   */
  readonly restoreTestFresh: (at: Date) => Promise<boolean>;
  /** `/v1/backups/status` and `/v1/backups/restore-tests`, behind the guards given here. */
  readonly routes: (options: BackupsRoutesOptions) => FastifyPluginAsyncZod;
}

function createBackupsModule(deps: BackupsDeps): BackupsModule {
  const status = () => readBackupStatus(deps);
  return {
    name: 'backups',
    status,
    jobs: { check: () => checkBackups(deps) },
    restoreTestFresh: (at) => restoreTestFresh(deps, at),
    routes: (options) =>
      createBackupsRoutes(
        { status, recordRestoreTest: (body, actor) => recordRestoreTest(deps, body, actor) },
        options,
      ),
  };
}

export interface BackupsStartOptions {
  /** The application role: reads `backup_runs`, reads and appends `restore_tests`. */
  readonly db: Database;
  /** The admin role: writes the creator-less `backup_overdue` event. */
  readonly adminDb: Database;
  /** Tests only: the day an alert counts in follows this clock. */
  readonly clock?: Clock;
}

export function startBackupsModule(options: BackupsStartOptions): BackupsModule {
  return createBackupsModule({
    runs: createPostgresBackupRunsReader(options.db),
    alerts: createPostgresBackupAlerts(options.adminDb),
    restoreTests: createPostgresRestoreTestsStore(options.db),
    clock: options.clock ?? { now: () => new Date() },
  });
}
