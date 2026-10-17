/** Public entry point of the `scripts` module (ADR 0002). Other modules import this file only. */
export interface ScriptsModule {
  readonly name: 'scripts';
}

/** Builds the module. Its dependencies arrive as arguments once the module has any (coding.md). */
export function createScriptsModule(): ScriptsModule {
  return { name: 'scripts' };
}
