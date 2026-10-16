/** Public entry point of the connectors module (docs/architecture/modules.md). Other modules import only this file. */
export type ConnectorsModule = Readonly<Record<string, never>>;

export function createConnectorsModule(): ConnectorsModule {
  return {};
}
