/**
 * The agent's single control (revue 08, ADR 0019): Automatique, Copilote or Arrêt, the same on the Dashboard and
 * in the bar. The server decides whether Automatique may open; the screen only says why it may not.
 */
import type { AgentMode, AutomaticMissing } from '@nirvana/contracts';

export type { AgentMode };

/**
 * Whether Automatique may open, as the server computes it (ADR 0019, `GET /v1/dashboard`): live rate at the target,
 * on enough decided drafts of the active voice version, and the blind test passed. Each missing condition carries
 * the figures the server measured; `missing` is empty when `open`.
 */
export interface AutomaticGate {
  readonly open: boolean;
  readonly missing: readonly AutomaticMissing[];
}

export const MODE_LABEL: Readonly<Record<AgentMode, string>> = {
  auto: 'Automatique',
  copilot: 'Copilote',
  stop: 'Arrêt',
};

/** The order of the control, left to right. */
export const MODES: readonly AgentMode[] = ['auto', 'copilot', 'stop'];

/** « 64,5 % »: the server rounds to the tenth, the screen writes it the French way. */
export const percent = (value: number): string =>
  `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}\u00a0%`;

/** One tip row per missing condition, in the order of the ADR: what is measured, and where it stands. */
export function missingRows(gate: AutomaticGate): [label: string, value: string][] {
  return gate.missing.map((condition): [string, string] => {
    switch (condition.kind) {
      case 'live_rate':
        return [
          'Taux en réel',
          condition.value === null
            ? `pas encore mesuré, ${percent(condition.target)} visés`
            : `${percent(condition.value)} sur ${percent(condition.target)}`,
        ];
      case 'decided_drafts':
        return [
          'Brouillons validés ou refusés',
          `${String(condition.value)} sur ${String(condition.target)}`,
        ];
      case 'blind_test':
        return ['Test à l’aveugle', 'pas encore validé'];
    }
  });
}

/** Whether an option can be picked: Automatique only when the server opened it, the others always. */
export function isSelectable(mode: AgentMode, gate: AutomaticGate): boolean {
  return mode !== 'auto' || gate.open;
}

/**
 * The option the arrow keys move to from `from` (radio group pattern): the next selectable one in `step`
 * direction, wrapping around, skipping a closed Automatique.
 */
export function nextMode(from: AgentMode, step: 1 | -1, gate: AutomaticGate): AgentMode {
  const start = MODES.indexOf(from);
  for (let offset = 1; offset <= MODES.length; offset++) {
    const candidate = MODES[(start + step * offset + MODES.length * offset) % MODES.length];
    if (candidate !== undefined && isSelectable(candidate, gate)) return candidate;
  }
  return from;
}

/**
 * The bar's read-only pill: what the agent does right now, in a word, and its tone. `null` when the server has not
 * said: the pill never shows a mode it does not know.
 */
export function pillOf(mode: AgentMode | null): {
  readonly label: string;
  readonly tone: 'ok' | 'bad' | 'unknown';
  readonly live: boolean;
} {
  switch (mode) {
    case null:
      return { label: 'Inconnu', tone: 'unknown', live: false };
    case 'auto':
      return { label: 'Automatique', tone: 'ok', live: true };
    case 'copilot':
      return { label: 'Copilote', tone: 'ok', live: true };
    case 'stop':
      return { label: MODE_LABEL.stop, tone: 'bad', live: false };
  }
}
