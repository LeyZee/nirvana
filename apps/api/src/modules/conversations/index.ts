import type { JobPayload } from '@nirvana/contracts';
import type { Database } from '@nirvana/db';
import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { createConversationCommands, type ConversationCommands } from './application/commands';
import { createFollowUpJob } from './application/jobs/follow-up';
import { createRecordFactsJob } from './application/jobs/record-facts';
import { createReopenJob } from './application/jobs/reopen';
import { createRespondJob } from './application/jobs/respond';
import { createSendJob } from './application/jobs/send';
import type {
  BubbleGuard,
  Clock,
  DraftComposer,
  DraftVoice,
  FanDirectory,
  FollowUpPlan,
  JobLogger,
  OutboundSender,
  ReplyHours,
  ShiftPresence,
} from './domain/ports';
import { createDrizzleConversationReader } from './infra/db/reader';
import { createDrizzleUnitOfWork } from './infra/db/unit-of-work';
import { createConversationRoutes, type RequireRole } from './infra/http/routes';

export { SendRefused } from './domain/errors';
export type {
  BubbleGuard,
  Clock,
  DraftComposer,
  FollowUpContext,
  FollowUpPlan,
  GuardReadContext,
  OutboundSender,
} from './domain/ports';

/** Public entry point of the `conversations` module (ADR 0002). Other modules import this file only. */
export interface ConversationsModule extends ConversationCommands {
  readonly name: 'conversations';
  /** Mounted under `/v1` by the server. */
  readonly routes: FastifyPluginAsyncZod;
  /** Handlers of the module's jobs; the composition root registers them with Graphile Worker. */
  readonly jobs: {
    respond(payload: JobPayload<'conversation.respond'>, logger: JobLogger): Promise<void>;
    send(payload: JobPayload<'conversation.send'>, logger: JobLogger, attempt: number): Promise<void>;
    recordFacts(payload: JobPayload<'conversation.record_facts'>, logger: JobLogger): Promise<void>;
    followUp(payload: JobPayload<'conversation.follow_up'>, logger: JobLogger): Promise<void>;
    reopen(payload: JobPayload<'conversation.reopen'>, logger: JobLogger): Promise<void>;
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
  /** Her follow-up delays (P3-10, agent module's adapter); without it, no follow-up is scheduled. */
  readonly followUps?: FollowUpPlan;
  /** Her hours (P3-14, `persona`); without them she is always open and quiet from 23:00 to 9:00, as before. */
  readonly replyHours?: ReplyHours;
  /** Who works her conversations now (ADR 0025, `scheduling`); without it, nobody does. */
  readonly presence?: ShiftPresence;
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
    routes: createConversationRoutes(createDrizzleConversationReader(deps.db, clock), commands, {
      requireRole: deps.requireRole,
      recentLogin: deps.recentLogin,
    }),
    jobs: {
      respond: createRespondJob({
        uow,
        clock,
        voice: deps.voice,
        fans: deps.fans,
        ...(deps.composer === undefined ? {} : { composer: deps.composer }),
        ...(deps.replyHours === undefined ? {} : { replyHours: deps.replyHours }),
        ...(deps.presence === undefined ? {} : { presence: deps.presence }),
      }),
      send: createSendJob({
        uow,
        clock,
        sender: deps.sender,
        ...(deps.followUps === undefined ? {} : { followUps: deps.followUps }),
      }),
      recordFacts: createRecordFactsJob({ uow, clock, fans: deps.fans }),
      followUp: createFollowUpJob({
        uow,
        clock,
        fans: deps.fans,
        ...(deps.composer === undefined ? {} : { composer: deps.composer }),
        ...(deps.followUps === undefined ? {} : { followUps: deps.followUps }),
        ...(deps.replyHours === undefined ? {} : { replyHours: deps.replyHours }),
      }),
      reopen: createReopenJob({ uow, clock }),
    },
  };
}
