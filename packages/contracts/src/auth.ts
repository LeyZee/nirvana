import { z } from 'zod';

/** Dashboard roles (security.md §6): `owner` administers, `operator` chats, `creator` sees her own (phase 5). */
export const UserRoleSchema = z.enum(['owner', 'operator', 'creator']);
export type UserRole = z.infer<typeof UserRoleSchema>;

/** `GET /v1/me`: who is signed in. Never carries the session token. */
export const CurrentUserSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  name: z.string(),
  role: UserRoleSchema,
  creatorIds: z.array(z.uuid()),
});
export type CurrentUser = z.infer<typeof CurrentUserSchema>;

/**
 * Error code of a sensitive action asked from a session opened too long ago (ADR 0016: AI keys): the page asks for
 * the password again (a new sign-in) and retries.
 */
export const REAUTHENTICATION_ERROR_CODE = 'reauthentication_forbidden';
