/** Public entry point of the sales module (docs/architecture/modules.md). Other modules import only this file. */
export type SalesModule = Readonly<Record<string, never>>;

export function createSalesModule(): SalesModule {
  return {};
}
