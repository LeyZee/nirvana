import type { Answer, Destination, PlaygroundState, Verdict } from './model';

/** Under 60 % the rate is red, under the target amber, at the target neutral: the eye goes where work is. */
export type RateTone = 'ok' | 'warn' | 'bad';

export function rateTone(rate: number | null, target: number): RateTone {
  if (rate === null || rate >= target) return 'ok';
  return rate >= 0.6 ? 'warn' : 'bad';
}

export function percent(rate: number | null): string {
  return rate === null ? '—' : `${String(Math.round(rate * 100))} %`;
}

/** « 6 min », « 3 h », « 3 j 2 h » */
export function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${String(Math.max(1, minutes))} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${String(days)} j` : `${String(days)} j ${String(rest)} h`;
}

export function clockAt(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone }).format(
    new Date(iso),
  );
}

export function money(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} $`;
}

export function usd(value: number): string {
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

/** Her answer is stored as one turn; each line is a bubble. */
export function bubblesOf(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** Something to look at in « Pourquoi »: it opens by itself only then. */
export function needsAttention(answer: Answer | undefined): boolean {
  if (answer === undefined) return false;
  return (
    answer.isBlocked ||
    (answer.handoff?.length ?? 0) > 0 ||
    (answer.trap?.length ?? 0) > 0 ||
    (answer.brief?.risks.length ?? 0) > 0 ||
    answer.failure !== undefined
  );
}

export function destinationFor(
  verdict: Verdict,
  reasons: PlaygroundState['reasons'],
): Destination | undefined {
  if (verdict.kind === 'validated') return undefined;
  if (verdict.kind === 'corrected') return 'voice_example';
  return reasons.find((r) => r.code === verdict.reason)?.destination ?? 'test';
}

/** Where the screen stands, for the single action proposed in the top bar. */
export type Step =
  'busy' | 'handoff' | 'blocked' | 'rate' | 'edit' | 'reject' | 'lesson' | 'compare' | 'write';

export function stepOf(
  state: PlaygroundState | undefined,
  local: 'idle' | 'edit' | 'reject' | 'lesson' | 'compare',
  busy: boolean,
): Step {
  if (busy) return 'busy';
  if (local !== 'idle') return local;
  const pending = state?.pending;
  if (pending === undefined) return 'write';
  if ((pending.handoff?.length ?? 0) > 0) return 'handoff';
  if (pending.isBlocked) return 'blocked';
  return 'rate';
}

export const STEP_ACTIONS: Readonly<Record<Step, string>> = {
  busy: 'L’agent rédige…',
  handoff: 'Juger le relais humain',
  blocked: 'Corriger la réponse bloquée',
  rate: 'Noter la réponse',
  edit: 'Garder ta version',
  reject: 'Dire pourquoi',
  lesson: 'Ranger la leçon',
  compare: 'Garder la meilleure',
  write: 'Écrire comme le fan',
};

export function fanMessageCount(state: PlaygroundState): number {
  return state.history.filter((turn) => turn.from === 'fan').length;
}
