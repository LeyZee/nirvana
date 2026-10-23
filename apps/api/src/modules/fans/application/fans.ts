import { FanIdSchema, newId, type CreatorId, type FanId } from '@nirvana/contracts';

import { planFacts, selectActiveFacts, type FactProposal, type StoredFact } from '../domain/facts';
import type { Fan, FanSighting, FanStore, FactStore } from '../domain/fan';

export interface FansService {
  upsertFanByPlatformId(sighting: FanSighting): Promise<Fan>;
  getFan(creatorId: CreatorId, id: FanId): Promise<Fan | null>;
  /** Writes what is new in these proposals (append-only, `planFacts`) and returns the facts written. */
  proposeFacts(creatorId: CreatorId, fanId: FanId, proposals: readonly FactProposal[]): Promise<StoredFact[]>;
  /** What the context gets: active facts by category and confidence, 40 at most. */
  activeFacts(creatorId: CreatorId, fanId: FanId): Promise<StoredFact[]>;
}

export function createFansService(
  store: FanStore,
  facts: FactStore,
  now: () => Date = () => new Date(),
): FansService {
  return {
    upsertFanByPlatformId: (sighting) => store.upsert(sighting, newId(FanIdSchema)),
    getFan: (creatorId, id) => store.get(creatorId, id),
    proposeFacts: (creatorId, fanId, proposals) =>
      facts.write(creatorId, fanId, (current) => planFacts(current, proposals, now())),
    activeFacts: async (creatorId, fanId) => selectActiveFacts(await facts.current(creatorId, fanId), now()),
  };
}
