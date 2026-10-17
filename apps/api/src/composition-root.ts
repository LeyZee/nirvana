import { fileURLToPath } from 'node:url';

import { JOB_PAYLOADS } from '@nirvana/contracts';
import { createDbClient, parseEncryptionKeys, type DbClient } from '@nirvana/db';
import type { LlmCallStore } from '@nirvana/llm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { TaskList } from 'graphile-worker';
import type { Pool } from 'pg';

import { createAuth, createAuthRoutes, createRequireRole, type Auth, type RequireRole } from './auth';
import { secretOrNull, type Config } from './config';
import { createJobQueue, defineTask, type JobQueue } from './jobs';
import { createAppLlm } from './llm';
import { createDrizzleLlmCallStore } from './llm-call-store';
import type { Logger } from './logger';
import { createAgentModule, type AgentModule } from './modules/agent';
import { createConnectorsModule, type ConnectorRegistry, type ConnectorsModule } from './modules/connectors';
import { createConversationsModule, type ConversationsModule } from './modules/conversations';
import { createFansModule, type FansModule } from './modules/fans';
import { createMediaModule, type MediaModule } from './modules/media';
import { createPersonaModule, type PersonaModule } from './modules/persona';
import { startPlaygroundModule, type PlaygroundModule } from './modules/playground';
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
  /** Null when its persona cannot be read: the API starts without the playground and says why. */
  readonly playground: PlaygroundModule | null;
}

/** What both entry points (API and worker) are built from. */
export interface App {
  readonly modules: Modules;
  /** Application role: RLS applies; tenant access goes through `withTenant`. */
  readonly db: DbClient;
  /** Owner role: Graphile Worker, unscoped jobs, migration status. */
  readonly adminDb: DbClient;
  readonly jobs: JobQueue;
  /** `llm_calls` for the LLM gateway's journal: one daily cap for the API and the worker, across restarts. */
  readonly llmCalls: LlmCallStore;
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

/** From `src/` in development and from `dist/` once built: both sit two levels under the repository root. */
const fromRepoRoot = (path: string): string => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

const POOL_OPTIONS = { connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000 };

export interface AppOptions {
  /** Tests and local development plug a `FakeConnector` here; production gets the real adapters. */
  readonly connectorRegistry?: ConnectorRegistry;
}

/** Wires every business module by hand (no DI container, coding.md). Called once by each entry point. */
export async function createApp(config: Config, logger: Logger, options: AppOptions = {}): Promise<App> {
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
  const sessionKeys = secretOrNull(config.SESSION_ENCRYPTION_KEYS);
  const connectors = createConnectorsModule({
    db: db.db,
    adminDb: adminDb.db,
    // Called by the jobs only, once `conversations` exists below (the two modules need each other's port).
    ingest: (input) => conversations.ingestMessage(input),
    // Reveal's adapter arrives with phase 1 (ADR 0008); until then no account is polled.
    registry: options.connectorRegistry ?? {},
    sessionKeys: sessionKeys === null ? null : parseEncryptionKeys(sessionKeys),
    deviceToken: secretOrNull(config.EXTENSION_DEVICE_TOKEN),
  });
  const conversations = createConversationsModule({
    db: db.db,
    fans,
    sender: connectors.outboundSender,
    requireRole,
  });
  const providers = await startProvidersModule({
    adminDb: adminDb.db,
    // The `.env.example` placeholder counts as unset: keys stay in memory instead of crashing the start.
    encryptionKeys: secretOrNull(config.CREDENTIALS_ENCRYPTION_KEYS) ?? undefined,
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
  });
  // TODO(P3-06): once the composer PR lands, `log: await createPersistentCallLog(<llm_calls store>, { timeZone, refreshEveryMs: 30_000 })`.
  const llm = createAppLlm({
    credentials: providers.apiKeySource,
    reportRefusedKey: (provider, kind) => providers.reportRefusedKey(provider, kind),
    logger,
  });
  const playground = await startPlaygroundModule({
    ...llm.deps,
    gateway: llm.gateway,
    personaPath: config.PLAYGROUND_PERSONA_PATH ?? fromRepoRoot('personas/demo/v0.1.0.yaml'),
    trainingDir: config.NIRVANA_TRAINING_DIR ?? fromRepoRoot('.scratch/training'),
  }).catch((error: unknown) => {
    logger.warn({ err: error }, 'playground not started: persona unreadable');
    return null;
  });
  const modules: Modules = {
    connectors,
    conversations,
    fans,
    persona: createPersonaModule(),
    agent: createAgentModule(),
    media: createMediaModule(),
    supervision: createSupervisionModule(),
    sales: createSalesModule(),
    scripts: createScriptsModule(),
    providers,
    playground,
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
    'connector.dispatch': defineTask(
      'connector.dispatch',
      JOB_PAYLOADS['connector.dispatch'],
      logger,
      (_payload, context) => modules.connectors.jobs.dispatch(context.logger),
    ),
    'connector.poll': defineTask(
      'connector.poll',
      JOB_PAYLOADS['connector.poll'],
      logger,
      (payload, context) => modules.connectors.jobs.poll(payload, context.logger),
    ),
    'connector.reconcile': defineTask(
      'connector.reconcile',
      JOB_PAYLOADS['connector.reconcile'],
      logger,
      (payload, context) => modules.connectors.jobs.reconcile(payload, context.logger),
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
    llmCalls: createDrizzleLlmCallStore(adminDb.db),
    auth,
    requireRole,
    routes: [
      createAuthRoutes(auth, config, requireRole),
      modules.conversations.routes,
      modules.providers.routes({ guard: requireRole('owner') }),
      modules.connectors.routes,
      ...(playground === null ? [] : [playground.routes({ guard: requireRole('owner') })]),
    ],
    tasks,
    readiness: () => checkReadiness(db.db, adminDb.db),
    async shutdown() {
      modules.providers.stop();
      await jobs.close();
      await Promise.all([db.close(), adminDb.close()]);
    },
  };
}
