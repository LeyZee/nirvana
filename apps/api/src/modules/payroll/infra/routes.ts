import {
  BonusIdSchema,
  BonusSchema,
  CommissionStatementIdSchema,
  CommissionStatementSchema,
  CreateBonusBodySchema,
  CreatePayAdjustmentBodySchema,
  CreatePenaltyBodySchema,
  DomainError,
  PayAdjustmentSchema,
  PayCommissionStatementBodySchema,
  PayPeriodSchema,
  PayrollPeriodSchema,
  PenaltyIdSchema,
  PenaltySchema,
  UserIdSchema,
  ValidateCommissionStatementBodySchema,
  type UserId,
  type UserRole,
} from '@nirvana/contracts';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { PayrollEntries } from '../application/entries';
import type { PayrollReads } from '../application/periods';
import type { PayrollValidation } from '../application/validation';
import type { Actor } from '../domain/ports';

/** The composition root's `requireRole`: 401 without a session, 403 with another role; sets `request.user`. */
export type RequireRole = (...roles: UserRole[]) => preHandlerAsyncHookHandler;

const PeriodParamsSchema = z.object({ period: PayPeriodSchema });
const StatementParamsSchema = z.object({ statementId: CommissionStatementIdSchema });
const BonusParamsSchema = z.object({ bonusId: BonusIdSchema });
const PenaltyParamsSchema = z.object({ penaltyId: PenaltyIdSchema });

function userOf(request: FastifyRequest): UserId {
  if (request.user === null) throw new DomainError('session_unauthenticated', 'Connexion requise');
  return UserIdSchema.parse(request.user.id);
}

const actorOf = (request: FastifyRequest): Actor => ({ userId: userOf(request), ip: request.ip });

/**
 * `/v1/payroll` (EQ-04): the owner and the team's accounts reach it, a creator never. What each one reads and writes
 * is the database's call (`withMember`): every statement for the owner and an active manager, one's own for anyone
 * else; a validation, a bonus, a penalty or an adjustment by the owner or an active manager, never for oneself; a
 * payment by the owner only. A create sent again with the same `id` and values gives back what was recorded (200).
 */
export function createPayrollRoutes(
  reads: PayrollReads,
  validation: PayrollValidation,
  entries: PayrollEntries,
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

    app.post(
      '/payroll/statements/:statementId/pay',
      {
        preHandler: ownerOrMember,
        schema: {
          params: StatementParamsSchema,
          body: PayCommissionStatementBodySchema,
          response: { 200: CommissionStatementSchema },
        },
      },
      (request) => entries.pay(actorOf(request), request.params.statementId, request.body),
    );

    app.post(
      '/payroll/bonuses',
      {
        preHandler: ownerOrMember,
        schema: { body: CreateBonusBodySchema, response: { 200: BonusSchema, 201: BonusSchema } },
      },
      async (request, reply) => {
        const { value, created } = await entries.createBonus(actorOf(request), request.body);
        return reply.code(created ? 201 : 200).send(value);
      },
    );

    app.post(
      '/payroll/bonuses/:bonusId/cancel',
      { preHandler: ownerOrMember, schema: { params: BonusParamsSchema, response: { 200: BonusSchema } } },
      (request) => entries.cancelBonus(actorOf(request), request.params.bonusId),
    );

    app.post(
      '/payroll/penalties',
      {
        preHandler: ownerOrMember,
        schema: { body: CreatePenaltyBodySchema, response: { 200: PenaltySchema, 201: PenaltySchema } },
      },
      async (request, reply) => {
        const { value, created } = await entries.createPenalty(actorOf(request), request.body);
        return reply.code(created ? 201 : 200).send(value);
      },
    );

    app.post(
      '/payroll/penalties/:penaltyId/cancel',
      {
        preHandler: ownerOrMember,
        schema: { params: PenaltyParamsSchema, response: { 200: PenaltySchema } },
      },
      (request) => entries.cancelPenalty(actorOf(request), request.params.penaltyId),
    );

    app.post(
      '/payroll/adjustments',
      {
        preHandler: ownerOrMember,
        schema: {
          body: CreatePayAdjustmentBodySchema,
          response: { 200: PayAdjustmentSchema, 201: PayAdjustmentSchema },
        },
      },
      async (request, reply) => {
        const { value, created } = await entries.createAdjustment(actorOf(request), request.body);
        return reply.code(created ? 201 : 200).send(value);
      },
    );
    return Promise.resolve();
  };
}
