import type { Database, Transaction } from '@nirvana/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { createTeamService } from './application/team';
import type { CreatorRoster, InvitationLinkDirectory } from './domain/ports';
import { createTeamRoutes, type RequireRole } from './infra/http/routes';
import { membersForPayUnscoped, type MemberForPay } from './infra/pay-reads';
import { createDrizzleTeamStore } from './infra/team-store';

/** Until the agency has a setting of its own (ADR 0023 § Paie): where « today » is read for rates and presets. */
const DEFAULT_AGENCY_TIME_ZONE = 'Europe/Paris';

/** Public entry point of the `team` module (ADR 0002). Other modules import this file only. */
export interface TeamModule {
  readonly name: 'team';
  /** Mounted under `/v1` by the server: `/team/members` and `/team/commission-presets` (EQ-01). */
  routes(requireRole: RequireRole): FastifyPluginAsyncZod;
  /**
   * What pay reads of the team (EQ-04), in pay's own transaction, given by the composition root: every member with
   * the rate in force on a day (pay's job, admin connection).
   */
  readonly pay: { readonly membersUnscoped: (tx: Transaction, day: string) => Promise<MemberForPay[]> };
}

export interface TeamDeps {
  /** Application role: the team's policies run through `withMember`. */
  readonly db: Database;
  /** The creators that exist, to refuse an unknown one in `creatorIds` (the `persona` module's directory). */
  readonly creators: CreatorRoster;
  /** Each member's link out (EQ-10), for when it stops working. */
  readonly invitationLinks: InvitationLinkDirectory;
  readonly now?: () => Date;
}

export function createTeamModule(deps: TeamDeps): TeamModule {
  const now = deps.now ?? (() => new Date());
  const service = createTeamService(
    createDrizzleTeamStore(deps.db, now),
    deps.creators,
    deps.invitationLinks,
    { agencyTimeZone: DEFAULT_AGENCY_TIME_ZONE, now },
  );
  return {
    name: 'team',
    routes: (requireRole) => createTeamRoutes(service, requireRole),
    pay: { membersUnscoped: membersForPayUnscoped },
  };
}
