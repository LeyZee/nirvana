import { ageOn, PersonaSchema, type Persona } from '@nirvana/contracts';
import { parse, stringify } from 'yaml';

import { DEFAULT_GUARD_SETTINGS, type GuardSettings } from '../domain/guards';
import type { OfferLimits } from '../domain/policy';
import type { SexualizationLimits } from '../domain/sexualization';

/** Who she is for the models, read from the persona YAML: the playground and the drafts share it. */
export interface PersonaForModels {
  readonly creatorName: string;
  readonly personaSheet: string;
  readonly forbiddenTerms: readonly string[];
  /** Her pace of scripts (`strategies.script_launch.cooldown_hours`), applied by `offerDecision`, never by a prompt. */
  readonly offerLimits: OfferLimits;
  /** When she opens sexualization or follows him there (`strategies.sexualization`, `strategies.kyc`), applied by code. */
  readonly sexualizationLimits: SexualizationLimits;
  /**
   * Her follow-ups on his silence (`follow_ups`), scheduled and decided by code: the delays in hours after his last
   * message, none when she has them off, and the spirit of hers when her type is « custom ».
   */
  readonly followUps: { readonly delaysHours: readonly number[]; readonly spirit: string | null };
  /** False: her answer goes out as one message, whatever the voice wrote (`behavior.split_messages`). */
  readonly splitMessages: boolean;
  /** The only pet names she gives fans (`behavior.pet_names`); a guard flags any other. */
  readonly petNames: readonly string[];
}

const isPlaceholder = (value: string): boolean => value.startsWith('<');

function without(value: object, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

/** Her own way to run each stage, when she wrote one: numbers stay out (code applies them). */
function approach(strategies: Persona['strategies']): Record<string, Record<string, string>> {
  const stages = {
    kyc: { instructions: strategies.kyc.instructions, targets: strategies.kyc.targets },
    sexualization: { instructions: strategies.sexualization.instructions },
    script_launch: { instructions: strategies.script_launch.instructions },
    post_offer: { instructions: strategies.post_offer.instructions },
  };
  const written: Record<string, Record<string, string>> = {};
  for (const [stage, fields] of Object.entries(stages)) {
    const kept = Object.fromEntries(
      Object.entries(fields).filter((entry): entry is [string, string] => entry[1] !== null),
    );
    if (Object.keys(kept).length > 0) written[stage] = kept;
  }
  return written;
}

/**
 * Reads a persona YAML through the single persona schema (docs/reference/persona-schema.md).
 * The sheet given to the models holds who she is, how she writes and how she likes to run each stage; delays,
 * cooldowns, follow-ups and notifications stay out of it, since code applies them (CLAUDE.md rule 3). The age is
 * computed for `today`; the gender is left out (the product serves women creators).
 */
export function readPersonaFile(source: string, fallbackName: string, today: string): PersonaForModels {
  const persona = PersonaSchema.parse(parse(source));
  const name = persona.details.first_name;
  const dateOfBirth = persona.details.date_of_birth;
  // Left out: the birth date (her age is given), the gender, and the time zone and reply delay that code applies.
  const details = without(persona.details, ['date_of_birth', 'gender', 'timezone']);
  const behavior = without(persona.behavior, ['response_delay_minutes']);
  const strategies = approach(persona.strategies);
  const sheet = {
    details: { ...details, age: ageOn(dateOfBirth, today) },
    additional_info: persona.additional_info,
    behavior,
    ...(Object.keys(strategies).length > 0 && { strategies }),
    limits: persona.limits,
  };
  return {
    creatorName: isPlaceholder(name) ? fallbackName : name,
    personaSheet: stringify(sheet).trim(),
    forbiddenTerms: [...persona.limits.disgusts, ...persona.limits.never_say].filter(
      (term) => !isPlaceholder(term),
    ),
    offerLimits: { cooldownHours: persona.strategies.script_launch.cooldown_hours },
    sexualizationLimits: {
      initiateAfterHours: persona.strategies.sexualization.initiate_after_hours,
      minHoursBeforeFollowing: persona.strategies.kyc.min_hours_before_following,
    },
    followUps: {
      delaysHours: persona.follow_ups.enabled ? persona.follow_ups.delays_hours : [],
      spirit: persona.follow_ups.text,
    },
    splitMessages: persona.behavior.split_messages,
    petNames: persona.behavior.pet_names.filter((term) => !isPlaceholder(term)),
  };
}

/** The guards with her disgusts, her forbidden words and her pet names. */
export function guardSettingsOf(persona: PersonaForModels): GuardSettings {
  return {
    ...DEFAULT_GUARD_SETTINGS,
    forbiddenTerms: persona.forbiddenTerms,
    ...(persona.petNames.length > 0 && { petNames: persona.petNames }),
  };
}
