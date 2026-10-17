import type { CreatorId, FanId, PlatformAccountId } from '@nirvana/contracts';

/** A fan as the rest of the system sees it; facts and summaries come with P3-02. */
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
