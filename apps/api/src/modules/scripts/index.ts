/** Public entry point of the scripts module (docs/architecture/modules.md). Other modules import only this file. */
export type ScriptsModule = Readonly<Record<string, never>>;

export function createScriptsModule(): ScriptsModule {
  return {};
}
