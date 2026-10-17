import { migrationStatus, sql, type Database } from '@nirvana/db';

/** A worker that has not written its heartbeat for this long is considered gone (P0-04). */
const HEARTBEAT_MAX_AGE_SECONDS = 90;
const CHECK_TIMEOUT_MS = 2_000;

export interface Readiness {
  readonly isReady: boolean;
  readonly checks: {
    readonly database: boolean;
    readonly migrations: boolean;
    readonly worker: boolean;
  };
  /**
   * Jobs Graphile gave up on (attempts spent): they stay in its table with their last error, for an operator to
   * read (operations.md). They do not make the API unready; `null` when the count could not be read. Optional
   * so that a test stub may leave it out.
   */
  readonly deadJobs?: number | null;
}

async function within<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallback);
    }, CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise.catch(() => fallback), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `/ready` (operations.md § Santé): the database answers, the shipped migrations are applied, and some worker
 * wrote its heartbeat recently. The age is computed by Postgres so that the API's clock does not matter.
 */
export async function checkReadiness(db: Database, adminDb: Database): Promise<Readiness> {
  const [database, migrations, worker, deadJobs] = await Promise.all([
    within(
      db.execute(sql`select 1`).then(() => true),
      false,
    ),
    within(
      migrationStatus(adminDb).then((status) => status.isUpToDate),
      false,
    ),
    within(
      db
        .execute<{ fresh: boolean }>(
          sql`select coalesce(max(last_seen_at) > now() - make_interval(secs => ${HEARTBEAT_MAX_AGE_SECONDS}), false) as fresh
              from worker_heartbeats`,
        )
        .then((result) => result.rows[0]?.fresh === true),
      false,
    ),
    within(
      adminDb
        .execute<{ dead: number }>(
          sql`select count(*)::int as dead from graphile_worker.jobs where attempts >= max_attempts`,
        )
        .then((result) => result.rows[0]?.dead ?? null),
      null,
    ),
  ]);
  return {
    isReady: database && migrations && worker,
    checks: { database, migrations, worker },
    deadJobs,
  };
}
