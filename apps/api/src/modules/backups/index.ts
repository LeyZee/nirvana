/** Public entry point of the `backups` module (ADR 0028 § 5, OPS-02). Other modules import this file only. */
import type { BackupStatus } from '@nirvana/contracts';
import type { Database } from '@nirvana/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { checkBackups, readBackupStatus, type BackupCheck, type BackupsDeps } from './application/backups';
import type { Clock } from './domain/ports';
import { createPostgresBackupAlerts, createPostgresBackupRunsReader } from './infra/postgres';
import { createBackupsRoutes, type BackupsRoutesOptions } from './infra/routes';

export interface BackupsModule {
  readonly name: 'backups';
  readonly status: () => Promise<BackupStatus>;
  readonly jobs: { readonly check: () => Promise<BackupCheck> };
  /** `/v1/backups/status`, behind the guard given here. */
  readonly routes: (options: BackupsRoutesOptions) => FastifyPluginAsyncZod;
}

function createBackupsModule(deps: BackupsDeps): BackupsModule {
  const status = () => readBackupStatus(deps);
  return {
    name: 'backups',
    status,
    jobs: { check: () => checkBackups(deps) },
    routes: (options) => createBackupsRoutes(status, options),
  };
}

export interface BackupsStartOptions {
  /** The application role: reads `backup_runs`. */
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
    clock: options.clock ?? { now: () => new Date() },
  });
}
