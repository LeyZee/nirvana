import { z } from 'zod';

/**
 * Creator persona (ADR 0010), mirrored on the OnlyChat creator settings: details, additional info, behaviour,
 * strategies, follow-ups, notifications. `limits` is the one section OnlyChat lacks: guards load it (CLAUDE.md rule 3).
 * Shared by the dashboard form and the agent. Field reference: docs/reference/persona-schema.md.
 */

/** A choice list with its French label, used by the dashboard form and by the import from OnlyChat. */
type Options<T extends string | number> = readonly { readonly value: T; readonly label: string }[];

const labelled = <V extends string>(values: readonly V[], labels: Record<V, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

const range = (from: number, to: number, step = 1): number[] =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

export const GENDERS = ['female', 'male', 'other'] as const;
export const ETHNICITIES = ['caucasian', 'latina', 'asian', 'black', 'mixed', 'arab', 'other'] as const;
export const LANGUAGES = [
  'french',
  'english',
  'italian',
  'spanish',
  'german',
  'portuguese',
  'dutch',
  'arabic',
] as const;
export const HAIR_COLORS = ['brown', 'black', 'blond', 'red', 'auburn', 'grey', 'colored'] as const;
export const EYE_COLORS = ['brown', 'green', 'blue', 'hazel', 'grey', 'black'] as const;
export const CUP_SIZES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const BAND_SIZES = range(65, 105, 5);
export const LANGUAGE_STYLES = ['formal', 'casual'] as const;
export const STRATEGY_STYLES = ['default', 'custom'] as const;
export const SCRIPT_LAUNCH_STYLES = ['normal', 'custom'] as const;
export const FOLLOW_UP_TYPES = ['soft', 'custom'] as const;

/** Bounds of every number field: OnlyChat's where its form shows them, ours otherwise (follow-ups within a week). Units are in the names. */
export const PERSONA_BOUNDS = {
  heightCm: [140, 200],
  weightKg: [40, 130],
  shoeSizeEu: [34, 46],
  responseDelayMinutes: [0, 60],
  kycMaxMessages: [1, 500],
  kycMaxDurationMinutes: [10, 1440],
  kycMinHoursBeforeFollowing: [0, 24],
  sexualizationInitiateAfterHours: [0, 168],
  scriptCooldownHours: [0, 24],
  postOfferDelayDays: [1, 60],
  followUpDelayHours: [1, 168],
  nudgeDelayMinutes: [1, 120],
  nudgesPerDay: [0, 10],
  nudgeMinHoursAfterConversation: [0, 48],
} as const satisfies Record<string, readonly [number, number]>;

export const ADDITIONAL_INFO_MAX = 6000;
export const MIN_CREATOR_AGE = 18;

/** French labels of every choice list: the dashboard renders these, never its own copy. */
export const PERSONA_OPTIONS = {
  gender: labelled(GENDERS, { female: 'Femme', male: 'Homme', other: 'Autre' }),
  ethnicity: labelled(ETHNICITIES, {
    caucasian: 'Caucasienne',
    latina: 'Latine',
    asian: 'Asiatique',
    black: 'Noire',
    mixed: 'Métisse',
    arab: 'Moyen-orientale',
    other: 'Autre',
  }),
  languages: labelled(LANGUAGES, {
    french: 'Français',
    english: 'Anglais',
    italian: 'Italien',
    spanish: 'Espagnol',
    german: 'Allemand',
    portuguese: 'Portugais',
    dutch: 'Néerlandais',
    arabic: 'Arabe',
  }),
  hair: labelled(HAIR_COLORS, {
    brown: 'Bruns',
    black: 'Noirs',
    blond: 'Blonds',
    red: 'Roux',
    auburn: 'Châtains',
    grey: 'Gris',
    colored: 'Colorés',
  }),
  eyes: labelled(EYE_COLORS, {
    brown: 'Marron',
    green: 'Verts',
    blue: 'Bleus',
    hazel: 'Noisette',
    grey: 'Gris',
    black: 'Noirs',
  }),
  cup: CUP_SIZES.map((value) => ({ value, label: value })),
  band: BAND_SIZES.map((value) => ({ value, label: String(value) })),
  languageStyle: labelled(LANGUAGE_STYLES, { formal: 'Soigné', casual: 'Familier' }),
  strategyStyle: labelled(STRATEGY_STYLES, { default: 'Par défaut', custom: 'Personnalisé' }),
  scriptLaunchStyle: labelled(SCRIPT_LAUNCH_STYLES, { normal: 'Normal', custom: 'Personnalisé' }),
  followUpType: labelled(FOLLOW_UP_TYPES, { soft: 'Douce', custom: 'Personnalisée' }),
} as const satisfies Record<string, Options<string | number>>;

const intIn = ([min, max]: readonly [number, number]) => z.int().min(min).max(max);
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => text(max).nullable();

/** A list of short entries, each unique regardless of case (hobbies, traits, keywords). */
const entries = (maxEach: number, maxCount: number) =>
  z
    .array(text(maxEach))
    .max(maxCount)
    .refine((list) => new Set(list.map((v) => v.toLocaleLowerCase('fr'))).size === list.length, {
      message: 'Entrée en double',
    });

const uniqueList = <T extends z.ZodType<string>>(item: T) =>
  z.array(item).refine((list) => new Set(list).size === list.length, { message: 'Valeur en double' });

/** IANA zone, checked against the runtime's own list. */
export const TimezoneSchema = z.string().refine(
  (zone) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return zone.includes('/');
    } catch {
      return false;
    }
  },
  { message: 'Fuseau horaire IANA inconnu' },
);

