import { z } from 'zod';

import { FanIdSchema } from './ids';

/**
 * What she tries to learn about a fan (P3-02): the lines of the agency's notes canvas on Reveal, as they are.
 * A slot is filled by an active fact of the same key (`fan_facts.key`).
 */
export const KycSlotSchema = z.enum([
  'first_name',
  'location',
  'age',
  'job',
  'hobbies',
  'desires',
  'situation',
]);
export type KycSlot = z.infer<typeof KycSlotSchema>;

/** The canvas line of each slot, word for word. */
export const KYC_SLOT_LABELS: Readonly<Record<KycSlot, string>> = {
  first_name: 'Prénom',
  location: 'Localisation',
  age: 'Âge',
  job: 'Métier',
  hobbies: 'Passions',
  desires: 'Envies',
  situation: 'Situation',
};

/** Why sales stopped for a fan: what he said, or a human's call. */
export const SalesFreezeReasonSchema = z.enum(['money_trouble', 'spending_limit', 'distress', 'operator']);
export type SalesFreezeReason = z.infer<typeof SalesFreezeReasonSchema>;

/**
 * Limits of a fan (`fans.flags`), read by the policy before any offer. Written by the policy when it detects a
 * risk, or by a human, never by a model alone; each change is a `domain_events` line with its author.
 */
export const FanFlagsSchema = z
  .object({
    /** When he was confirmed an adult: nothing explicit before. */
    ageConfirmedAt: z.iso.datetime().exactOptional(),
    /** No offer, no sulking, no sales follow-up. */
    salesFrozen: z.object({ reason: SalesFreezeReasonSchema, since: z.iso.datetime() }).exactOptional(),
    /** A ceiling he set himself, in cents. */
    spendingLimitMinor: z.number().int().nonnegative().exactOptional(),
    /** Gentle only: no sulking either. */
    fragile: z.literal(true).exactOptional(),
    noExplicit: z.literal(true).exactOptional(),
    /** Nothing is written to him at all. */
    doNotContact: z.literal(true).exactOptional(),
  })
  .strict();
export type FanFlags = z.infer<typeof FanFlagsSchema>;

/** The name of one flag of a fan: what `fan_flag_set` and `fan_flag_cleared` say changed. */
export const FanFlagNameSchema = FanFlagsSchema.keyof();
export type FanFlagName = z.infer<typeof FanFlagNameSchema>;

/** `GET /v1/fans/:id/flags`, and the answer of `PUT`: his limits now. */
export const FanFlagsViewSchema = z.object({ fanId: FanIdSchema, flags: FanFlagsSchema });
export type FanFlagsView = z.infer<typeof FanFlagsViewSchema>;

const flagReason = z.string().trim().min(1).max(500).exactOptional();

/**
 * `PUT /v1/fans/:id/flags`: a human sets or lifts one limit. The server dates `ageConfirmedAt` and the start of a
 * freeze itself; a freeze says why, a ceiling says how much.
 */
export const SetFanFlagBodySchema = z.union([
  z.object({
    flag: z.enum(['ageConfirmedAt', 'fragile', 'noExplicit', 'doNotContact']),
    set: z.literal(true),
    reason: flagReason,
  }),
  z.object({
    flag: z.literal('salesFrozen'),
    set: z.literal(true),
    freezeReason: SalesFreezeReasonSchema,
    reason: flagReason,
  }),
  z.object({
    flag: z.literal('spendingLimitMinor'),
    set: z.literal(true),
    limitMinor: z.number().int().nonnegative(),
    reason: flagReason,
  }),
  z.object({ flag: FanFlagNameSchema, set: z.literal(false), reason: flagReason }),
]);
export type SetFanFlagBody = z.infer<typeof SetFanFlagBodySchema>;
