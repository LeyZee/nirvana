/** Public entry point of the `sales` module (ADR 0002). Other modules import this file only. */
export interface SalesModule {
  readonly name: 'sales';
}

/** Builds the module. Its dependencies arrive as arguments once the module has any (coding.md). */
export function createSalesModule(): SalesModule {
  return { name: 'sales' };
}
