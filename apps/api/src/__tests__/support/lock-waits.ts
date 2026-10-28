import { sql, type Database } from '@nirvana/db';
import { z } from 'zod';

const WaitsSchema = z.object({ waiting: z.number() });

/**
 * How many locks someone waits on in this test's database, advisory ones or of any kind. `pg_locks` shows every
 * role's waits, where `pg_stat_activity` hides another role's, and every database's: the test files run side by side,
 * each on its own database, and a wait in another one must not count here. A row wait (`transactionid`) belongs to no
 * database and counts only with any kind.
 */
export async function lockWaits(
  db: Pick<Database, 'execute'>,
  kind: 'advisory' | null = 'advisory',
): Promise<number> {
  const here = sql`(select oid from pg_database where datname = current_database())`;
  const result = await db.execute(
    kind === null
      ? sql`select count(*)::int as waiting from pg_locks
            where not granted and (database = ${here} or database is null)`
      : sql`select count(*)::int as waiting from pg_locks
            where locktype = ${kind} and not granted and database = ${here}`,
  );
  return WaitsSchema.parse(result.rows[0]).waiting;
}
