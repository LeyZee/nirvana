/** Public entry point of the `persona` module (ADR 0002). Other modules import this file only. */
import type { Database } from '@nirvana/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { CreatorDirectory } from './domain/ports';
import { createDrizzleCreatorDirectory } from './infra/db/creator-directory';
import { createCreatorRoutes, type RequireRole } from './infra/http/routes';

export interface PersonaModule {
  readonly name: 'persona';
  /** The creators (one creator, one persona): listed by the dashboard, created by `pnpm creator:create`. */
  readonly creators: CreatorDirectory;
  /** Mounted under `/v1` by the server. */
  readonly routes: FastifyPluginAsyncZod;
}

export interface PersonaDeps {
  /** Application role: `creators` is the tenant root and has no RLS of its own. */
  readonly db: Database;
  readonly requireRole: RequireRole;
}

export function createPersonaModule(deps: PersonaDeps): PersonaModule {
  const creators = createDrizzleCreatorDirectory(deps.db);
  return { name: 'persona', creators, routes: createCreatorRoutes(creators, deps.requireRole) };
}
