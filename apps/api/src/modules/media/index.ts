/** Public entry point of the media module (docs/architecture/modules.md). Other modules import only this file. */
export type MediaModule = Readonly<Record<string, never>>;

export function createMediaModule(): MediaModule {
  return {};
}
