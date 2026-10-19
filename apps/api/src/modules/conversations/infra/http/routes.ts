import {
  ApproveDraftBodySchema,
  ConversationDetailSchema,
  ConversationEventViewSchema,
  ConversationIdSchema,
  ConversationSummarySchema,
  CreatorIdSchema,
  DomainError,
  DraftIdSchema,
  MessageViewSchema,
  AgentModeResultSchema,
  pageOf,
  PageQuerySchema,
  RejectDraftBodySchema,
  SetAgentModeBodySchema,
  SetModeBodySchema,
  TakeoverBodySchema,
  UserIdSchema,
  type CreatorId,
  type CurrentUser,
  type UserId,
  type UserRole,
} from '@nirvana/contracts';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { ConversationCommands } from '../../application/commands';
import { ConversationNotFound } from '../../domain/errors';
import type { ConversationReader } from '../../domain/ports';

/** The composition root's `requireRole`: 401 without a session, 403 with another role; sets `request.user`. */
export type RequireRole = (...roles: UserRole[]) => preHandlerAsyncHookHandler;

class CreatorForbidden extends DomainError {
  constructor() {
    super('creator_forbidden', 'Créatrice hors de ton périmètre');
  }
}

const CreatorQuerySchema = z.object({ creatorId: CreatorIdSchema });
const ConversationParamsSchema = z.object({ id: ConversationIdSchema });
const DraftParamsSchema = ConversationParamsSchema.extend({ draftId: DraftIdSchema });

/** The signed-in user, allowed on this creator: an owner sees every creator, anyone else their own list. */
function actorFor(request: FastifyRequest, creatorId: CreatorId): { user: CurrentUser; userId: UserId } {
  const { user } = request;
  if (user === null) throw new DomainError('session_unauthenticated', 'Connexion requise');
  if (user.role !== 'owner' && !user.creatorIds.includes(creatorId)) throw new CreatorForbidden();
  return { user, userId: UserIdSchema.parse(user.id) };
}

/** `/v1/conversations` (api.md): the inbox reads, and the operator's commands on drafts and on the conversation. */
export function createConversationRoutes(
  reader: ConversationReader,
  commands: ConversationCommands,
  requireRole: RequireRole,
): FastifyPluginAsyncZod {
  return (app) => {
    const read = { preHandler: requireRole('owner', 'operator', 'creator') };
    const act = { preHandler: requireRole('owner', 'operator') };

    app.get(
      '/conversations',
      {
        ...read,
        schema: {
          querystring: CreatorQuerySchema.extend(PageQuerySchema.shape),
          response: { 200: pageOf(ConversationSummarySchema) },
        },
      },
      async (request) => {
        const { creatorId, limit, cursor } = request.query;
        actorFor(request, creatorId);
        const page = await reader.list(creatorId, { limit, cursor });
        return { items: [...page.items], nextCursor: page.nextCursor };
      },
    );

    app.get(
      '/conversations/:id',
      {
        ...read,
        schema: {
          params: ConversationParamsSchema,
          querystring: CreatorQuerySchema,
          response: { 200: ConversationDetailSchema },
        },
      },
      async (request) => {
        actorFor(request, request.query.creatorId);
        const detail = await reader.get(request.query.creatorId, request.params.id);
        if (detail === null) throw new ConversationNotFound();
        return detail;
      },
    );

    app.get(
      '/conversations/:id/messages',
      {
        ...read,
        schema: {
          params: ConversationParamsSchema,
          querystring: CreatorQuerySchema.extend(PageQuerySchema.shape),
          response: { 200: pageOf(MessageViewSchema) },
        },
      },
      async (request) => {
        const { creatorId, limit, cursor } = request.query;
        actorFor(request, creatorId);
        const page = await reader.messages(creatorId, request.params.id, { limit, cursor });
        return { items: [...page.items], nextCursor: page.nextCursor };
      },
    );

    app.get(
      '/conversations/:id/events',
      {
        ...read,
        schema: {
          params: ConversationParamsSchema,
          querystring: CreatorQuerySchema.extend(PageQuerySchema.shape),
          response: { 200: pageOf(ConversationEventViewSchema) },
        },
      },
      async (request) => {
        const { creatorId, limit, cursor } = request.query;
        actorFor(request, creatorId);
        const page = await reader.events(creatorId, request.params.id, { limit, cursor });
        return { items: [...page.items], nextCursor: page.nextCursor };
      },
    );

    const command = (
      request: FastifyRequest,
      creatorId: CreatorId,
      conversationId: z.infer<typeof ConversationIdSchema>,
    ) => ({
      creatorId,
      conversationId,
      userId: actorFor(request, creatorId).userId,
      correlationId: request.id,
    });

    app.post(
      '/conversations/:id/drafts/:draftId/approve',
      {
        ...act,
        schema: { params: DraftParamsSchema, querystring: CreatorQuerySchema, body: ApproveDraftBodySchema },
      },
      async (request, reply) => {
        await commands.approveDraft({
          ...command(request, request.query.creatorId, request.params.id),
          draftId: request.params.draftId,
          ...(request.body.bubbles === undefined ? {} : { bubbles: request.body.bubbles }),
        });
        return reply.code(204).send();
      },
    );

    app.post(
      '/conversations/:id/drafts/:draftId/reject',
      {
        ...act,
        schema: { params: DraftParamsSchema, querystring: CreatorQuerySchema, body: RejectDraftBodySchema },
      },
      async (request, reply) => {
        await commands.rejectDraft({
          ...command(request, request.query.creatorId, request.params.id),
          draftId: request.params.draftId,
          ...(request.body.reason === undefined ? {} : { reason: request.body.reason }),
        });
        return reply.code(204).send();
      },
    );

    app.post(
      '/conversations/:id/takeover',
      {
        ...act,
        schema: {
          params: ConversationParamsSchema,
          querystring: CreatorQuerySchema,
          body: TakeoverBodySchema,
        },
      },
      async (request, reply) => {
        await commands.takeover({
          ...command(request, request.query.creatorId, request.params.id),
          ...(request.body.reason === undefined ? {} : { reason: request.body.reason }),
        });
        return reply.code(204).send();
      },
    );

    app.post(
      '/conversations/:id/release',
      { ...act, schema: { params: ConversationParamsSchema, querystring: CreatorQuerySchema } },
      async (request, reply) => {
        await commands.release(command(request, request.query.creatorId, request.params.id));
        return reply.code(204).send();
      },
    );

    app.post(
      '/conversations/:id/mode',
      {
        ...act,
        schema: {
          params: ConversationParamsSchema,
          querystring: CreatorQuerySchema,
          body: SetModeBodySchema,
        },
      },
      async (request, reply) => {
        await commands.setMode({
          ...command(request, request.query.creatorId, request.params.id),
          mode: request.body.mode,
        });
        return reply.code(204).send();
      },
    );

    // The Dashboard's control for every conversation of hers; Arrêt takes effect without a re-authentication.
    app.put(
      '/agent/mode',
      { ...act, schema: { body: SetAgentModeBodySchema, response: { 200: AgentModeResultSchema } } },
      async (request) => {
        const { creatorId, mode } = request.body;
        const { userId } = actorFor(request, creatorId);
        return {
          mode: await commands.setAgentMode({ creatorId, userId, mode, correlationId: request.id }),
        };
      },
    );

    return Promise.resolve();
  };
}
