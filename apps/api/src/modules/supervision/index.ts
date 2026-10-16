/** Public entry point of the supervision module (docs/architecture/modules.md). Other modules import only this file. */
export type SupervisionModule = Readonly<Record<string, never>>;

export function createSupervisionModule(): SupervisionModule {
  return {};
}