/** The two fields every strategy shares: a style, and the creator's instructions when the style is custom. */
const strategyShape = <S extends readonly [string, ...string[]]>(styles: S) => ({
  style: z.enum(styles),
  instructions: optionalText(2000),
});

/** Refinement: instructions are present exactly when the style is the custom one. */
const instructionsWhenCustom = (
  custom: string,
): [(s: { style: string; instructions: string | null }) => boolean, { message: string; path: string[] }] => [
  (s) => (s.style === custom) === (s.instructions !== null),
  { message: `Attendu si et seulement si le style est « ${custom} »`, path: ['instructions'] },
];

export const PersonaDetailsSchema = z.strictObject({
  first_name: text(40),
  date_of_birth: z.iso.date(),
  /** Deprecated (Charles, 17/10): Nirvana is built for women creators. Still read in older files, never used. */
  gender: z.enum(GENDERS).optional(),
  ethnicity: z.enum(ETHNICITIES),
  timezone: TimezoneSchema,
  languages: uniqueList(z.enum(LANGUAGES)).min(1),
  height_cm: intIn(PERSONA_BOUNDS.heightCm).nullable(),
  weight_kg: intIn(PERSONA_BOUNDS.weightKg).nullable(),
  shoe_size_eu: intIn(PERSONA_BOUNDS.shoeSizeEu).nullable(),
  hair: z.enum(HAIR_COLORS).nullable(),
  eyes: z.enum(EYE_COLORS).nullable(),
  bra: z
    .strictObject({
      band: z.int().refine((b) => BAND_SIZES.includes(b), { message: 'Tour de poitrine hors liste' }),
      cup: z.enum(CUP_SIZES),
    })
    .nullable(),
  hobbies: entries(80, 40),
  personality: entries(80, 40),
});

export const PersonaBehaviorSchema = z.strictObject({
  language_style: z.enum(LANGUAGE_STYLES),
  language_instructions: optionalText(2000),
  split_messages: z.boolean(),
  /** The only pet names she gives fans: guards refuse any other. */
  pet_names: entries(30, 20),
  /** Enforced by code when sending, never by the prompt (CLAUDE.md rule 3). */
  response_delay_minutes: intIn(PERSONA_BOUNDS.responseDelayMinutes),
});

export const PersonaStrategiesSchema = z.strictObject({
  /** Delays and cooldowns below are enforced by the policy, never by the prompt (CLAUDE.md rule 3). */
  kyc: z
    .strictObject({
      ...strategyShape(STRATEGY_STYLES),
      targets: optionalText(500),
      max_messages: intIn(PERSONA_BOUNDS.kycMaxMessages),
      max_duration_minutes: intIn(PERSONA_BOUNDS.kycMaxDurationMinutes),
      /** Conversation time before the agent follows a fan who sexualizes; below it, she steers back. */
      min_hours_before_following: intIn(PERSONA_BOUNDS.kycMinHoursBeforeFollowing),
    })
    .refine(...instructionsWhenCustom('custom')),
  sexualization: z
    .strictObject({
      ...strategyShape(STRATEGY_STYLES),
      /** Relationship time before the agent opens sexualization itself. */
      initiate_after_hours: intIn(PERSONA_BOUNDS.sexualizationInitiateAfterHours),
    })
    .refine(...instructionsWhenCustom('custom')),
  script_launch: z
    .strictObject({
      ...strategyShape(SCRIPT_LAUNCH_STYLES),
      cooldown_hours: intIn(PERSONA_BOUNDS.scriptCooldownHours),
    })
    .refine(...instructionsWhenCustom('custom')),
  post_offer: z
    .strictObject({ ...strategyShape(STRATEGY_STYLES), delay_days: intIn(PERSONA_BOUNDS.postOfferDelayDays) })
    .refine(...instructionsWhenCustom('custom')),
});

