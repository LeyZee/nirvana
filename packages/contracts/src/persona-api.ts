import { z } from 'zod';

import { CreatorIdSchema, PersonaVersionIdSchema } from './ids';
import { PersonaSchema } from './persona';

/** Hex SHA-256 of a persona's canonical JSON (keys sorted): two equal personas have the same hash. */
export const ContentHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** One stored version of a creator's persona (ADR 0010), without its content. */
export const PersonaVersionSummarySchema = z.strictObject({
  id: PersonaVersionIdSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  contentHash: ContentHashSchema,
  /** The one the agent writes with; at most one per creator, set by the activation, never by the dashboard. */
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type PersonaVersionSummary = z.infer<typeof PersonaVersionSummarySchema>;

/**
 * `GET /v1/creators/:creatorId/persona`: her versions, newest first, and the content of the newest one, the one the
 * dashboard edits. `latest` is null while no version was ever stored.
 */
export const PersonaOverviewSchema = z.strictObject({
  creatorId: CreatorIdSchema,
  latest: z.strictObject({ summary: PersonaVersionSummarySchema, persona: PersonaSchema }).nullable(),
  versions: z.array(PersonaVersionSummarySchema),
});
export type PersonaOverview = z.infer<typeof PersonaOverviewSchema>;

/**
 * `POST /v1/creators/:creatorId/persona/versions` → 201 `PersonaVersionSummary`, never active. `basedOn` is the
 * hash of the version the edit started from (null for a first version): if another version was stored since, or
 * `persona.meta.version` is taken, the answer is 409 `persona_version_conflict` and nothing is stored.
 */
export const CreatePersonaVersionBodySchema = z.strictObject({
  persona: PersonaSchema,
  basedOn: ContentHashSchema.nullable(),
});
export type CreatePersonaVersionBody = z.infer<typeof CreatePersonaVersionBodySchema>;

/**
 * `POST /v1/creators/:creatorId/persona/versions/:versionId/activate` → 200 `PersonaVersionSummary`: makes that
 * version her only active one, the one the agent writes with (an audited event, ADR 0010). Activating the active
 * version changes nothing; a version that is not hers is 404 `persona_version_not_found`.
 */
export const ActivatePersonaVersionParamsSchema = z.strictObject({
  creatorId: CreatorIdSchema,
  versionId: PersonaVersionIdSchema,
});
export type ActivatePersonaVersionParams = z.infer<typeof ActivatePersonaVersionParamsSchema>;
