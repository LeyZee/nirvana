import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import type { Database } from './client';

/** Folder of the reviewed SQL migrations, shipped with the package. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

/** Applies the pending migrations; already applied ones are skipped (idempotent). Run as `nirvana_admin`. */
export async function runMigrations(adminDb: Database): Promise<void> {
  await migrate(adminDb, { migrationsFolder: MIGRATIONS_FOLDER });
}

export interface MigrationStatus {
  readonly applied: number;
  readonly expected: number;
  readonly isUpToDate: boolean;
}

/**
 * Compares the migrations shipped with the code to the ones recorded by Drizzle, for `/ready`: a version deployed
 * before its migration job ran is not ready. Needs read access to `drizzle.__drizzle_migrations` (admin role).
 */
export async function migrationStatus(adminDb: Pick<Database, 'execute'>): Promise<MigrationStatus> {
  const shipped = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const latest = shipped.at(-1)?.folderMillis ?? 0;
  const table = await adminDb.execute<{ exists: boolean }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`,
  );
  if (table.rows[0]?.exists !== true) {
    return { applied: 0, expected: shipped.length, isUpToDate: shipped.length === 0 };
  }
  const result = await adminDb.execute<{ applied: number; latest: string | null }>(
    sql`select count(*)::int as applied, max(created_at)::text as latest from drizzle.__drizzle_migrations`,
  );
  const row = result.rows[0];
  const applied = row?.applied ?? 0;
  const appliedLatest = Number(row?.latest ?? 0);
  return {
    applied,
    expected: shipped.length,
    isUpToDate: applied >= shipped.length && appliedLatest >= latest,
  };
}
