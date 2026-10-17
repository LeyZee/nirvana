import { parse } from 'yaml';
import { z } from 'zod';

// Deliberately loose: the single persona schema is being written by another task; the playground only needs
// a name, the forbidden terms for the guards, and the file itself as the sheet given to the model.
const LoosePersonaSchema = z.object({
  identity: z.object({ first_name: z.string().optional() }).loose().optional(),
  boundaries: z
    .object({ hard_limits: z.array(z.string()).optional(), disgusts: z.array(z.string()).optional() })
    .loose()
    .optional(),
});

export interface PlaygroundPersona {
  readonly creatorName: string;
  readonly personaSheet: string;
  readonly forbiddenTerms: readonly string[];
}

const isPlaceholder = (value: string): boolean => value.startsWith('<');

export function readPersonaFile(source: string, fallbackName: string): PlaygroundPersona {
  const persona = LoosePersonaSchema.parse(parse(source));
  const name = persona.identity?.first_name;
  return {
    creatorName: name !== undefined && !isPlaceholder(name) ? name : fallbackName,
    personaSheet: source.trim(),
    forbiddenTerms: (persona.boundaries?.disgusts ?? []).filter((term) => !isPlaceholder(term)),
  };
}
