/** Public entry point of the `connectors` module (ADR 0002). Other modules import this file only. */
export interface ConnectorsModule {
  readonly name: 'connectors';
}

/** Builds the module. Its dependencies arrive as arguments once the module has any (coding.md). */
export function createConnectorsModule(): ConnectorsModule {
  return { name: 'connectors' };
}
