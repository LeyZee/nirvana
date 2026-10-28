import { z } from 'zod';

import { CreatorIdSchema } from './ids';
import { TimezoneSchema } from './persona';

/** One creator as the dashboard lists her (`GET /v1/creators`). One creator, one persona. */
export const CreatorSummarySchema = z.object({
  id: CreatorIdSchema,
  displayName: z.string().min(1),
  timezone: z.string().min(1),
});
export type CreatorSummary = z.infer<typeof CreatorSummarySchema>;

/** `GET /v1/creators`: an owner gets every creator, anyone else the creators of their account. */
export const CreatorListSchema = z.object({ creators: z.array(CreatorSummarySchema) });
export type CreatorList = z.infer<typeof CreatorListSchema>;

/** `pnpm creator:create`: the creator's name as fans see it, and the zone her day and night follow. */
export const NewCreatorSchema = z.object({
  /** Chosen by the page once per form: a second click, or a replay, finds the creator the first one made. */
  id: CreatorIdSchema.optional(),
  displayName: z.string().trim().min(1).max(80),
  timezone: TimezoneSchema.default('Europe/Paris'),
});
export type NewCreator = z.input<typeof NewCreatorSchema>;
