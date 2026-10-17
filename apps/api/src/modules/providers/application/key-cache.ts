import type { AiProvider } from '@nirvana/contracts';

import type { CredentialStore } from '../domain/ports';

/**
 * The synchronous key lookup the LLM gateway and the speech client read (`ApiKeySource`, ADR 0016). It mirrors the
 * saved keys in memory and is reloaded after every change; a server restart reloads it from the database.
 */
export interface KeyCache {
  lookup(provider: AiProvider): string | undefined;
  reload(): Promise<void>;
}

/**
 * `environmentFallback` is null in production: there, only the dashboard counts. A key that needs reconnecting is
 * not handed out, so the gateway moves to the role's fallback model at once instead of collecting more refusals.
 */
export function createKeyCache(
  store: CredentialStore,
  environmentFallback: ((provider: AiProvider) => string | undefined) | null,
): KeyCache {
  let keys = new Map<AiProvider, string | null>();
  return {
    lookup(provider) {
      if (keys.has(provider)) return keys.get(provider) ?? undefined;
      return environmentFallback?.(provider);
    },
    async reload() {
      const saved = await store.list();
      keys = new Map(saved.map((c) => [c.provider, c.state === 'needs_reconnect' ? null : c.key]));
    },
  };
}
