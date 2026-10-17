import { CreatorListSchema, type CreatorSummary } from '@nirvana/contracts';
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
