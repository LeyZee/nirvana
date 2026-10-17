import { DomainError, JOB_PAYLOADS } from '@nirvana/contracts';
import { createDbClient, type DbClient } from '@nirvana/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { TaskList } from 'graphile-worker';
import type { Pool } from 'pg';

import { createAuth, createAuthRoutes, createRequireRole, type Auth, type RequireRole } from './auth';
import type { Config } from './config';
import { createJobQueue, defineTask, type JobQueue } from './jobs';
import type { Logger } from './logger';
import { createAgentModule, type AgentModule } from './modules/agent';
import { createConnectorsModule, type ConnectorsModule } from './modules/connectors';
import {
  createConversationsModule,
  type ConversationsModule,
  type OutboundSender,
} from './modules/conversations';
import { createFansModule, type FansModule } from './modules/fans';
import { createMediaModule, type MediaModule } from './modules/media';
import { createPersonaModule, type PersonaModule } from './modules/persona';
import { startProvidersModule, type ProvidersModule } from './modules/providers';
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
  readonly providers: ProvidersModule;
}

/** What both entry points (API and worker) are built from. */
export interface App {
  readonly modules: Modules;
  /** Application role: RLS applies; tenant access goes through `withTenant`. */
  readonly db: DbClient;
  /** Owner role: Graphile Worker, unscoped jobs, migration status. */
  readonly adminDb: DbClient;
  readonly jobs: JobQueue;
  /** Dashboard authentication (Better Auth); routes guard themselves with `requireRole`. */
  readonly auth: Auth;
  readonly requireRole: RequireRole;
  /** Mounted under `/v1` by the server. */
  readonly routes: readonly FastifyPluginAsyncZod[];
  /** Run by the worker. */
  readonly tasks: TaskList;
  readonly readiness: () => Promise<Readiness>;
  /** Closes the queue and both pools; the server and the worker are stopped before. */
  shutdown(): Promise<void>;
}

/** Until the connectors arrive (P0-06), an approved draft cannot leave: the send job fails and is retried. */
const NO_SENDER: OutboundSender = {
  sendText: () => Promise.reject(new DomainError('connector_unavailable', 'Aucun connecteur branché')),
  sendMedia: () => Promise.reject(new DomainError('connector_unavailable', 'Aucun connecteur branché')),
  verifySent: () => Promise.resolve({ status: 'not_found' }),
};

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
  const auth = createAuth(config, db.db, logger);
  const requireRole = createRequireRole(auth);

  const fans = createFansModule({ db: db.db });
  const modules: Modules = {
    connectors: createConnectorsModule(),
    // TODO(P0-06): `sender: connectors.outboundSender`.
    conversations: createConversationsModule({ db: db.db, fans, sender: NO_SENDER, requireRole }),
    fans,
    persona: createPersonaModule(),
    agent: createAgentModule(),
    media: createMediaModule(),
    supervision: createSupervisionModule(),
    sales: createSalesModule(),
    scripts: createScriptsModule(),
    providers: await startProvidersModule({
      adminDb: adminDb.db,
      encryptionKeys: config.CREDENTIALS_ENCRYPTION_KEYS,
      environmentKeys:
        config.NODE_ENV === 'production'
          ? null
          : {
              xai: config.LLM_XAI_API_KEY,
              google: config.LLM_GOOGLE_API_KEY,
              elevenlabs: config.SPEECH_ELEVENLABS_API_KEY,
            },
      onLoadError: (error) => {
        logger.warn({ err: error }, 'AI service keys not loaded');
      },
    }),
  };

  const tasks: TaskList = {
    'conversation.respond': defineTask(
      'conversation.respond',
      JOB_PAYLOADS['conversation.respond'],
      logger,
      (payload, context) => modules.conversations.jobs.respond(payload, context.logger),
    ),
    'conversation.send': defineTask(
      'conversation.send',
      JOB_PAYLOADS['conversation.send'],
      logger,
      (payload, context) => modules.conversations.jobs.send(payload, context.logger, context.attempt),
    ),
    // TODO(P0-06): the connectors module enqueues one `connector.poll` per account on `account:<id>`.
    'connector.dispatch': defineTask('connector.dispatch', JOB_PAYLOADS['connector.dispatch'], logger, () =>
      Promise.resolve(),
    ),
    'providers.check_credentials': defineTask(
      'providers.check_credentials',
      JOB_PAYLOADS['providers.check_credentials'],
      logger,
      async (_payload, { logger: jobLogger }) => {
        const statuses = await modules.providers.reverifyAll();
        jobLogger.info(
          { states: statuses.map((s) => `${s.provider}:${s.state}`) },
          'AI service keys checked',
        );
      },
    ),
  };

  return {
    modules,
    db,
    adminDb,
    jobs,
    auth,
    requireRole,
    routes: [createAuthRoutes(auth, config, requireRole), modules.conversations.routes],
    tasks,
    readiness: () => checkReadiness(db.db, adminDb.db),
    async shutdown() {
      await jobs.close();
      await Promise.all([db.close(), adminDb.close()]);
    },
  };
}
