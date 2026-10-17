import { ageOn, PersonaSchema } from '@nirvana/contracts';
import { parse, stringify } from 'yaml';

/** Who she is for the models, read from the persona YAML: the playground and the drafts share it. */
export interface PersonaForModels {
  readonly creatorName: string;
  readonly personaSheet: string;
  readonly forbiddenTerms: readonly string[];
}

const isPlaceholder = (value: string): boolean => value.startsWith('<');

/**
 * Reads a persona YAML through the single persona schema (docs/reference/persona-schema.md).
 * The sheet given to the model holds who she is and how she writes; strategies, follow-ups and
 * notifications stay out of it, since code applies them (CLAUDE.md rule 3). The age is computed for `today`.
 */
export function readPersonaFile(source: string, fallbackName: string, today: string): PersonaForModels {
  const persona = PersonaSchema.parse(parse(source));
  const name = persona.details.first_name;
  const { date_of_birth: dateOfBirth, ...details } = persona.details;
  const sheet = {
    details: { ...details, age: ageOn(dateOfBirth, today) },
    additional_info: persona.additional_info,
    behavior: persona.behavior,
    limits: persona.limits,
  };
  return {
    creatorName: isPlaceholder(name) ? fallbackName : name,
    personaSheet: stringify(sheet).trim(),
    forbiddenTerms: [...persona.limits.disgusts, ...persona.limits.never_say].filter(
      (term) => !isPlaceholder(term),
    ),
  };
}
