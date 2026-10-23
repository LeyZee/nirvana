import type { CreatorId, FanId, PlatformAccountId } from '@nirvana/contracts';

import type { FactWrite, StoredFact } from './facts';

/** A fan as the rest of the system sees it; her facts about him are read apart (`activeFacts`). */
export interface Fan {
  readonly id: FanId;
  readonly creatorId: CreatorId;
  readonly platformAccountId: PlatformAccountId;
  readonly platformFanId: string;
  readonly displayName: string;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
}

export interface FanSighting {
  readonly creatorId: CreatorId;
  readonly platformAccountId: PlatformAccountId;
  /** The platform's own id for the fan, opaque to the core. */
  readonly platformFanId: string;
  readonly displayName: string;
  readonly seenAt: Date;
}

/** Storage port, implemented in `infra/` with `withTenant`. */
export interface FanStore {
  /** Creates the fan on first sight, otherwise refreshes its name and `last_seen_at`; idempotent. */
  upsert(sighting: FanSighting, newId: FanId): Promise<Fan>;
  get(creatorId: CreatorId, id: FanId): Promise<Fan | null>;
}

/** Storage of her facts about a fan, implemented in `infra/` with `withTenant`; append-only (data-model.md). */
export interface FactStore {
  /** Facts not superseded yet; the caller filters what has expired. */
  current(creatorId: CreatorId, fanId: FanId): Promise<StoredFact[]>;
  /** Plans and writes in one transaction, the fan locked so two writers never supersede the same fact twice. */
  write(
    creatorId: CreatorId,
    fanId: FanId,
    plan: (current: readonly StoredFact[]) => readonly FactWrite[],
  ): Promise<StoredFact[]>;
}
