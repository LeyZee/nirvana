import type { JobPayload } from '@nirvana/contracts';
import type { Database } from '@nirvana/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { createConversationCommands, type ConversationCommands } from './application/commands';
import { createRespondJob } from './application/jobs/respond';
import { createSendJob } from './application/jobs/send';
import type { Clock, DraftComposer, FanDirectory, JobLogger, OutboundSender } from './domain/ports';
import { createDrizzleConversationReader } from './infra/db/reader';
import { createDrizzleUnitOfWork } from './infra/db/unit-of-work';
import { createConversationRoutes, type RequireRole } from './infra/http/routes';

export type { Clock, DraftComposer, OutboundSender } from './domain/ports';

/** Public entry point of the `conversations` module (ADR 0002). Other modules import this file only. */
export interface ConversationsModule extends ConversationCommands {
  readonly name: 'conversations';
  /** Mounted under `/v1` by the server. */
  readonly routes: FastifyPluginAsyncZod;
  /** Handlers of the module's jobs; the composition root registers them with Graphile Worker. */
  readonly jobs: {
    respond(payload: JobPayload<'conversation.respond'>, logger: JobLogger): Promise<void>;
    send(payload: JobPayload<'conversation.send'>, logger: JobLogger, attempt: number): Promise<void>;
  };
}

export interface ConversationsDeps {
  /** Application role (RLS). */
  readonly db: Database;
  readonly fans: FanDirectory;
  /** Implemented by the `connectors` module (P0-06). */
  readonly sender: OutboundSender;
  readonly requireRole: RequireRole;
  /** The engine (agent module's adapter); without it drafts stay empty for the operator to write. */
  readonly composer?: DraftComposer;
  readonly clock?: Clock;
}

const systemClock: Clock = { now: () => new Date() };

export function createConversationsModule(deps: ConversationsDeps): ConversationsModule {
  const uow = createDrizzleUnitOfWork(deps.db);
  const clock = deps.clock ?? systemClock;
  const commands = createConversationCommands({ uow, clock, fans: deps.fans });
  return {
    name: 'conversations',
    ...commands,
    routes: createConversationRoutes(createDrizzleConversationReader(deps.db), commands, deps.requireRole),
    jobs: {
      respond: createRespondJob({
        uow,
        clock,
        ...(deps.composer === undefined ? {} : { composer: deps.composer }),
      }),
      send: createSendJob({ uow, clock, sender: deps.sender }),
    },
  };
}
