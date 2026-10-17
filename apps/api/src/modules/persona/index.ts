/** Public entry point of the `persona` module (ADR 0002). Other modules import this file only. */
export interface PersonaModule {
  readonly name: 'persona';
}

/** Builds the module. Its dependencies arrive as arguments once the module has any (coding.md). */
export function createPersonaModule(): PersonaModule {
  return { name: 'persona' };
}
