import { z } from 'zod';

import { CreatorIdSchema } from './ids';

/**
 * Alerts (P4-01): her own alerts, written by the owner, and the system's. A custom alert is stored as one row per
 * creator (RLS); the rows made together share a `groupId`, and the screen shows them as one alert. What a trigger
 * records names the alert and how it matched, never the fan's text: nothing he wrote leaves for Telegram (ADR 0020).
 */

export const CustomAlertIdSchema = z.uuid().brand<'CustomAlertId'>();
export type CustomAlertId = z.infer<typeof CustomAlertIdSchema>;

export const CustomAlertGroupIdSchema = z.uuid().brand<'CustomAlertGroupId'>();
export type CustomAlertGroupId = z.infer<typeof CustomAlertGroupIdSchema>;

export const CUSTOM_ALERT_NAME_MAX = 80;
export const CUSTOM_ALERT_PHRASE_MAX = 500;
/** As `notifications.alert_keywords` of the persona. */
export const ALERT_KEYWORD_MAX = 100;
export const CUSTOM_ALERT_KEYWORDS_MAX = 40;

/** A word she watches for, matched in code without a model; unique in its list whatever its case. */
export const AlertKeywordSchema = z.string().trim().min(1).max(ALERT_KEYWORD_MAX);

/** What the owner writes: a phrase the brain reads each message against, words matched in code, or both. */
const customAlertFields = z.object({
  name: z.string().trim().min(1).max(CUSTOM_ALERT_NAME_MAX),
  /** In natural language; the brain answers with the ids of the alerts it sees, never with free text. */
  phrase: z.string().trim().min(1).max(CUSTOM_ALERT_PHRASE_MAX).nullable(),
  keywords: z
    .array(AlertKeywordSchema)
    .max(CUSTOM_ALERT_KEYWORDS_MAX)
    .refine((list) => new Set(list.map((v) => v.toLocaleLowerCase('fr'))).size === list.length, {
      message: 'Mot-clé en double',
    }),
  /** Hands the conversation to a human (cause `keyword`, `custom_alert` or `identity_doubt`); otherwise it only lets one know. */
  pausesAgent: z.boolean(),
  /** Sent to Telegram, in the topic of her alerts (`custom`); always kept in the history. */
  notify: z.boolean(),
});

const phraseOrKeyword = (alert: {
  readonly phrase: string | null;
  readonly keywords: readonly string[];
}): boolean => alert.phrase !== null || alert.keywords.length > 0;
const PHRASE_OR_KEYWORD = { message: 'Une phrase ou au moins un mot-clé', path: ['phrase'] };

