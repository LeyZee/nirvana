/** Drizzle schema, migrations, client with `withTenant` / `withAdmin` (RLS, ADR 0005), secret encryption. */
export {
  createDbClient,
  withAdmin,
  withTenant,
  type Database,
  type DbClient,
  type Transaction,
} from './client';
export {
  decryptSecret,
  encryptSecret,
  keyVersionOf,
  parseEncryptionKeys,
  type EncryptionKey,
} from './crypto';
export { MIGRATIONS_FOLDER, runMigrations } from './migrate';
export * as schema from './schema';
