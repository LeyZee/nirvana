import { z } from 'zod';

/**
 * The desire score of a conversation (P3-12, glossary « Note de désir »): how hot the fan is, from 0 to 100, counted
 * by the agent's code from closed signals. The engine computes it; the conversation journal keeps each change
 * (`desire_scored`) and the conversation row projects the last one. The band is never stored apart from its score:
 * it is `desireBandOf(score)`, so the two cannot disagree.
 */

export const DESIRE_SCORE_MIN = 0;
export const DESIRE_SCORE_MAX = 100;

export const DesireScoreSchema = z.number().int().min(DESIRE_SCORE_MIN).max(DESIRE_SCORE_MAX);

/** Neutre (0 to 39), joueur (40 to 69), chaud (70 to 100). */
export const DESIRE_BANDS = ['neutral', 'playful', 'hot'] as const;
export const DesireBandSchema = z.enum(DESIRE_BANDS);
export type DesireBand = z.infer<typeof DesireBandSchema>;

/** The lowest score of each band above `neutral`. */
export const DESIRE_BAND_FLOORS = { playful: 40, hot: 70 } as const;

export function desireBandOf(score: number): DesireBand {
  if (score >= DESIRE_BAND_FLOORS.hot) return 'hot';
  if (score >= DESIRE_BAND_FLOORS.playful) return 'playful';
  return 'neutral';
}

/** One signal that moved the score, by its closed name in the agent's list (never the fan's words). */
export const DesireSignalSchema = z.string().min(1).max(64);

/** At most this many signals are kept per change. */
export const DESIRE_SIGNALS_MAX = 20;
