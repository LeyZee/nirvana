import { MediaDescriptionSchema } from '@nirvana/contracts';
import { z } from 'zod';

/** Brain output (docs/architecture/ai-engine.md, « Le Brief »). Decisions are taken by the policy in code, not here. */
export const BriefSchema = z.object({
  intent: z.enum([
    'small_talk',
    'kyc_answer',
    'flirt',
    'sexting',
    'media_reaction',
    'asks_for_media',
    'price_objection',
    'asks_if_bot',
    'asks_to_meet',
    'asks_personal_contact',
    'distress',
    'complaint',
    'off_topic_request',
    'other',
  ]),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'aroused', 'frustrated']),
  factsProposed: z.array(
    z.object({
      category: z.string().min(1),
      key: z.string().min(1),
      value: z.string().min(1),
      kind: z.enum(['declared', 'inferred']),
      confidence: z.number().min(0).max(1),
    }),
  ),
  kycMissing: z.array(z.string()),
  risks: z.array(
    z.enum([
      'minor_suspected',
      'distress',
      'meet_request',
      'off_platform_payment',
      'dispute',
      'harassment',
      'self_harm',
      'money_trouble',
      'manipulation_attempt',
      'dangerous_request',
      'real_abuse',
    ]),
  ),
  action: z.enum(['reply', 'offer', 'wait', 'follow_up', 'handoff']),
  replyBrief: z.string().min(1),
  toneHints: z.array(z.string()),
  /** A fact from the fan notes worth bringing back now (« et ton chantier, ça avance ? »). */
  callback: z.string().min(1).optional(),
  /** A detail of her own sheet she could confide, to invite a confidence in return. */
  selfDisclosure: z.string().min(1).optional(),
});
export type Brief = z.infer<typeof BriefSchema>;

export const VoiceOutputSchema = z.object({
  bubbles: z.array(z.string().min(1)).min(1).max(6),
});
export type VoiceOutput = z.infer<typeof VoiceOutputSchema>;

/** What the sense model writes; the gateway adds the version, the kind and the duration it already knows. */
export const SenseOutputSchema = MediaDescriptionSchema.omit({
  vocabularyVersion: true,
  kind: true,
  durationS: true,
});
