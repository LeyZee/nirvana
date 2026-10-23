import type { Database } from '@nirvana/db';

import { createFansService, type FansService } from './application/fans';
import { factRetentionCutoff } from './domain/facts';
import { createDrizzleFactPurge } from './infra/fact-purge';
import { createDrizzleFactStore } from './infra/fact-store';
import { createDrizzleFanStore } from './infra/fan-store';
import { createDrizzleFlagStore } from './infra/flag-store';

export type { FactProposal } from './domain/facts';

/** Public entry point of the `fans` module (ADR 0002). Other modules import this file only. */
export interface FansModule extends FansService {
  readonly name: 'fans';
  readonly jobs: {
    /** `fans.purge_facts`, daily: facts of fans not seen for a year are dropped (security.md); returns how many. */
    purgeFacts(): Promise<number>;
  };
}

export interface FansDeps {
  /** Application role (RLS). */
  readonly db: Database;
  /** Owner role: the retention purge runs for every creator at once. */
  readonly adminDb: Database;
}

export function createFansModule(deps: FansDeps): FansModule {
  const purge = createDrizzleFactPurge(deps.adminDb);
  return {
    name: 'fans',
    ...createFansService(
      createDrizzleFanStore(deps.db),
      createDrizzleFactStore(deps.db),
      createDrizzleFlagStore(deps.db),
    ),
    jobs: { purgeFacts: () => purge.dropFactsOfFansLastSeenBefore(factRetentionCutoff(new Date())) },
  };
}
