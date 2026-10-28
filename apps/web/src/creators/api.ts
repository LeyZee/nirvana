import {
  ApiErrorSchema,
  CreatorListSchema,
  CreatorSummarySchema,
  type CreatorId,
  type CreatorSummary,
} from '@nirvana/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';

/** `GET /v1/creators`: the creators the signed-in user may open, parsed with the contract. */
export async function fetchCreators(): Promise<CreatorSummary[]> {
  const response = await fetch('/v1/creators', { credentials: 'include' });
  if (!response.ok) throw new Error(`GET /v1/creators: ${String(response.status)}`);
  return CreatorListSchema.parse(await response.json()).creators;
}

/** The creators, read once and shared by every screen that lists them (Créatrices, Suivi). */
export function useCreators(): UseQueryResult<CreatorSummary[]> {
  return useQuery({ queryKey: ['creators'], queryFn: fetchCreators });
}

export type CreateResult =
  | { readonly kind: 'created'; readonly creator: CreatorSummary }
  /** 400 on her zone: the browser offered it, the server does not know it. */
  | { readonly kind: 'unknown_zone' }
  /** Any other 400: what was typed is not taken as it is. */
  | { readonly kind: 'invalid' }
  /** 409: this form's id already made a creator under another name. */
  | { readonly kind: 'conflict' }
  /** 401: the session ended, signing in again is the way out. */
  | { readonly kind: 'expired' }
  | { readonly kind: 'failed' };

/** `details` of a 400 `request_invalid`, as the API's error handler writes it. */
const RefusedFieldsSchema = z.object({ fields: z.array(z.object({ path: z.string() })) });

/**
 * `POST /v1/creators` (owner only): a new creator, her persona still to write. `id` is chosen once per form: sent twice
 * (double click, retry), the server answers the creator it already made.
 */
export async function createCreator(
  id: CreatorId,
  displayName: string,
  timezone: string,
): Promise<CreateResult> {
  const response = await fetch('/v1/creators', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, displayName, timezone }),
  });
  if (response.status === 201) {
    return { kind: 'created', creator: CreatorSummarySchema.parse(await response.json()) };
  }
  if (response.status === 401) return { kind: 'expired' };
  if (response.status === 409) return { kind: 'conflict' };
  if (response.status !== 400) return { kind: 'failed' };
  // `request_invalid` names each refused field by its path (`/timezone`).
  const error = ApiErrorSchema.safeParse(await response.json().catch(() => null));
  const fields = RefusedFieldsSchema.safeParse(error.data?.error.details);
  const onZone = fields.success && fields.data.fields.some((field) => field.path === '/timezone');
  return onZone ? { kind: 'unknown_zone' } : { kind: 'invalid' };
}
