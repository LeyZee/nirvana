import { z } from 'zod';

const TierSchema = z.object({
  min_scenarios: z.number().int().positive(),
  criteria: z.record(z.string(), z.number()),
});
const ThresholdsSchema = z.object({ smoke: TierSchema, full: TierSchema });

export function readThresholds(source: string): z.infer<typeof ThresholdsSchema> {
  return ThresholdsSchema.parse(JSON.parse(source));
}

const SUITES = ['scenarios', 'adversarial', 'regression'] as const;

/** Scenario files (YAML) in the three suites; anything else (a README, a .gitkeep) does not count. */
export function countScenarios(list: (suite: (typeof SUITES)[number]) => readonly string[]): number {
  return SUITES.flatMap((suite) => list(suite)).filter((f) => /\.ya?ml$/.test(f)).length;
}
