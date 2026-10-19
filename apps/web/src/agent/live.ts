import { DashboardSchema, type Dashboard as ApiDashboard, type DashboardPeriod } from '@nirvana/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { fetchCreators } from '@/creators/api';

/** How often the Dashboard and the bar read the agent again, as Suivi does. */
const REFRESH_MS = 30_000;

/** `GET /v1/dashboard`: everything the Dashboard shows for one creator, computed by the server, parsed with the contract. */
async function fetchDashboard(creatorId: string, period: DashboardPeriod): Promise<ApiDashboard> {
  const query = new URLSearchParams({ creatorId, period });
  const response = await fetch(`/v1/dashboard?${query.toString()}`, { credentials: 'include' });
  if (!response.ok) throw new Error(`GET /v1/dashboard: ${String(response.status)}`);
  return DashboardSchema.parse(await response.json());
}

/**
 * What the server says, or why it says nothing: `loading` until it answers, `unavailable` when it fails (the screen
 * says so and shows no figure), `empty` when no creator exists yet (first launch: the sample, marked as such).
 */
export type LiveDashboard =
  | { readonly kind: 'loading' }
  | { readonly kind: 'live'; readonly data: ApiDashboard }
  | { readonly kind: 'unavailable'; readonly creatorName: string | null }
  | { readonly kind: 'empty' };

/**
 * The Dashboard of the first creator (the screen has no creator picker yet: Messa is the only one), shared by the
 * Dashboard and the bar's pill through the query cache. A failed read is never covered by an older answer: the
 * screen says the server does not answer until it does again.
 */
export function useLiveDashboard(period: DashboardPeriod = 'day'): LiveDashboard {
  const creators = useQuery({
    queryKey: ['creators'],
    queryFn: fetchCreators,
    // Read again while it fails, so the page comes back on its own once the server does.
    refetchInterval: (query) => (query.state.status === 'error' ? REFRESH_MS : false),
  });
  const creator = creators.data?.[0];
  const dashboard = useQuery({
    queryKey: ['dashboard', creator?.id, period],
    queryFn: () => fetchDashboard(creator?.id ?? '', period),
    enabled: creator !== undefined,
    refetchInterval: REFRESH_MS,
    // A new period keeps the page on the last answer while it is read: no flash back to loading.
    placeholderData: keepPreviousData,
    // One retry, then the page says the server does not answer: a server down must not leave it loading.
    retry: 1,
  });
  if (creators.isError) return { kind: 'unavailable', creatorName: creator?.displayName ?? null };
  if (creators.isSuccess && creator === undefined) return { kind: 'empty' };
  if (dashboard.isError) return { kind: 'unavailable', creatorName: creator?.displayName ?? null };
  if (dashboard.data !== undefined) return { kind: 'live', data: dashboard.data };
  return { kind: 'loading' };
}
