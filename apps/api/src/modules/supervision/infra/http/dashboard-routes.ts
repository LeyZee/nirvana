import {
  DashboardQuerySchema,
  DashboardSchema,
  DomainError,
  type DashboardPeriod,
  type UserRole,
} from '@nirvana/contracts';
import { startOfLocalDay } from '@nirvana/llm';
import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { assembleDashboard, type BudgetReading } from '../../domain/dashboard';
import type { DashboardReader, TelegramView, VoiceVersion } from '../../domain/dashboard-ports';

/** The composition root's `requireRole`: 401 without a session, 403 with another role; sets `request.user`. */
type RequireRole = (...roles: UserRole[]) => preHandlerAsyncHookHandler;

export interface DashboardRouteDeps {
  readonly reader: DashboardReader;
  readonly requireRole: RequireRole;
  /** The day's AI spend and cap, every creator together (the gateway's health). */
  readonly budget: () => BudgetReading;
  /** A voice model answers, main or fallback. */
  readonly isVoiceOk: () => boolean;
  readonly voice: VoiceVersion;
  /** Absent when Telegram is off (no encryption key): both Telegram fields are null. */
  readonly telegram?: TelegramView;
  readonly now?: () => Date;
}

const DAY_MS = 86_400_000;

function periodStart(period: DashboardPeriod, now: Date, dayStart: Date): Date {
  if (period === 'day') return dayStart;
  return new Date(now.getTime() - (period === 'week' ? 7 : 30) * DAY_MS);
}

/** `GET /v1/dashboard?creatorId=&period=`: everything the Dashboard shows for one creator, computed here. */
export function createDashboardRoutes(deps: DashboardRouteDeps): FastifyPluginAsyncZod {
  return (app) => {
    app.get(
      '/dashboard',
      {
        preHandler: deps.requireRole('owner', 'operator', 'creator'),
        schema: { querystring: DashboardQuerySchema, response: { 200: DashboardSchema } },
      },
      async (request) => {
        const { creatorId, period } = request.query;
        const { user } = request;
        if (user === null) throw new DomainError('session_unauthenticated', 'Connexion requise');
        if (user.role !== 'owner' && !user.creatorIds.includes(creatorId)) {
          throw new DomainError('creator_forbidden', 'Créatrice hors de ton périmètre');
        }
        const now = (deps.now ?? (() => new Date()))();
        const read = await deps.reader.read(creatorId, (timezone) => {
          // Her day: midnight in her time zone (`creators.timezone`).
          const dayStart = startOfLocalDay(now, timezone);
          return { now, dayStart, periodStart: periodStart(period, now, dayStart), voice: deps.voice };
        });
        if (read === undefined) throw new DomainError('creator_not_found', 'Créatrice introuvable');
        const telegram = await deps.telegram?.read(creatorId);
        return assembleDashboard({
          creatorId,
          period,
          facts: read.facts,
          window: read.window,
          budget: deps.budget(),
          isVoiceOk: deps.isVoiceOk(),
          telegram,
        });
      },
    );
    return Promise.resolve();
  };
}
