import type { JobPayload } from '@nirvana/contracts';
import type { Database } from '@nirvana/db';
import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { createConversationCommands, type ConversationCommands } from './application/commands';
import { createRespondJob } from './application/jobs/respond';
import { createSendJob } from './application/jobs/send';
import type {
  BubbleGuard,
  Clock,
  DraftComposer,
  DraftVoice,
  FanDirectory,
  JobLogger,
  OutboundSender,
} from './domain/ports';
import { createDrizzleConversationReader } from './infra/db/reader';
import { createDrizzleUnitOfWork } from './infra/db/unit-of-work';
import { createConversationRoutes, type RequireRole } from './infra/http/routes';

export { SendRefused } from './domain/errors';
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
  /** `requireRecentLogin` (ADR 0016): recording a blind test needs a sign-in under 10 minutes. */
  readonly recentLogin: preHandlerAsyncHookHandler;
  /** The voice version the server writes with now (prompt and model): what Automatique is proved on (ADR 0019). */
  readonly voice: DraftVoice;
  /** The agent's hard guards (`AgentBubbleGuard`), read again on every approval (revue 09, G5). */
  readonly guard: BubbleGuard;
  /** The engine (agent module's adapter); without it drafts stay empty for the operator to write. */
  readonly composer?: DraftComposer;
  readonly clock?: Clock;
}

const systemClock: Clock = { now: () => new Date() };

export function createConversationsModule(deps: ConversationsDeps): ConversationsModule {
  const uow = createDrizzleUnitOfWork(deps.db);
  const clock = deps.clock ?? systemClock;
  const commands = createConversationCommands({
    uow,
    clock,
    fans: deps.fans,
    voice: deps.voice,
    guard: deps.guard,
  });
  return {
    name: 'conversations',
    ...commands,
    routes: createConversationRoutes(createDrizzleConversationReader(deps.db), commands, {
      requireRole: deps.requireRole,
      recentLogin: deps.recentLogin,
    }),
    jobs: {
      respond: createRespondJob({
        uow,
        clock,
        voice: deps.voice,
        ...(deps.composer === undefined ? {} : { composer: deps.composer }),
      }),
      send: createSendJob({ uow, clock, sender: deps.sender }),
    },
  };
}
