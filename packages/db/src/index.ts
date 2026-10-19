/** Drizzle schema, migrations, client with `withTenant` / `withAdmin` (RLS, ADR 0005), secret encryption. */
export {
  createDbClient,
  SNAPSHOT_READ,
  withAdmin,
  withTenant,
  type Database,
  type DbClient,
  type Transaction,
  type TransactionConfig,
} from './client';
export {
  decryptSecret,
  encryptSecret,
  keyVersionOf,
  parseEncryptionKeys,
  type EncryptionKey,
} from './crypto';
export { MIGRATIONS_FOLDER, migrationStatus, runMigrations, type MigrationStatus } from './migrate';
export * as schema from './schema';
/** Query operators, re-exported so that every package uses this package's single copy of Drizzle. */
export { and, eq, inArray, sql } from 'drizzle-orm';
