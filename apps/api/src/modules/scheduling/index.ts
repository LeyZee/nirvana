import type { CreatorId } from '@nirvana/contracts';
import type { Database } from '@nirvana/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { makeShifts } from './application/make-shifts';
import { createSchedulingService } from './application/scheduling';
import type { CreatorDirectory, JobLogger, OnShift } from './domain/ports';
import { createDrizzlePlanningAdmin, createDrizzlePlanningStore } from './infra/planning-store';
import { createSchedulingRoutes, type RequireRole } from './infra/routes';

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
  };
}

export interface SchedulingDeps {
  /** Application role: the planning's policies run through `withMember` and `withTenantMember`. */
  readonly db: Database;
  /**
   * Admin role, for what crosses creators only: a member's own shifts on every creator (Aujourd'hui), the creator of
   * a shift or template before entering her, the shift in the way of a conflict, and the job.
   */
  readonly adminDb: Database;
  /** The creators that exist, with their names (the `persona` module's directory). */
  readonly creators: CreatorDirectory;
  readonly now?: () => Date;
}

export function createSchedulingModule(deps: SchedulingDeps): SchedulingModule {
  const now = deps.now ?? (() => new Date());
  const admin = createDrizzlePlanningAdmin(deps.adminDb);
  const service = createSchedulingService(
    createDrizzlePlanningStore(deps.db, deps.adminDb),
    admin,
    deps.creators,
    now,
  );
  return {
    name: 'scheduling',
    onShift: (creatorId, at) => admin.onShiftUnscoped(creatorId, at),
    routes: (requireRole) => createSchedulingRoutes(service, requireRole),
    jobs: { makeShifts: (logger) => makeShifts(admin, logger, now()) },
  };
}
