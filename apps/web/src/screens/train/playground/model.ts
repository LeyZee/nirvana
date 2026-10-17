import { z } from 'zod';

/**
 * What the playground API answers (P3-06, routes under /v1/playground). Mirrors the shapes agreed with the agent
 * thread; moves to `@nirvana/contracts` (playground.ts) when the routes land, and this file goes away.
 */

export const DestinationSchema = z.enum(['voice_example', 'rule', 'test']);
export type Destination = z.infer<typeof DestinationSchema>;

export const DESTINATION_LABELS: Readonly<Record<Destination, string>> = {
  voice_example: 'Exemple de voix',
  rule: 'Règle',
  test: 'Test',
};
export const DESTINATION_HINTS: Readonly<Record<Destination, string>> = {
  voice_example: 'Rejoint les exemples donnés à la voix.',
  rule: 'Part à Charles pour validation, puis devient du code.',
  test: 'Rejoué à chaque changement de prompt ou de modèle.',
};

const RejectReasonSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  /** Where a rejection for this reason goes by default (calibration.ts, suggestDestination). */
  destination: DestinationSchema,
});

export type Verdict =
  | { readonly kind: 'validated' }
  | { readonly kind: 'corrected'; readonly text: string }
  | { readonly kind: 'rejected'; readonly reason: string; readonly note?: string };

const MediaKindSchema = z.enum(['image', 'video', 'audio']);
export type MediaKind = z.infer<typeof MediaKindSchema>;

const MediaSchema = z.object({
  kind: MediaKindSchema,
  factualDescription: z.string(),
  isLocked: z.boolean().optional(),
});
export type Media = z.infer<typeof MediaSchema>;

const TurnSchema = z.object({
  from: z.enum(['fan', 'creator']),
  text: z.string(),
  media: z.array(MediaSchema).optional(),
});
export type Turn = z.infer<typeof TurnSchema>;

/** A finding, already in French: the screen shows labels, never codes. */
const FindingSchema = z.object({ code: z.string(), label: z.string(), blocking: z.boolean() });
export type Finding = z.infer<typeof FindingSchema>;

const BriefSchema = z.object({
  /** What she understood, in one sentence. */
  understood: z.string(),
  /** What she decided to do: answer, offer, hold back, hand over. */
  decision: z.string(),
  risks: z.array(z.string()),
  kycMissing: z.array(z.string()),
});

const AnswerSchema = z.object({
  bubbles: z.array(z.string()),
  isBlocked: z.boolean(),
  violations: z.array(FindingSchema),
  /** A human must take over (possible minor, distress): nothing was written. */
  handoff: z.array(z.string()).optional(),
  trap: z.array(FindingSchema).optional(),
  /** What Vision saw in his media. */
  vision: z.array(z.string()).optional(),
  brief: BriefSchema.optional(),
  model: z.string().optional(),
  latencyMs: z.number().nonnegative(),
  costUsd: z.number().nonnegative(),
  isFallback: z.boolean(),
  failure: z.string().optional(),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const ComparisonSchema = z.object({
  bubbles: z.array(z.string()),
  isBlocked: z.boolean(),
  violations: z.array(FindingSchema),
  model: z.string().optional(),
  costUsd: z.number().nonnegative(),
  failure: z.string().optional(),
});
export type Comparison = z.infer<typeof ComparisonSchema>;

const PresetSchema = z.object({
  id: z.string(),
  label: z.string(),
  tests: z.string(),
  opening: z.string(),
});
export type Preset = z.infer<typeof PresetSchema>;

const SituationSchema = z.object({
  now: z.iso.datetime({ offset: true }),
  timeZone: z.string(),
  relationshipStartedAt: z.iso.datetime({ offset: true }),
  spentCents: z.number().int().nonnegative(),
  isNight: z.boolean(),
  /** Hours before she may sexualise on her own (persona); 0 once allowed. */
  sexualizationInHours: z.number().nonnegative().optional(),
});

const RateSchema = z.object({
  /** Answers kept as written, out of the last 50 rated for this version; null before the first rating. */
  rate: z.number().min(0).max(1).nullable(),
  rated: z.number().int().nonnegative(),
  validated: z.number().int().nonnegative(),
  target: z.number().min(0).max(1),
  trend: z.object({ since: z.string(), points: z.number() }).optional(),
});

export const PlaygroundStateSchema = z.object({
  presets: z.array(PresetSchema),
  presetId: z.string().optional(),
  reasons: z.array(RejectReasonSchema),
  situation: SituationSchema,
  fanNotes: z.array(z.string()),
  history: z.array(TurnSchema),
  pending: AnswerSchema.optional(),
  rate: RateSchema,
  version: z.object({ voicePrompt: z.string(), voiceModel: z.string() }),
  sessionCostUsd: z.number().nonnegative(),
});
export type PlaygroundState = z.infer<typeof PlaygroundStateSchema>;
