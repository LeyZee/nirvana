/** Public entry point of the `conversations` module (ADR 0002). Other modules import this file only. */
export interface ConversationsModule {
  readonly name: 'conversations';
}

/** Builds the module. Its dependencies arrive as arguments once the module has any (coding.md). */
export function createConversationsModule(): ConversationsModule {
  return { name: 'conversations' };
}
