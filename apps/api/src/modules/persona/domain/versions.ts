import type {
  CreatePersonaVersionBody,
  CreatorId,
  PersonaOverview,
  PersonaVersionSummary,
} from '@nirvana/contracts';

/** A creator's persona versions (ADR 0010), read and written within her tenant. */
export interface PersonaVersionStore {
  overview(creatorId: CreatorId): Promise<PersonaOverview>;
  /** Stores a new version, never active; throws `PersonaVersionConflict` when `basedOn` is stale or the number is taken. */
  create(
    creatorId: CreatorId,
    body: CreatePersonaVersionBody,
    userId: string,
  ): Promise<PersonaVersionSummary>;
}
