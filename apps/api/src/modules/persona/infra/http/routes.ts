import {
  CreatorIdSchema,
  CreatorListSchema,
  CreatorSummarySchema,
  DomainError,
  NewCreatorSchema,
  type UserRole,
} from '@nirvana/contracts';
import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { CreatorDirectory } from '../../domain/ports';

/** The composition root's `requireRole`: 401 without a session, 403 with another role; sets `request.user`. */
export type RequireRole = (...roles: UserRole[]) => preHandlerAsyncHookHandler;

/** `GET /v1/creators`: the creators the signed-in user may open, an owner sees them all; `POST`: the owner adds one. */
export function createCreatorRoutes(
  directory: CreatorDirectory,
  requireRole: RequireRole,
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
    return Promise.resolve();
  };
}
