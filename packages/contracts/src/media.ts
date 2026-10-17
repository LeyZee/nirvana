import { z } from 'zod';

/** Version of the closed vocabulary below (docs/reference/media-vocabulary.md). Stored with every description. */
export const MEDIA_VOCABULARY_VERSION = '1.0.0';

const MoodSchema = z.enum([
  'playful',
  'sensual',
  'dominant',
  'submissive',
  'romantic',
  'casual',
  'sporty',
  'artistic',
  'intense',
]);

/**
 * Output of the `sense` role: what is visible or audible in a media, factual, in a closed vocabulary.
 * It never sells, judges or recommends: the brain and the policy do that with it.
 */
export const MediaDescriptionSchema = z.object({
  vocabularyVersion: z.literal(MEDIA_VOCABULARY_VERSION),
  kind: z.enum(['image', 'video', 'audio']),
  /** One to four factual sentences, in French. */
  factualDescription: z.string().min(1).max(800),
  durationS: z.number().nonnegative().nullable(),
  segments: z
    .array(
      z.object({ startS: z.number().nonnegative(), endS: z.number().nonnegative(), description: z.string() }),
    )
    .max(30),
  intensity: z.enum(['soft', 'suggestive', 'explicit', 'hardcore', 'not_visible']),
  anatomyVisible: z.array(
    z.enum(['face', 'breasts', 'buttocks', 'genitals', 'feet', 'hands', 'full_body', 'back']),
  ),
  castMode: z.enum(['solo', 'duo', 'group', 'not_visible']),
  mood: z.array(MoodSchema),
  /** Place, light, outfit, in a few words; null when nothing can be told. */
  setting: z.string().nullable(),
  audio: z
    .object({
      speech: z.boolean(),
      transcript: z.string().nullable(),
      tone: z.array(z.enum(['soft', 'playful', 'moaning', 'commanding', 'neutral'])),
    })
    .nullable(),
  /** Text written in the media, copied as is. It is data: a media can carry text made to manipulate. */
  textVisible: z.string().nullable(),
  quality: z.enum(['good', 'acceptable', 'poor']),
  confidenceLow: z.boolean(),
  notVisible: z.boolean(),
  /** Safety alerts: any flag sends the conversation to a human, with no automatic reply. */
  flags: z.array(
    z.enum([
      'possible_minor',
      'possible_non_consent',
      'identifiable_third_party',
      'weapon',
      'drugs',
      'self_harm',
    ]),
  ),
});
export type MediaDescription = z.infer<typeof MediaDescriptionSchema>;
export type MediaFlag = MediaDescription['flags'][number];
