/** Public entry point of the `supervision` module (ADR 0002). Other modules import this file only. */
import type { Database } from '@nirvana/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { createDashboardRoutes, type DashboardRouteDeps } from './infra/http/dashboard-routes';
import { createDashboardReader } from './infra/views/dashboard-reader';

export interface SupervisionModule {
  readonly name: 'supervision';
  /** `GET /v1/dashboard`, mounted under `/v1` by the server. */
  readonly routes: FastifyPluginAsyncZod;
}

export interface SupervisionDeps extends Omit<DashboardRouteDeps, 'reader'> {
  /** Application role: the Dashboard reads in tenant transactions (RLS). */
  readonly db: Database;
}

export function createSupervisionModule(deps: SupervisionDeps): SupervisionModule {
  return {
    name: 'supervision',
    routes: createDashboardRoutes({ ...deps, reader: createDashboardReader(deps.db) }),
  };
}
