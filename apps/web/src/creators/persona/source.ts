import { PersonaSchema, type Persona } from '@nirvana/contracts';
import { useCallback, useEffect, useState } from 'react';

/**
 * Where the persona screen reads from. There is no `/v1/persona` route yet, so the only source is the placeholder
 * of the repository (`personas/messalina/v0.0.0.yaml`, ADR 0010), shown with an « Exemple » badge. When the route
 * lands, `loadPersona` fetches it, the source becomes `api`, the badge goes and the rest of the screen does not change.
 */
export type PersonaSource = 'example' | 'api';

export type PersonaLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly persona: Persona; readonly source: PersonaSource };

/** Parses the YAML text of a persona file; throws when it does not pass `PersonaSchema`. */
export async function parsePersonaYaml(text: string): Promise<Persona> {
  const { parse } = await import('yaml');
  return PersonaSchema.parse(parse(text));
}

/** Loaded on demand: the YAML parser and the file only reach the browser on this page. */
async function loadPersona(): Promise<{ persona: Persona; source: PersonaSource }> {
  const file = await import('../../../../../personas/messalina/v0.0.0.yaml?raw');
  return { persona: await parsePersonaYaml(file.default), source: 'example' };
}

/** The one hook the screen reads the persona through. */
export function usePersona(): { load: PersonaLoad; retry: () => void } {
  const [load, setLoad] = useState<PersonaLoad>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    loadPersona().then(
      ({ persona, source }) => {
        if (live) setLoad({ kind: 'ready', persona, source });
      },
      () => {
        if (live) setLoad({ kind: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setLoad({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { load, retry };
}
