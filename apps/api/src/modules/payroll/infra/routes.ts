import {
  CommissionStatementIdSchema,
  CommissionStatementSchema,
  DomainError,
  PayPeriodSchema,
  PayrollPeriodSchema,
  UserIdSchema,
  ValidateCommissionStatementBodySchema,
  type UserId,
  type UserRole,
} from '@nirvana/contracts';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { PayrollReads } from '../application/periods';
import type { PayrollValidation } from '../application/validation';
import type { Actor } from '../domain/ports';

/** The composition root's `requireRole`: 401 without a session, 403 with another role; sets `request.user`. */
export type RequireRole = (...roles: UserRole[]) => preHandlerAsyncHookHandler;

const PeriodParamsSchema = z.object({ period: PayPeriodSchema });
const StatementParamsSchema = z.object({ statementId: CommissionStatementIdSchema });

function userOf(request: FastifyRequest): UserId {
  if (request.user === null) throw new DomainError('session_unauthenticated', 'Connexion requise');
  return UserIdSchema.parse(request.user.id);
}

const actorOf = (request: FastifyRequest): Actor => ({ userId: userOf(request), ip: request.ip });

/**
 * `/v1/payroll` (EQ-04): the owner and the team's accounts reach it, a creator never. What each one reads and validates
 * is the database's call (`withMember`): every statement for the owner and an active manager, one's own for anyone
 * else; a validation by the owner or an active manager, never of one's own.
 */
export function createPayrollRoutes(
  reads: PayrollReads,
  validation: PayrollValidation,
  requireRole: RequireRole,
): FastifyPluginAsyncZod {
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

    app.post(
      '/payroll/statements/:statementId/validate',
      {
        preHandler: ownerOrMember,
        schema: {
          params: StatementParamsSchema,
          body: ValidateCommissionStatementBodySchema,
          response: { 200: CommissionStatementSchema },
        },
      },
      (request) => validation.validate(actorOf(request), request.params.statementId, request.body),
    );
    return Promise.resolve();
  };
}
