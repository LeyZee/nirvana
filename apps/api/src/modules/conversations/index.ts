/** Public entry point of the conversations module (docs/architecture/modules.md). Other modules import only this file. */
export type ConversationsModule = Readonly<Record<string, never>>;

export function createConversationsModule(): ConversationsModule {
  return {};
}
