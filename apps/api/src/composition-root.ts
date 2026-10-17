import { createAgentModule, type AgentModule } from './modules/agent';
import { createConnectorsModule, type ConnectorsModule } from './modules/connectors';
import { createConversationsModule, type ConversationsModule } from './modules/conversations';
import { createFansModule, type FansModule } from './modules/fans';
import { createMediaModule, type MediaModule } from './modules/media';
import { createPersonaModule, type PersonaModule } from './modules/persona';
import { createSalesModule, type SalesModule } from './modules/sales';
import { createScriptsModule, type ScriptsModule } from './modules/scripts';
import { createSupervisionModule, type SupervisionModule } from './modules/supervision';

/** Every business module, wired. */
export interface App {
  readonly connectors: ConnectorsModule;
  readonly conversations: ConversationsModule;
  readonly fans: FansModule;
  readonly persona: PersonaModule;
  readonly agent: AgentModule;
  readonly media: MediaModule;
  readonly supervision: SupervisionModule;
  readonly sales: SalesModule;
  readonly scripts: ScriptsModule;
}

/** Wires every business module by hand (no DI container, coding.md). Called once by each entry point. */
export function createApp(): App {
  return {
    connectors: createConnectorsModule(),
    conversations: createConversationsModule(),
    fans: createFansModule(),
    persona: createPersonaModule(),
    agent: createAgentModule(),
    media: createMediaModule(),
    supervision: createSupervisionModule(),
    sales: createSalesModule(),
    scripts: createScriptsModule(),
  };
}
