/** Public entry point of the `providers` module (ADR 0002, ADR 0016). Other modules import this file only. */
import type { AiProvider } from '@nirvana/contracts';

import {
  connectProvider,
  disconnectProvider,
  listProviderStatuses,
  reportRefusedKey,
  reverifyAll,
  reverifyProvider,
  updateProviderSettings,
  type ConnectionsDeps,
} from './application/connections';
import { createKeyCache, type KeyCache } from './application/key-cache';
import type { Clock, CredentialStore } from './domain/ports';
import { createElevenLabsVerifier } from './infra/elevenlabs.verifier';
import { createGoogleVerifier } from './infra/google.verifier';
import type { FetchLike } from './infra/http';
import { createXaiVerifier } from './infra/xai.verifier';

export { ProviderNotConnected } from './application/connections';
export { nextAction } from './domain/next-action';
export { createMemoryCredentialStore } from './infra/memory.store';

export interface ProvidersDeps {
  readonly store: CredentialStore;
  readonly fetch: FetchLike;
  readonly clock?: Clock;
  /** Null in production: there the dashboard is the only source of keys (ADR 0016). */
  readonly environmentKeys: ((provider: AiProvider) => string | undefined) | null;
  /** Called after each change, for the live stream of the Services section (SSE, fiche P3-03 point 5). */
  readonly onChange?: (provider: AiProvider) => void;
}

export interface ProvidersModule {
  readonly name: 'providers';
  /** The `ApiKeySource` handed to the LLM gateway and the speech client. */
  readonly apiKeySource: (provider: AiProvider) => string | undefined;
  /** Loads the saved keys into memory; call once at start-up. */
  readonly start: () => Promise<void>;
  readonly list: () => ReturnType<typeof listProviderStatuses>;
  readonly connect: (provider: AiProvider, key: string) => ReturnType<typeof connectProvider>;
  readonly reverify: (provider: AiProvider) => ReturnType<typeof reverifyProvider>;
  readonly reverifyAll: () => ReturnType<typeof reverifyAll>;
  readonly reportRefusedKey: (
    provider: AiProvider,
    kind: Parameters<typeof reportRefusedKey>[2],
  ) => Promise<void>;
  readonly updateSettings: (
    provider: AiProvider,
    settings: Parameters<typeof updateProviderSettings>[2],
  ) => ReturnType<typeof updateProviderSettings>;
  readonly disconnect: (provider: AiProvider) => ReturnType<typeof disconnectProvider>;
}

export function createProvidersModule(deps: ProvidersDeps): ProvidersModule {
  const cache: KeyCache = createKeyCache(deps.store, deps.environmentKeys);
  const connections: ConnectionsDeps = {
    store: deps.store,
    clock: deps.clock ?? { now: () => new Date() },
    verifiers: [
      createXaiVerifier({ fetch: deps.fetch }),
      createGoogleVerifier({ fetch: deps.fetch, compareWith: 'gemini-4-argon' }),
      createElevenLabsVerifier({ fetch: deps.fetch }),
    ],
    onChange: async (provider) => {
      await cache.reload();
      deps.onChange?.(provider);
    },
    hasEnvironmentKey: (provider) => deps.environmentKeys?.(provider) !== undefined,
  };
  return {
    name: 'providers',
    apiKeySource: (provider) => cache.lookup(provider),
    start: () => cache.reload(),
    list: () => listProviderStatuses(connections),
    connect: (provider, key) => connectProvider(connections, provider, key),
    reverify: (provider) => reverifyProvider(connections, provider),
    reverifyAll: () => reverifyAll(connections),
    reportRefusedKey: (provider, kind) => reportRefusedKey(connections, provider, kind),
    updateSettings: (provider, settings) => updateProviderSettings(connections, provider, settings),
    disconnect: (provider) => disconnectProvider(connections, provider),
  };
}
