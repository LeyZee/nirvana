/** Public entry point of the fans module (docs/architecture/modules.md). Other modules import only this file. */
export type FansModule = Readonly<Record<string, never>>;

export function createFansModule(): FansModule {
  return {};
}
