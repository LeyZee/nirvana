import {
  CreatorListSchema,
  CreatorSummarySchema,
  type CreatorId,
  type CreatorSummary,
} from '@nirvana/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

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
  | { readonly kind: 'invalid' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'failed' };

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
  if (response.status === 409) return { kind: 'conflict' };
  return response.status === 400 ? { kind: 'invalid' } : { kind: 'failed' };
}
