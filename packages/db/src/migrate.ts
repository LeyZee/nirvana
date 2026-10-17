import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import type { Database } from './client';

/** Folder of the reviewed SQL migrations, shipped with the package. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

/** Applies the pending migrations; already applied ones are skipped (idempotent). Run as `nirvana_admin`. */
export async function runMigrations(adminDb: Database): Promise<void> {
  await migrate(adminDb, { migrationsFolder: MIGRATIONS_FOLDER });
}