export const PersonaFollowUpsSchema = z
  .strictObject({
    enabled: z.boolean(),
    /** Hours after the fan's last message, strictly increasing. */
    delays_hours: z
      .array(intIn(PERSONA_BOUNDS.followUpDelayHours))
      .max(5)
      .refine((d) => d.every((h, i) => i === 0 || h > (d[i - 1] ?? 0)), {
        message: 'Délais strictement croissants',
      }),
    type: z.enum(FOLLOW_UP_TYPES),
    text: optionalText(500),
    nudges: z.strictObject({
      enabled: z.boolean(),
      delay_minutes: intIn(PERSONA_BOUNDS.nudgeDelayMinutes),
      max_per_day: intIn(PERSONA_BOUNDS.nudgesPerDay),
      min_hours_after_conversation: intIn(PERSONA_BOUNDS.nudgeMinHoursAfterConversation),
      delete_previous: z.boolean(),
    }),
  })
  .refine((f) => (f.type === 'custom') === (f.text !== null), {
    message: 'Attendu si et seulement si le type est « custom »',
    path: ['text'],
  });

export const PersonaNotificationsSchema = z.strictObject({
  sales: z.boolean(),
  agent_disabled: z.boolean(),
  no_script_left: z.boolean(),
  rate_limited: z.boolean(),
  /** Always on: a fan who writes one of these pauses the agent for that fan and alerts a human. */
  alert_keywords: entries(40, 100),
});

/** What she never does, shows or says. Safety data: guards.ts loads it, the prompt only mirrors it. */
export const PersonaLimitsSchema = z.strictObject({
  never_do: entries(120, 100),
  never_show: entries(120, 100),
  never_say: entries(120, 200),
  disgusts: entries(120, 200),
});

export const PersonaMetaSchema = z.strictObject({
  schema: z.literal(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, { message: 'Version semver attendue (ex. 1.2.0)' }),
  creator: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, { message: 'Identifiant en minuscules' }),
  language: z.literal('fr'),
  created_at: z.iso.date(),
  notes: optionalText(1000),
});

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Age in whole years on a given day, both ISO dates (YYYY-MM-DD). Calendar arithmetic, no time zone involved. */
export function ageOn(dateOfBirth: string, day: string): number {
  const birth = ISO_DATE.exec(dateOfBirth);
  const today = ISO_DATE.exec(day);
  if (!birth || !today) throw new RangeError('Date ISO attendue (AAAA-MM-JJ)');
  const [, by, bm, bd] = birth.map(Number);
  const [, y, m, d] = today.map(Number);
  if (
    by === undefined ||
    bm === undefined ||
    bd === undefined ||
    y === undefined ||
    m === undefined ||
    d === undefined
  )
    throw new RangeError('Date ISO attendue (AAAA-MM-JJ)');
  const birthdayPassed = m > bm || (m === bm && d >= bd);
  return y - by - (birthdayPassed ? 0 : 1);
}

export const PersonaSchema = z
  .strictObject({
    meta: PersonaMetaSchema,
    details: PersonaDetailsSchema,
    additional_info: z.string().trim().max(ADDITIONAL_INFO_MAX),
    behavior: PersonaBehaviorSchema,
    strategies: PersonaStrategiesSchema,
    follow_ups: PersonaFollowUpsSchema,
    notifications: PersonaNotificationsSchema,
    limits: PersonaLimitsSchema,
  })
  .refine((p) => ageOn(p.details.date_of_birth, p.meta.created_at) >= MIN_CREATOR_AGE, {
    message: `La créatrice doit avoir au moins ${String(MIN_CREATOR_AGE)} ans à la date de la version`,
    path: ['details', 'date_of_birth'],
  });

export type Persona = z.infer<typeof PersonaSchema>;
export type PersonaDetails = z.infer<typeof PersonaDetailsSchema>;
export type PersonaBehavior = z.infer<typeof PersonaBehaviorSchema>;
export type PersonaStrategies = z.infer<typeof PersonaStrategiesSchema>;
export type PersonaFollowUps = z.infer<typeof PersonaFollowUpsSchema>;
export type PersonaNotifications = z.infer<typeof PersonaNotificationsSchema>;
export type PersonaLimits = z.infer<typeof PersonaLimitsSchema>;
