/** Public entry point of the `persona` module (ADR 0002). Other modules import this file only. */
import type { Database } from '@nirvana/db';
import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { CreatorDirectory } from './domain/ports';
import type { PersonaVersionStore } from './domain/versions';
import { createDrizzleCreatorDirectory } from './infra/db/creator-directory';
import { createDrizzlePersonaVersionStore } from './infra/db/persona-version-store';
import { createPersonaRoutes } from './infra/http/persona-routes';
import { createCreatorRoutes, type RequireRole } from './infra/http/routes';

export interface PersonaModule {
  readonly name: 'persona';
  /** The creators (one creator, one persona): listed by the dashboard, created by `pnpm creator:create`. */
  readonly creators: CreatorDirectory;
  /** Her persona versions: saved from the dashboard, loaded and activated by `pnpm persona:load`. */
  readonly versions: PersonaVersionStore;
  /** Mounted under `/v1` by the server: `/creators` and her `/agent-hours`, and each creator's `/persona` with its versions. */
  readonly routes: FastifyPluginAsyncZod;
}

export interface PersonaDeps {
  /** Application role: `creators` is the tenant root and has no RLS of its own. */
  readonly db: Database;
  readonly requireRole: RequireRole;
  /** A recent sign-in, for a change of her hours (P3-14). */
  readonly recentLogin: preHandlerAsyncHookHandler;
}

export function createPersonaModule(deps: PersonaDeps): PersonaModule {
  const creators = createDrizzleCreatorDirectory(deps.db);
  const creatorRoutes = createCreatorRoutes(creators, deps.requireRole, deps.recentLogin);
  const versions = createDrizzlePersonaVersionStore(deps.db);
  const personaRoutes = createPersonaRoutes(versions, deps.requireRole);
  return {
    name: 'persona',
    creators,
    versions,
    routes: async (app) => {
      await app.register(creatorRoutes);
      await app.register(personaRoutes);
    },
  };
}
