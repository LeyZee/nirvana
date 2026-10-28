import type { PayPeriod } from '@nirvana/contracts';
import type { Database } from '@nirvana/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { createPayrollReads } from './application/periods';
import { createRecalculation, type RecalculationOutcome } from './application/recalculation';
import type { JobLogger } from './domain/ports';
import { createDrizzlePayrollJobStore, type PayInputReads } from './infra/job-store';
import { createDrizzlePayrollReadStore } from './infra/read-store';
import { createPayrollRoutes, type RequireRole } from './infra/routes';

/** Public entry point of the `payroll` module (EQ-04, ADR 0002). Other modules import this file only. */
export interface PayrollModule {
  readonly name: 'payroll';
  /** Mounted under `/v1` by the server: `/payroll/…` (contracts `payroll.ts`). */
  routes(requireRole: RequireRole): FastifyPluginAsyncZod;
  readonly jobs: {
    /**
     * `payroll.recalculate` (ADR 0032): the drafts of a period, and those of the team's first open period when it is
     * closed. A period that cannot be computed yet (a missing rate) is logged, never guessed.
     */
    readonly recalculate: (period: PayPeriod, logger: JobLogger) => Promise<RecalculationOutcome[]>;
    /** `payroll.recalculate_open`: every open period up to the current one, each hour. */
    readonly recalculateOpen: (logger: JobLogger) => Promise<RecalculationOutcome[]>;
  };
}

export interface PayrollDeps {
  /** Application role: what a member reads runs through `withMember`. */
  readonly db: Database;
  /** Admin role, for the jobs only: they read every creator's reports (ADR 0023 § Paie). */
  readonly adminDb: Database;
  /** What pay reads of the planning and the team, from their `index.ts`. */
  readonly reads: PayInputReads;
  readonly now?: () => Date;
}

export function createPayrollModule(deps: PayrollDeps): PayrollModule {
  const now = deps.now ?? (() => new Date());
  const jobStore = createDrizzlePayrollJobStore(deps.adminDb, deps.reads, now);
  const reads = createPayrollReads(createDrizzlePayrollReadStore(deps.db), now);
  return {
    name: 'payroll',
    routes: (requireRole) => createPayrollRoutes(reads, requireRole),
    jobs: {
      recalculate: (period, logger) => createRecalculation(jobStore, logger, now).recalculate(period),
      recalculateOpen: (logger) => createRecalculation(jobStore, logger, now).recalculateOpen(),
    },
  };
}
