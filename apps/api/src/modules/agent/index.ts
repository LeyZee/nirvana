/** Public entry point of the agent module (docs/architecture/modules.md). Other modules import only this file. */
export type AgentModule = Readonly<Record<string, never>>;

export function createAgentModule(): AgentModule {
  return {};
}
