/**
 * The agent's single control (revue 08, ADR 0019): Automatique, Copilote or Arrêt, the same on the Dashboard and
 * in the bar. The server decides whether Automatique may open; the screen only says why it may not.
 */
export type AgentMode = 'auto' | 'copilot' | 'stop';

/** One condition of ADR 0019 that still keeps Automatique closed, with the figures the server measured. */
type GateCondition =
  | { readonly kind: 'live_rate'; readonly value: number | null; readonly target: number }
  | { readonly kind: 'decided_drafts'; readonly value: number; readonly target: number }
  | { readonly kind: 'blind_test' };

/**
 * Whether Automatique may open, as the server computes it (ADR 0019): live rate at the target, on enough decided
 * drafts of the active voice version, and the blind test passed. `missing` is empty when `open`.
 */
export interface AutomaticGate {
  readonly open: boolean;
  readonly missing: readonly GateCondition[];
}

export const MODE_LABEL: Readonly<Record<AgentMode, string>> = {
  auto: 'Automatique',
  copilot: 'Copilote',
  stop: 'Arrêt',
};

/** The order of the control, left to right. */
export const MODES: readonly AgentMode[] = ['auto', 'copilot', 'stop'];

const percent = (value: number): string => `${String(value)}\u00a0%`;

/** One sentence per missing condition, in the order of the ADR. */
export function missingLines(gate: AutomaticGate): string[] {
  return gate.missing.map((condition) => {
    switch (condition.kind) {
      case 'live_rate':
        return condition.value === null
          ? `Taux en réel : pas encore mesuré, il faut ${percent(condition.target)}.`
          : `Taux en réel : ${percent(condition.value)}, il faut ${percent(condition.target)}.`;
      case 'decided_drafts':
        return `Brouillons validés ou refusés par les chatteurs : ${String(condition.value)} sur ${String(condition.target)}.`;
      case 'blind_test':
        return 'Test à l’aveugle avec la créatrice : pas encore validé.';
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

/** The bar's read-only pill: what the agent does right now, in a word, and its tone. */
export function pillOf(mode: AgentMode): {
  readonly label: string;
  readonly tone: 'ok' | 'bad';
  readonly live: boolean;
} {
  switch (mode) {
    case 'auto':
      return { label: 'Automatique', tone: 'ok', live: true };
    case 'copilot':
      return { label: 'Copilote', tone: 'ok', live: true };
    case 'stop':
      return { label: 'Arrêté', tone: 'bad', live: false };
  }
}
