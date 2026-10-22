import { CreatorListSchema, CreatorSummarySchema, type CreatorSummary } from '@nirvana/contracts';
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
  | { readonly kind: 'failed' };

/** `POST /v1/creators` (owner only): a new creator, her persona still to write. */
export async function createCreator(displayName: string, timezone: string): Promise<CreateResult> {
  const response = await fetch('/v1/creators', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName, timezone }),
  });
  if (response.status === 201) {
    return { kind: 'created', creator: CreatorSummarySchema.parse(await response.json()) };
  }
  return response.status === 400 ? { kind: 'invalid' } : { kind: 'failed' };
}
