import {
  AnswerShiftSwapRequestBodySchema,
  CreateLeaveRequestBodySchema,
  CreateShiftBodySchema,
  CreateShiftSwapRequestBodySchema,
  CreateShiftTemplateBodySchema,
  DecideLeaveRequestBodySchema,
  DomainError,
  LeaveRequestIdSchema,
  LeaveRequestListSchema,
  LeaveRequestQuerySchema,
  LeaveRequestSchema,
  MyShiftsSchema,
  OnDutyListSchema,
  PlanningQuerySchema,
  PlanningSchema,
  SchedulingSettingsSchema,
  ShiftIdSchema,
  ShiftSchema,
  ShiftSwapListSchema,
  ShiftSwapRequestIdSchema,
  ShiftSwapRequestSchema,
  ShiftTemplateIdSchema,
  ShiftTemplateListSchema,
  ShiftTemplateSchema,
  SwapCandidatesQuerySchema,
  SwapCandidatesSchema,
  UpdateShiftBodySchema,
  UserIdSchema,
  type UserId,
  type UserRole,
} from '@nirvana/contracts';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { LeaveService } from '../application/leaves';
import type { SchedulingService } from '../application/scheduling';
import type { SwapService } from '../application/swaps';
import type { Actor } from '../domain/ports';

/** The composition root's `requireRole`: 401 without a session, 403 with another role; sets `request.user`. */
export type RequireRole = (...roles: UserRole[]) => preHandlerAsyncHookHandler;

const ShiftParamsSchema = z.object({ shiftId: ShiftIdSchema });
const TemplateParamsSchema = z.object({ templateId: ShiftTemplateIdSchema });
const LeaveParamsSchema = z.object({ leaveRequestId: LeaveRequestIdSchema });
const SwapParamsSchema = z.object({ shiftSwapRequestId: ShiftSwapRequestIdSchema });

function userOf(request: FastifyRequest): UserId {
  if (request.user === null) throw new DomainError('session_unauthenticated', 'Connexion requise');
  return UserIdSchema.parse(request.user.id);
}

const actorOf = (request: FastifyRequest): Actor => ({ userId: userOf(request), ip: request.ip });

/**
 * `/v1/scheduling` (EQ-02, ADR 0024, ADR 0025, ADR 0031): the owner and the team's accounts reach it, a creator never.
 * Who plans is the database's call (`withMember`): the owner and an active manager; anyone else reads their own
 * shifts, asks their own leaves and proposes or answers their own swaps. The settings are written by the owner alone.
 */
