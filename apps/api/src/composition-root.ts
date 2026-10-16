// Manual dependency injection (ADR 0002): the API and the worker build their config and modules here, nowhere else.
import type { Config } from './config.js';
import { createAgentModule, type AgentModule } from './modules/agent/index.js';
import { createConnectorsModule, type ConnectorsModule } from './modules/connectors/index.js';
import { createConversationsModule, type ConversationsModule } from './modules/conversations/index.js';
import { createFansModule, type FansModule } from './modules/fans/index.js';
import { createMediaModule, type MediaModule } from './modules/media/index.js';
import { createPersonaModule, type PersonaModule } from './modules/persona/index.js';
import { createSalesModule, type SalesModule } from './modules/sales/index.js';
import { createScriptsModule, type ScriptsModule } from './modules/scripts/index.js';
import { createSupervisionModule, type SupervisionModule } from './modules/supervision/index.js';

interface Modules {
  readonly agent: AgentModule;
  readonly connectors: ConnectorsModule;
  readonly conversations: ConversationsModule;
  readonly fans: FansModule;
  readonly media: MediaModule;
  readonly persona: PersonaModule;
  readonly sales: SalesModule;
  readonly scripts: ScriptsModule;
  readonly supervision: SupervisionModule;
}

export interface CompositionRoot {
  readonly config: Config;
  readonly modules: Modules;
}

export function createCompositionRoot(config: Config): CompositionRoot {
  return {
    config,
    modules: {
      agent: createAgentModule(),
      connectors: createConnectorsModule(),
      conversations: createConversationsModule(),
      fans: createFansModule(),
      media: createMediaModule(),
      persona: createPersonaModule(),
      sales: createSalesModule(),
      scripts: createScriptsModule(),
      supervision: createSupervisionModule(),
    },
  };
}
