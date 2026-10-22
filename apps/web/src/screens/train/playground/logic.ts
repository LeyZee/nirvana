import type { PlaygroundAnswer, PlaygroundState } from '@nirvana/contracts';

import { isHandoff } from './model';

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

/** What a fan spent, in euros as on Reveal and on the Dashboard. */
export function money(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}\u00a0€`;
}

/**
 * What the models cost, in euros like every amount on screen (ADR 0011). One answer costs a fraction of a
 * cent: it says so rather than rounding to a misleading « 0,00 € ».
 */
export function euros(value: number): string {
  if (value > 0 && value < 0.01) return 'moins de 0,01\u00a0€';
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0€`;
}

/** Her answer is stored as one turn; each line is a bubble. */
export function bubblesOf(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** Something to look at in « Pourquoi »: it opens by itself only then. */
export function needsAttention(answer: PlaygroundAnswer | null): boolean {
  if (answer === null) return false;
  return (
    answer.isBlocked ||
    isHandoff(answer) ||
    (answer.trap?.signals.length ?? 0) > 0 ||
    (answer.brief?.risks.length ?? 0) > 0 ||
    answer.failure !== undefined
  );
}

/** Where the screen stands: which keys answer and which gesture is expected. */
type Step = 'busy' | 'handoff' | 'blocked' | 'rate' | 'edit' | 'reject' | 'lesson' | 'compare' | 'write';

export function stepOf(
  state: PlaygroundState | undefined,
  local: 'idle' | 'edit' | 'reject' | 'lesson' | 'compare',
  busy: boolean,
): Step {
  if (busy) return 'busy';
  if (local !== 'idle') return local;
  const pending = state?.pending ?? null;
  if (pending === null) return 'write';
  if (isHandoff(pending)) return 'handoff';
  if (pending.isBlocked) return 'blocked';
  return 'rate';
}

export function fanMessageCount(state: PlaygroundState): number {
  return state.history.filter((turn) => turn.from === 'fan').length;
}