export function createSchedulingRoutes(
  { scheduling, leaves, swaps }: { scheduling: SchedulingService; leaves: LeaveService; swaps: SwapService },
  requireRole: RequireRole,
): FastifyPluginAsyncZod {
  const ownerOrMember = requireRole('owner', 'operator');
  const owner = requireRole('owner');
  return (app) => {
    app.get(
      '/scheduling/settings',
      { preHandler: ownerOrMember, schema: { response: { 200: SchedulingSettingsSchema } } },
      (request) => scheduling.settings(userOf(request)),
    );

    app.put(
      '/scheduling/settings',
      {
        preHandler: owner,
        schema: { body: SchedulingSettingsSchema, response: { 200: SchedulingSettingsSchema } },
      },
      (request) => scheduling.saveSettings(actorOf(request), request.body),
    );

    app.get(
      '/scheduling/planning',
      {
        preHandler: ownerOrMember,
        schema: { querystring: PlanningQuerySchema, response: { 200: PlanningSchema } },
      },
      (request) => scheduling.planning(userOf(request), request.query),
    );

    app.get(
      '/scheduling/on-duty',
      { preHandler: ownerOrMember, schema: { response: { 200: OnDutyListSchema } } },
      async (request) => ({ onDuty: await scheduling.onDuty(userOf(request)) }),
    );

    app.get(
      '/scheduling/my-shifts',
      { preHandler: ownerOrMember, schema: { response: { 200: MyShiftsSchema } } },
      (request) => scheduling.myShifts(userOf(request)),
    );

    app.post(
      '/scheduling/shifts',
      { preHandler: ownerOrMember, schema: { body: CreateShiftBodySchema, response: { 201: ShiftSchema } } },
      async (request, reply) =>
        reply.code(201).send(await scheduling.createShift(actorOf(request), request.body)),
    );

    // 204 when the change cancels the shift: stopped in the minute it started, it is never sent back.
    app.patch(
      '/scheduling/shifts/:shiftId',
      {
        preHandler: ownerOrMember,
        schema: {
          params: ShiftParamsSchema,
          body: UpdateShiftBodySchema,
          response: { 200: ShiftSchema, 204: z.null() },
        },
      },
      async (request, reply) => {
        const shift = await scheduling.updateShift(actorOf(request), request.params.shiftId, request.body);
        return shift === null ? reply.code(204).send(null) : reply.code(200).send(shift);
      },
    );

    app.delete(
      '/scheduling/shifts/:shiftId',
      { preHandler: ownerOrMember, schema: { params: ShiftParamsSchema } },
      async (request, reply) => {
        await scheduling.cancelShift(actorOf(request), request.params.shiftId);
        return reply.code(204).send();
      },
    );

    app.get(
      '/scheduling/shift-templates',
      { preHandler: ownerOrMember, schema: { response: { 200: ShiftTemplateListSchema } } },
      async (request) => ({ templates: await scheduling.templates(userOf(request)) }),
    );

    app.post(
      '/scheduling/shift-templates',
      {
        preHandler: ownerOrMember,
        schema: { body: CreateShiftTemplateBodySchema, response: { 201: ShiftTemplateSchema } },
      },
      async (request, reply) =>
        reply.code(201).send(await scheduling.createTemplate(actorOf(request), request.body)),
    );

    app.delete(
      '/scheduling/shift-templates/:templateId',
      { preHandler: ownerOrMember, schema: { params: TemplateParamsSchema } },
      async (request, reply) => {
        await scheduling.endTemplate(actorOf(request), request.params.templateId);
        return reply.code(204).send();
      },
    );

    app.get(
      '/scheduling/leave-requests',
      {
        preHandler: ownerOrMember,
        schema: { querystring: LeaveRequestQuerySchema, response: { 200: LeaveRequestListSchema } },
      },
      (request) => leaves.list(userOf(request), request.query),
    );

    // 200 when the same request was already recorded: a retry of the form records one.
    app.post(
      '/scheduling/leave-requests',
      {
        preHandler: ownerOrMember,
        schema: {
          body: CreateLeaveRequestBodySchema,
          response: { 200: LeaveRequestSchema, 201: LeaveRequestSchema },
        },
      },
      async (request, reply) => {
        const { leave, created } = await leaves.create(actorOf(request), request.body);
        return reply.code(created ? 201 : 200).send(leave);
      },
    );

    app.post(
      '/scheduling/leave-requests/:leaveRequestId/decision',
      {
        preHandler: ownerOrMember,
        schema: {
          params: LeaveParamsSchema,
          body: DecideLeaveRequestBodySchema,
          response: { 200: LeaveRequestSchema },
        },
      },
      (request) => leaves.decide(actorOf(request), request.params.leaveRequestId, request.body),
    );

    app.delete(
      '/scheduling/leave-requests/:leaveRequestId',
      { preHandler: ownerOrMember, schema: { params: LeaveParamsSchema } },
      async (request, reply) => {
        await leaves.end(actorOf(request), request.params.leaveRequestId);
        return reply.code(204).send();
      },
    );

    app.get(
      '/scheduling/swap-requests',
      { preHandler: ownerOrMember, schema: { response: { 200: ShiftSwapListSchema } } },
      (request) => swaps.list(userOf(request)),
    );

    app.get(
      '/scheduling/swap-candidates',
      {
        preHandler: ownerOrMember,
        schema: { querystring: SwapCandidatesQuerySchema, response: { 200: SwapCandidatesSchema } },
      },
      (request) => swaps.candidates(userOf(request), request.query.shiftId),
    );

    // 200 when the same swap was already recorded: a retry of the form records one.
    app.post(
      '/scheduling/swap-requests',
      {
        preHandler: ownerOrMember,
        schema: {
          body: CreateShiftSwapRequestBodySchema,
          response: { 200: ShiftSwapRequestSchema, 201: ShiftSwapRequestSchema },
        },
      },
      async (request, reply) => {
        const { swap, created } = await swaps.propose(actorOf(request), request.body);
        return reply.code(created ? 201 : 200).send(swap);
      },
    );

    app.post(
      '/scheduling/swap-requests/:shiftSwapRequestId/answer',
      {
        preHandler: ownerOrMember,
        schema: {
          params: SwapParamsSchema,
          body: AnswerShiftSwapRequestBodySchema,
          response: { 200: ShiftSwapRequestSchema },
        },
      },
      (request) => swaps.answer(actorOf(request), request.params.shiftSwapRequestId, request.body.answer),
    );

    app.delete(
      '/scheduling/swap-requests/:shiftSwapRequestId',
      { preHandler: ownerOrMember, schema: { params: SwapParamsSchema } },
      async (request, reply) => {
        await swaps.end(actorOf(request), request.params.shiftSwapRequestId);
        return reply.code(204).send();
      },
    );
    return Promise.resolve();
  };
}
