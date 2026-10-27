import {
  FanIdSchema,
  newId,
  type CreatorId,
  type FanFlagName,
  type FanFlags,
  type FanId,
} from '@nirvana/contracts';

import { planFacts, selectActiveFacts, type FactProposal, type StoredFact } from '../domain/facts';
import type { Fan, FanSighting, FanStore, FactStore, FlagStore } from '../domain/fan';
import { withFlag, withFlagIfUnset, withoutFlag, type FlagAuthor, type FlagChange } from '../domain/flags';

/** Who changes a limit and why; the author is the event's actor (P3-02). */
interface FlagCommand {
  readonly author: FlagAuthor;
  readonly reason?: string;
  readonly correlationId: string;
}

export interface FansService {
  upsertFanByPlatformId(sighting: FanSighting): Promise<Fan>;
  getFan(creatorId: CreatorId, id: FanId): Promise<Fan | null>;
  /** Writes what is new in these proposals (append-only, `planFacts`) and returns the facts written. */
  proposeFacts(creatorId: CreatorId, fanId: FanId, proposals: readonly FactProposal[]): Promise<StoredFact[]>;
  /** What the context gets: active facts by category and confidence, 40 at most. */
  activeFacts(creatorId: CreatorId, fanId: FanId): Promise<StoredFact[]>;
  /** His limits (`fans.flags`), read by the policy before any offer. */
  flags(creatorId: CreatorId, fanId: FanId): Promise<FanFlags>;
  /** Sets one limit; writes `fan_flag_set` only when it changed. Returns his limits after. */
  setFlag(creatorId: CreatorId, fanId: FanId, change: FlagChange, command: FlagCommand): Promise<FanFlags>;
  /** Sets one limit only where none of that name is set (a human's freeze keeps its reason). Returns his limits after. */
  setFlagIfUnset(
    creatorId: CreatorId,
    fanId: FanId,
    change: FlagChange,
    command: FlagCommand,
  ): Promise<FanFlags>;
  /** Lifts one limit; writes `fan_flag_cleared` only when it was set. Returns his limits after. */
  clearFlag(creatorId: CreatorId, fanId: FanId, flag: FanFlagName, command: FlagCommand): Promise<FanFlags>;
}

export function createFansService(
  store: FanStore,
  facts: FactStore,
  flagStore: FlagStore,
  now: () => Date = () => new Date(),
): FansService {
  return {
    upsertFanByPlatformId: (sighting) => store.upsert(sighting, newId(FanIdSchema)),
    getFan: (creatorId, id) => store.get(creatorId, id),
    proposeFacts: (creatorId, fanId, proposals) =>
      facts.write(creatorId, fanId, (current) => planFacts(current, proposals, now())),
    activeFacts: async (creatorId, fanId) => selectActiveFacts(await facts.current(creatorId, fanId), now()),
    flags: (creatorId, fanId) => flagStore.read(creatorId, fanId),
    setFlag: (creatorId, fanId, change, command) => {
      return flagStore.change(creatorId, fanId, (flags) => withFlag(flags, change), {
        type: 'fan_flag_set',
        flag: change.flag,
        ...command,
      });
    },
    setFlagIfUnset: (creatorId, fanId, change, command) => {
      return flagStore.change(creatorId, fanId, (flags) => withFlagIfUnset(flags, change), {
        type: 'fan_flag_set',
        flag: change.flag,
        ...command,
      });
    },
    clearFlag: (creatorId, fanId, flag, command) => {
      return flagStore.change(creatorId, fanId, (flags) => withoutFlag(flags, flag), {
        type: 'fan_flag_cleared',
        flag,
        ...command,
      });
    },
  };
}
