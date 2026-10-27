import type { CreatorId } from '@nirvana/contracts';
import type { Database } from '@nirvana/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { createLeaveService } from './application/leaves';
import { makeShifts } from './application/make-shifts';
import { createSchedulingService } from './application/scheduling';
import { createSwapService } from './application/swaps';
import type { CreatorDirectory, JobLogger, OnShift } from './domain/ports';
import { createDrizzleColleagueReads } from './infra/colleague-reads';
import { createDrizzleLeaveStore } from './infra/leave-store';
import { createDrizzlePlanningAdmin, createDrizzlePlanningStore } from './infra/planning-store';
import { createSchedulingRoutes, type RequireRole } from './infra/routes';
import { createDrizzleSwapStore } from './infra/swap-store';

/** Public entry point of the `scheduling` module (EQ-02, ADR 0002). Other modules import this file only. */
export interface SchedulingModule {
  readonly name: 'scheduling';
  /** Mounted under `/v1` by the server: `/scheduling/…` (contract `scheduling.ts`). */
  routes(requireRole: RequireRole): FastifyPluginAsyncZod;
  /**
   * `onShift` (contract `scheduling.ts`): who is on shift on the creator's accounts at `at`, without the margin, read
   * from the database at each call. For the routing of a « sale » handover (EQ-13), which never goes to a chatter who
   * is only in their margin.
   */
  onShift(creatorId: CreatorId, at: Date): Promise<OnShift[]>;
  readonly jobs: {
    /**
     * `scheduling.make_shifts`: the shifts every running template makes ahead; how many were new. A template that
     * fails is logged (`warn`) and tried again next hour, the others are made.
     */
    readonly makeShifts: (logger: JobLogger) => Promise<number>;
    /**
     * `scheduling.lapse_swaps` (ADR 0031): the proposals whose shift started, was cancelled, or changed hands or
     * hours lapse; how many. Enqueued after each acceptance and revert, and every quarter of an hour.
     */
    readonly lapseSwaps: () => Promise<number>;
  };
}

export interface SchedulingDeps {
  /** Application role: the planning's policies run through `withMember` and `withTenantMember`. */
  readonly db: Database;
  /**
   * Admin role, for what crosses creators only: a member's own shifts on every creator (Aujourd'hui), the creator of
   * a shift or template before entering her, the shift in the way of a conflict, a colleague's name, colour and
   * shifts once the policies let the reader see them (ADR 0031), and the jobs.
   */
  readonly adminDb: Database;
  /** The creators that exist, with their names (the `persona` module's directory). */
  readonly creators: CreatorDirectory;
  readonly now?: () => Date;
}

export function createSchedulingModule(deps: SchedulingDeps): SchedulingModule {
  const now = deps.now ?? (() => new Date());
  const admin = createDrizzlePlanningAdmin(deps.adminDb);
  const colleagues = createDrizzleColleagueReads(deps.adminDb);
  const services = {
    scheduling: createSchedulingService(
      createDrizzlePlanningStore(deps.db, deps.adminDb),
      admin,
      deps.creators,
      now,
    ),
    leaves: createLeaveService(
      createDrizzleLeaveStore(deps.db),
      async () => (await deps.creators.list()).map((creator) => creator.id),
      now,
    ),
    swaps: createSwapService(
      createDrizzleSwapStore(deps.db, deps.adminDb, colleagues),
      colleagues,
      deps.creators,
      now,
    ),
  };
  return {
    name: 'scheduling',
    onShift: (creatorId, at) => admin.onShiftUnscoped(creatorId, at),
    routes: (requireRole) => createSchedulingRoutes(services, requireRole),
    jobs: {
      makeShifts: (logger) => makeShifts(admin, logger, now()),
      lapseSwaps: () => colleagues.lapseSwapsUnscoped(now()),
    },
  };
}
