import { JOB_PAYLOADS } from '@nirvana/contracts';
import { createDbClient, type DbClient } from '@nirvana/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { TaskList } from 'graphile-worker';
import type { Pool } from 'pg';

import type { Config } from './config';
import { createDemoEchoTask, createDemoRoutes } from './demo';
import { createJobQueue, defineTask, type JobQueue } from './jobs';
import type { Logger } from './logger';
import { createAgentModule, type AgentModule } from './modules/agent';
import { createConnectorsModule, type ConnectorsModule } from './modules/connectors';
import { createConversationsModule, type ConversationsModule } from './modules/conversations';
import { createFansModule, type FansModule } from './modules/fans';
import { createMediaModule, type MediaModule } from './modules/media';
import { createPersonaModule, type PersonaModule } from './modules/persona';
import { createSalesModule, type SalesModule } from './modules/sales';
import { createScriptsModule, type ScriptsModule } from './modules/scripts';
import { createSupervisionModule, type SupervisionModule } from './modules/supervision';
import { checkReadiness, type Readiness } from './readiness';

/** Every business module, wired. */
interface Modules {
  readonly connectors: ConnectorsModule;
  readonly conversations: ConversationsModule;
  readonly fans: FansModule;
  readonly persona: PersonaModule;
  readonly agent: AgentModule;
  readonly media: MediaModule;
  readonly supervision: SupervisionModule;
  readonly sales: SalesModule;
  readonly scripts: ScriptsModule;
}

/** What both entry points (API and worker) are built from. */
export interface App {
  readonly modules: Modules;
  /** Application role: RLS applies; tenant access goes through `withTenant`. */
  readonly db: DbClient;
  /** Owner role: Graphile Worker, unscoped jobs, migration status. */
  readonly adminDb: DbClient;
  readonly jobs: JobQueue;
  /** Mounted under `/v1` by the server. */
  readonly routes: readonly FastifyPluginAsyncZod[];
  /** Run by the worker. */
  readonly tasks: TaskList;
  readonly readiness: () => Promise<Readiness>;
  /** Closes the queue and both pools; the server and the worker are stopped before. */
  shutdown(): Promise<void>;
}

const POOL_OPTIONS = { connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000 };

/** Wires every business module by hand (no DI container, coding.md). Called once by each entry point. */
export async function createApp(config: Config, logger: Logger): Promise<App> {
  const db = createDbClient(config.DATABASE_URL, POOL_OPTIONS);
  const adminDb = createDbClient(config.DATABASE_ADMIN_URL, { ...POOL_OPTIONS, max: 5 });
  // A client losing its connection must not crash the process; the next query reconnects.
  for (const [role, pool] of [
    ['app', db.pool],
    ['admin', adminDb.pool],
  ] satisfies [string, Pool][]) {
    const onError = (error: Error): void => {
      logger.warn({ err: error, role }, 'database client error');
    };
    pool.on('error', onError);
    pool.on('connect', (client) => client.on('error', onError));
  }
  const jobs = await createJobQueue(adminDb.pool);

  const modules: Modules = {
    connectors: createConnectorsModule(),
    conversations: createConversationsModule(),
    fans: createFansModule(),
    persona: createPersonaModule(),
    agent: createAgentModule(),
    media: createMediaModule(),
    supervision: createSupervisionModule(),
    sales: createSalesModule(),
    scripts: createScriptsModule(),
  };

  const tasks: TaskList = {
    'demo.echo': createDemoEchoTask(logger),
    // TODO(P0-06): the connectors module enqueues one `connector.poll` per account on `account:<id>`.
    'connector.dispatch': defineTask('connector.dispatch', JOB_PAYLOADS['connector.dispatch'], logger, () =>
      Promise.resolve(),
    ),
  };

  return {
    modules,
    db,
    adminDb,
    jobs,
    routes: [createDemoRoutes(jobs)],
    tasks,
    readiness: () => checkReadiness(db.db, adminDb.db),
    async shutdown() {
      await jobs.close();
      await Promise.all([db.close(), adminDb.close()]);
    },
  };
}
