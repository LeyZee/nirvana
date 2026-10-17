import { FanIdSchema, newId, type CreatorId, type FanId } from '@nirvana/contracts';

import type { Fan, FanSighting, FanStore } from '../domain/fan';

export interface FansService {
  upsertFanByPlatformId(sighting: FanSighting): Promise<Fan>;
  getFan(creatorId: CreatorId, id: FanId): Promise<Fan | null>;
}

export function createFansService(store: FanStore): FansService {
  return {
    upsertFanByPlatformId: (sighting) => store.upsert(sighting, newId(FanIdSchema)),
    getFan: (creatorId, id) => store.get(creatorId, id),
  };
}
