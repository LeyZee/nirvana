import type { ProviderNextAction, ProviderStatus } from '@nirvana/contracts';

import { GUIDES, isDashboardProvider, type DashboardProvider } from './guide';

/** Small view rules of the Services section, kept out of the components so they are tested. */

/** « vérifié à l'instant », « vérifié il y a 12 min », « vérifié il y a 3 h ». */
export function checkedAgo(verifiedAt: string | null, now: Date): string | null {
  if (verifiedAt === null) return null;
  const minutes = Math.floor((now.getTime() - new Date(verifiedAt).getTime()) / 60_000);
  if (minutes < 1) return 'vérifié à l’instant';
  if (minutes < 60) return `vérifié il y a ${String(minutes)} min`;
  return `vérifié il y a ${String(Math.floor(minutes / 60))} h`;
}

export type Segment = 'on' | 'bad' | 'off';

/** One segment per service in the progress bar under the next action. */
export function segments(services: readonly ProviderStatus[]): Segment[] {
  return services.map((s) =>
    s.state === 'needs_reconnect' ? 'bad' : s.state === 'not_connected' ? 'off' : 'on',
  );
}

/** The label of the sheet's last button: the next service still to connect, or « Terminé ». */
export function nextAfter(
  services: readonly ProviderStatus[],
  current: DashboardProvider,
): { label: string; provider: DashboardProvider | null } {
  const next = services.find((s) => s.provider !== current && s.state === 'not_connected');
  if (next === undefined || !isDashboardProvider(next.provider)) return { label: 'Terminé', provider: null };
  return { label: `Continuer avec ${GUIDES[next.provider].name}`, provider: next.provider };
}

export type Dot = 'ok' | 'off' | 'must' | 'low' | 'bad' | 'busy';

export function dotOf(status: ProviderStatus, isVerifying: boolean): Dot {
  if (isVerifying) return 'busy';
  switch (status.state) {
    case 'connected':
      return 'ok';
    case 'low_credit':
      return 'low';
    case 'needs_reconnect':
      return 'bad';
    case 'not_connected':
      return isDashboardProvider(status.provider) && GUIDES[status.provider].isRequired ? 'must' : 'off';
  }
}

export function dotOfNext(next: ProviderNextAction): Dot {
  switch (next.kind) {
    case 'all_set':
      return 'ok';
    case 'replace_key':
      return 'bad';
    case 'top_up':
      return 'low';
    case 'connect':
      return isDashboardProvider(next.provider) && GUIDES[next.provider].isRequired ? 'must' : 'off';
  }
}
