import {
  DomainError,
  PayPeriodSchema,
  PayrollPeriodSchema,
  UserIdSchema,
  type UserId,
  type UserRole,
} from '@nirvana/contracts';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { PayrollReads } from '../application/periods';

/** The composition root's `requireRole`: 401 without a session, 403 with another role; sets `request.user`. */
export type RequireRole = (...roles: UserRole[]) => preHandlerAsyncHookHandler;

const PeriodParamsSchema = z.object({ period: PayPeriodSchema });

function userOf(request: FastifyRequest): UserId {
  if (request.user === null) throw new DomainError('session_unauthenticated', 'Connexion requise');
  return UserIdSchema.parse(request.user.id);
}

/**
 * `/v1/payroll` (EQ-04): the owner and the team's accounts reach it, a creator never. What each one reads is the
 * database's call (`withMember`): every statement for the owner and an active manager, one's own for anyone else.
 */
export function createPayrollRoutes(reads: PayrollReads, requireRole: RequireRole): FastifyPluginAsyncZod {
  const ownerOrMember = requireRole('owner', 'operator');
  return (app) => {
    app.get(
      '/payroll/periods/:period',
      {
        preHandler: ownerOrMember,
        schema: { params: PeriodParamsSchema, response: { 200: PayrollPeriodSchema } },
      },
      (request) => reads.period(userOf(request), request.params.period),
    );
    return Promise.resolve();
  };
}