/** One row: the alert as one creator has it. */
export const CustomAlertSchema = customAlertFields
  .extend({
    id: CustomAlertIdSchema,
    groupId: CustomAlertGroupIdSchema,
    creatorId: CreatorIdSchema,
    /** Switched off for her without being removed. */
    enabled: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .refine(phraseOrKeyword, PHRASE_OR_KEYWORD);
export type CustomAlert = z.infer<typeof CustomAlertSchema>;

/** The creators an alert watches, each on or off; one row each. */
export const CustomAlertCreatorsSchema = z
  .array(z.object({ creatorId: CreatorIdSchema, enabled: z.boolean() }))
  .min(1)
  .refine((list) => new Set(list.map((c) => c.creatorId)).size === list.length, {
    message: 'Créatrice en double',
  });

/** `PUT /v1/alerts/:groupId`: replaces the alert on all its creators. */
export const CustomAlertBodySchema = customAlertFields
  .extend({ creators: CustomAlertCreatorsSchema })
  .refine(phraseOrKeyword, PHRASE_OR_KEYWORD);
export type CustomAlertBody = z.infer<typeof CustomAlertBodySchema>;

/**
 * `POST /v1/alerts`: the group's id comes from the client, so that the same alert sent twice is written once (200
 * with what is stored); the same id with other values is a 409.
 */
export const CreateCustomAlertBodySchema = customAlertFields
  .extend({ groupId: CustomAlertGroupIdSchema, creators: CustomAlertCreatorsSchema })
  .refine(phraseOrKeyword, PHRASE_OR_KEYWORD);
export type CreateCustomAlertBody = z.infer<typeof CreateCustomAlertBodySchema>;

/** One alert as the screen shows it: its rows gathered, each creator with her row's id and switch. */
export const CustomAlertGroupSchema = customAlertFields
  .extend({
    groupId: CustomAlertGroupIdSchema,
    creators: z.array(
      z.object({ creatorId: CreatorIdSchema, enabled: z.boolean(), alertId: CustomAlertIdSchema }),
    ),
    createdAt: z.iso.datetime(),
    /** The latest change of any of its rows. */
    updatedAt: z.iso.datetime(),
  })
  .refine(phraseOrKeyword, PHRASE_OR_KEYWORD);
export type CustomAlertGroup = z.infer<typeof CustomAlertGroupSchema>;

/**
 * The system's alerts: a word of her persona (`notifications.alert_keywords`, always pauses), a service asked for
 * (custom content, call, cam, voice: a human may sell it, no pause), a doubt on who she is (`asks_if_bot`: a human
 * on shift takes over; the `ai_disclosure` guard is unchanged).
 */
export const SYSTEM_ALERT_CODES = ['keyword', 'service_request', 'identity_doubt'] as const;
export const SystemAlertCodeSchema = z.enum(SYSTEM_ALERT_CODES);
export type SystemAlertCode = z.infer<typeof SystemAlertCodeSchema>;

/** Always on: her words are her persona's, removed there, never switched off here. */
export const LOCKED_SYSTEM_ALERTS: readonly SystemAlertCode[] = ['keyword'];

/** A system alert on each creator; on unless switched off. */
export const SystemAlertSettingSchema = z.object({
  code: SystemAlertCodeSchema,
  /** `keyword`: cannot be switched off. */
  locked: z.boolean(),
  creators: z.array(z.object({ creatorId: CreatorIdSchema, enabled: z.boolean() })),
});
export type SystemAlertSetting = z.infer<typeof SystemAlertSettingSchema>;

/** `PUT /v1/alerts/system/:code`: switches it on or off for the creators named, the others as they were. */
export const SetSystemAlertBodySchema = z.object({ creators: CustomAlertCreatorsSchema });
export type SetSystemAlertBody = z.infer<typeof SetSystemAlertBodySchema>;

/** `GET /v1/alerts`: Réglages › Alertes, the owner's. Archived alerts are left out. */
export const AlertsViewSchema = z.object({
  custom: z.array(CustomAlertGroupSchema),
  system: z.array(SystemAlertSettingSchema),
});
export type AlertsView = z.infer<typeof AlertsViewSchema>;

export const AlertRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('custom'), id: CustomAlertIdSchema }),
  z.object({ kind: z.literal('system'), code: SystemAlertCodeSchema }),
]);
export type AlertRef = z.infer<typeof AlertRefSchema>;

/** `keyword`: one of her words, in code; `rule`: a closed rule of the code; `model`: an id the brain answered with. */
export const AlertMatcherSchema = z.enum(['keyword', 'rule', 'model']);
export type AlertMatcher = z.infer<typeof AlertMatcherSchema>;

/**
 * What set an alert off. `keyword` is the word as she declared it, given exactly when `matchedBy` is `keyword`:
 * never what the fan wrote.
 */
export const AlertTriggerSchema = z
  .object({
    alert: AlertRefSchema,
    matchedBy: AlertMatcherSchema,
    keyword: AlertKeywordSchema.optional(),
  })
  .refine((trigger) => (trigger.matchedBy === 'keyword') === (trigger.keyword !== undefined), {
    message: 'Le mot déclaré accompagne un déclenchement par mot-clé, et lui seul',
    path: ['keyword'],
  });
export type AlertTrigger = z.infer<typeof AlertTriggerSchema>;
