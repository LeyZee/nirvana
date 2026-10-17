import type { JobPayload } from '@nirvana/contracts';
import type { Database, EncryptionKey } from '@nirvana/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { OutboundSender } from '../conversations';

import { createDispatchJob } from './application/dispatch';
import { createOutboundSender } from './application/outbound-sender';
import { createPollJob } from './application/poll';
import { createReconcileJob } from './application/reconcile';
import { createConnectorResolver } from './application/resolver';
import { createConnectorSessions, type ConnectorSessions } from './application/sessions';
import type { Clock, ConnectorRegistry, IngestMessage, JobLogger } from './domain/ports';
import { createDrizzleAccountJobs, createDrizzleAccountStore } from './infra/db/account-store';
import { createConnectorRoutes } from './infra/http/routes';
import { createSessionVault } from './infra/session-vault';

export type { ConnectorRegistry } from './domain/ports';
export { FakeConnector } from './infra/fake/FakeConnector';

/** Public entry point of the `connectors` module (ADR 0002). Other modules import this file only. */
export interface ConnectorsModule {
  readonly name: 'connectors';
  /** Implements the `conversations` port; the composition root hands it over. */
  readonly outboundSender: OutboundSender;
  readonly sessions: ConnectorSessions;
  /** Mounted under `/v1` by the server. */
  readonly routes: FastifyPluginAsyncZod;
  /** Handlers of the module's jobs; the composition root registers them with Graphile Worker. */
  readonly jobs: {
    dispatch(logger: JobLogger): Promise<void>;
    poll(payload: JobPayload<'connector.poll'>, logger: JobLogger): Promise<void>;
    reconcile(payload: JobPayload<'connector.reconcile'>, logger: JobLogger): Promise<void>;
  };
}

export interface ConnectorsDeps {
  /** Application role (RLS). */
  readonly db: Database;
  /** Owner role: the dispatcher and the device route look across creators. */
  readonly adminDb: Database;
  /** `conversations.ingestMessage`. */
  readonly ingest: IngestMessage;
  /** One factory per platform with an adapter; empty until Reveal's (phase 1). */
  readonly registry: ConnectorRegistry;
  /** `SESSION_ENCRYPTION_KEYS`; without them sessions can be neither stored nor read. */
  readonly sessionKeys: readonly EncryptionKey[] | null;
  /** `EXTENSION_DEVICE_TOKEN`; without it the extension's route refuses everything. */
  readonly deviceToken: string | null;
  readonly clock?: Clock;
  readonly random?: () => number;
}

const systemClock: Clock = { now: () => new Date() };

export function createConnectorsModule(deps: ConnectorsDeps): ConnectorsModule {
  const clock = deps.clock ?? systemClock;
  const accounts = createDrizzleAccountStore(deps.db, deps.adminDb);
  const vault = deps.sessionKeys === null ? null : createSessionVault(deps.sessionKeys);
  const resolver = createConnectorResolver({ accounts, vault, registry: deps.registry });
  const sessions = createConnectorSessions({ accounts, vault, clock });
  const accountJobs = { accounts, resolver, ingest: deps.ingest, clock };
  return {
    name: 'connectors',
    outboundSender: createOutboundSender({ accounts, resolver, clock }),
    sessions,
    routes: createConnectorRoutes(sessions, deps.deviceToken),
    jobs: {
      dispatch: createDispatchJob({
        accounts,
        jobs: createDrizzleAccountJobs(deps.adminDb),
        resolver,
        clock,
        ...(deps.random === undefined ? {} : { random: deps.random }),
      }),
      poll: createPollJob(accountJobs),
      reconcile: createReconcileJob(accountJobs),
    },
  };
}
