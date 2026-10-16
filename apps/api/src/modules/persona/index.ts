/** Public entry point of the persona module (docs/architecture/modules.md). Other modules import only this file. */
export type PersonaModule = Readonly<Record<string, never>>;

export function createPersonaModule(): PersonaModule {
  return {};
}
