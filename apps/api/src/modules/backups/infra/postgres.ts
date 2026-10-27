import { BackupRunStatusSchema, EventIdSchema, EVENT_PAYLOADS, newId } from '@nirvana/contracts';
import { eq, schema, sql, withAdmin, type Database } from '@nirvana/db';
import { z } from 'zod';

import type { BackupAlerts, BackupRunsReader } from '../domain/ports';
import type { BackupRun } from '../domain/status';

/**
 * `backup_runs` is written by the `backup` service, a shell script outside the application: each row is parsed
 * before it is used (CLAUDE.md rule 6), row counts included, though the database's CHECKs already hold.
 */
const BackupRunRowSchema = z.object({
  status: BackupRunStatusSchema,
  startedAt: z.date(),
  finishedAt: z.date().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  error: z.string().max(500).nullable(),
  rowCounts: z.record(z.string().min(1), z.number().int().nonnegative()).nullable(),
});

const columns = {
  status: schema.backupRuns.status,
  startedAt: schema.backupRuns.startedAt,
  finishedAt: schema.backupRuns.finishedAt,
  sizeBytes: schema.backupRuns.sizeBytes,
  error: schema.backupRuns.error,
  rowCounts: schema.backupRuns.rowCounts,
};

function toRun(row: unknown): BackupRun {
  const { status, startedAt, finishedAt, sizeBytes, error } = BackupRunRowSchema.parse(row);
  return { status, startedAt, finishedAt, sizeBytes, error };
}

/** Read with the application role: `backup_runs` is granted SELECT and has no RLS (no tenant data). */
export function createPostgresBackupRunsReader(db: Database): BackupRunsReader {
  return {
    async lastSucceededAt() {
      const [row] = await db
        .select(columns)
        .from(schema.backupRuns)
        .where(eq(schema.backupRuns.status, 'succeeded'))
        .orderBy(sql`${schema.backupRuns.finishedAt} desc`)
        .limit(1);
      return row === undefined ? null : toRun(row).finishedAt;
    },
    async latestRun() {
      const [row] = await db
        .select(columns)
        .from(schema.backupRuns)
        .orderBy(sql`${schema.backupRuns.startedAt} desc`)
        .limit(1);
      return row === undefined ? null : toRun(row);
    },
  };
}

/**
 * `backup_overdue` in the outbox (ADR 0020 § 3), as `budget_threshold_crossed`: it belongs to no creator, so the row
 * has `creator_id` null and is written with the admin role (RLS). The API never runs the check, but two workers can:
 * the first writes the day's row, the other finds it (advisory lock).
 */
export function createPostgresBackupAlerts(adminDb: Database): BackupAlerts {
  return {
    publishOverdue({ lastSucceededAt, day }) {
      const payload = EVENT_PAYLOADS.backup_overdue.parse({
        lastSucceededAt: lastSucceededAt?.toISOString() ?? null,
        day,
      });
      return withAdmin(adminDb, async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`backup_overdue:${day}`}))`);
        const seen = await tx.execute(sql`
          select 1 from domain_events where type = 'backup_overdue' and payload->>'day' = ${day} limit 1`);
        if (seen.rows.length > 0) return false;
        await tx.insert(schema.domainEvents).values({
          id: newId(EventIdSchema),
          creatorId: null,
          type: 'backup_overdue',
          payload,
          actor: 'system',
          correlationId: `backup_overdue:${day}`,
          createdAt: new Date(),
        });
        return true;
      });
    },
  };
}
