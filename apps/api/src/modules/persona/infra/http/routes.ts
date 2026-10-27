import {
  AgentHoursViewSchema,
  CreatorIdSchema,
  CreatorListSchema,
  CreatorSummarySchema,
  DomainError,
  NewCreatorSchema,
  SetAgentHoursBodySchema,
  type UserRole,
} from '@nirvana/contracts';
import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { CreatorDirectory } from '../../domain/ports';

const CreatorParamsSchema = z.object({ id: CreatorIdSchema });

class CreatorNotFound extends DomainError {
  constructor() {
    super('creator_not_found', 'Créatrice introuvable');
  }
}

/** The composition root's `requireRole`: 401 without a session, 403 with another role; sets `request.user`. */
export type RequireRole = (...roles: UserRole[]) => preHandlerAsyncHookHandler;

/**
 * `GET /v1/creators`: the creators the signed-in user may open, an owner sees them all; `POST`: the owner adds one.
 * `/creators/:id/agent-hours`: her hours (P3-14), the owner's alone, a change with a recent sign-in.
 */
export function createCreatorRoutes(
  directory: CreatorDirectory,
  requireRole: RequireRole,
  recentLogin: preHandlerAsyncHookHandler,
): FastifyPluginAsyncZod {
  return (app) => {
    app.get(
      '/creators',
      {
        preHandler: requireRole('owner', 'operator', 'creator'),
        schema: { response: { 200: CreatorListSchema } },
      },
      async (request) => {
        const { user } = request;
        if (user === null) throw new DomainError('session_unauthenticated', 'Connexion requise');
        const ids = user.role === 'owner' ? 'all' : user.creatorIds.map((id) => CreatorIdSchema.parse(id));
        return { creators: [...(await directory.list(ids))] };
      },
    );

    app.post(
      '/creators',
      {
        // A new creator is the agency's call: the owner only (`pnpm creator:create` does the same).
        preHandler: requireRole('owner'),
        schema: { body: NewCreatorSchema, response: { 201: CreatorSummarySchema } },
      },
      async (request, reply) => {
        const { user } = request;
        if (user === null) throw new DomainError('session_unauthenticated', 'Connexion requise');
        return reply.code(201).send(await directory.create(request.body, user.id));
      },
    );

    app.get(
      '/creators/:id/agent-hours',
      {
        preHandler: requireRole('owner'),
        schema: { params: CreatorParamsSchema, response: { 200: AgentHoursViewSchema } },
      },
      async (request) => {
        const view = await directory.agentHours(request.params.id);
        if (view === null) throw new CreatorNotFound();
        return view;
      },
    );

    app.put(
      '/creators/:id/agent-hours',
      {
        preHandler: [requireRole('owner'), recentLogin],
        schema: {
          params: CreatorParamsSchema,
          body: SetAgentHoursBodySchema,
          response: { 200: AgentHoursViewSchema },
        },
      },
      async (request) => {
        const { user } = request;
        if (user === null) throw new DomainError('session_unauthenticated', 'Connexion requise');
        const { id } = request.params;
        if (!(await directory.setAgentHours(id, request.body.hours, user.id))) throw new CreatorNotFound();
        const view = await directory.agentHours(id);
        if (view === null) throw new CreatorNotFound();
        return view;
      },
    );
    return Promise.resolve();
  };
}
