import { z } from 'zod';

/**
 * The daily encrypted export of the database (ADR 0028, OPS-02), as the application sees it: the rows the `backup`
 * service writes in `backup_runs`, never a file of the server.
 */

/** Where an export stands: `running` until it ends, then one of the two others. */
export const BACKUP_RUN_STATUSES = ['running', 'succeeded', 'failed'] as const;
export const BackupRunStatusSchema = z.enum(BACKUP_RUN_STATUSES);
export type BackupRunStatus = z.infer<typeof BackupRunStatusSchema>;

/**
 * `ok`: an export succeeded within the last 26 hours. `overdue`: the last success is older. `never`: no export has
 * ever succeeded. The rule is the server's (ADR 0028 § 5); the Dashboard shows `overdue` and `never` in amber.
 */
export const BACKUP_STATES = ['ok', 'overdue', 'never'] as const;
export const BackupStateSchema = z.enum(BACKUP_STATES);
export type BackupState = z.infer<typeof BackupStateSchema>;

/** The latest run, whatever its outcome. `error` is the step that failed, written by the service, never data. */
export const BackupRunSummarySchema = z.object({
  status: BackupRunStatusSchema,
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  error: z.string().max(500).nullable(),
});
export type BackupRunSummary = z.infer<typeof BackupRunSummarySchema>;

/** `GET /v1/backups/status`, owner only. */
export const BackupStatusSchema = z.object({
  state: BackupStateSchema,
  lastSucceededAt: z.iso.datetime().nullable(),
  /** Hours the export may go without success before `overdue` (26). */
  overdueAfterHours: z.number().int().positive(),
  lastRun: BackupRunSummarySchema.nullable(),
});
export type BackupStatus = z.infer<typeof BackupStatusSchema>;
