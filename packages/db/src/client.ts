import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Isolation and access mode of a transaction, as Drizzle takes them. */
export type TransactionConfig = NonNullable<Parameters<Database['transaction']>[1]>;

/**
 * A read that spans several queries and must see one moment of the database (revue 09, G4): a conversation's state
 * and its drafts read in READ COMMITTED could straddle a commit and disagree.
 */
export const SNAPSHOT_READ: TransactionConfig = {
  isolationLevel: 'repeatable read',
  accessMode: 'read only',
};

export interface DbClient {
  readonly db: Database;
  readonly pool: Pool;
  close(): Promise<void>;
}

/** A pool and its Drizzle handle. The app connects as `nirvana_app` (RLS applies), ops as `nirvana_admin`. */
export function createDbClient(connectionString: string, options: PoolConfig = {}): DbClient {
  const pool = new Pool({ connectionString, max: 10, ...options });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { db, pool, close: () => pool.end() };
}

/**
 * Runs `fn` in a transaction scoped to one creator: every RLS policy compares `creator_id` with this value, so
 * nothing of another creator is visible or writable. `set_config(…, true)` is `SET LOCAL`: it ends with the
 * transaction and never leaks to the next user of the pooled connection.
 */
export function withTenant<T>(
  db: Database,
  creatorId: string,
  fn: (tx: Transaction) => Promise<T>,
  config?: TransactionConfig,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.creator_id', ${creatorId}, true)`);
    return fn(tx);
  }, config);
}

/**
 * Runs `fn` in a transaction on the admin connection (BYPASSRLS), for the multi-tenant system jobs only. Callers
 * are named `*Unscoped` so a review sees every place that crosses tenants.
 */
export function withAdmin<T>(adminDb: Database, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return adminDb.transaction(fn);
}
