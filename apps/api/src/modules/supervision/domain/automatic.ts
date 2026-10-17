import type { AutomaticMissing } from '@nirvana/contracts';

/**
 * Taux en réel and the rule that opens Automatique (ADR 0019). The thresholds are constants of the code, never
 * settings of a prompt; the server applies them and the screen only shows them.
 */
export const LIVE_TARGET = 0.8;
const LIVE_WINDOW = 200;
const MIN_DECIDED = 100;

/** A draft a chatter approved or rejected; `asIs` when she sent it without changing a word. */
export interface DecidedDraft {
  readonly asIs: boolean;
}

export interface LiveRateReading {
  /** 0 to 1; undefined before the first decided draft. */
  readonly rate: number | undefined;
  readonly decided: number;
}

/** Drafts approved without an edit among the last 200 decided, newest first, of one creator and voice version. */
export function liveRate(newestFirst: readonly DecidedDraft[]): LiveRateReading {
  const window = newestFirst.slice(0, LIVE_WINDOW);
  const asIs = window.filter((d) => d.asIs).length;
  return { rate: window.length === 0 ? undefined : asIs / window.length, decided: window.length };
}

/** Automatique opens when the live rate reaches 80 % on at least 100 decided drafts and the blind test passed. */
export function automaticGate(input: {
  readonly reading: LiveRateReading;
  readonly blindTestPassed: boolean;
}): { readonly open: boolean; readonly missing: readonly AutomaticMissing[] } {
  const { rate, decided } = input.reading;
  const missing: AutomaticMissing[] = [];
  if (rate === undefined || rate < LIVE_TARGET) missing.push('live_rate');
  if (decided < MIN_DECIDED) missing.push('decided');
  if (!input.blindTestPassed) missing.push('blind_test');
  return { open: missing.length === 0, missing };
}
