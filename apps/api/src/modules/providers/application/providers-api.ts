import type {
  AiProvider,
  ProviderErrorKind,
  ProviderSettings,
  ProviderStatus,
  Result,
} from '@nirvana/contracts';

import type { ConnectRefusal } from './connections';

/** What the dashboard routes and the 15-minute job call; bound to its dependencies by `createProvidersModule`. */
export interface ProvidersApi {
  list(): Promise<readonly ProviderStatus[]>;
  connect(provider: AiProvider, key: string): Promise<Result<ProviderStatus, ConnectRefusal>>;
  reverify(provider: AiProvider): Promise<ProviderStatus>;
  reverifyAll(): Promise<readonly ProviderStatus[]>;
  /** The gateway saw a 401 or 403 on a real call (fiche P3-03, point 6). */
  reportRefusedKey(provider: AiProvider, kind: ProviderErrorKind): Promise<void>;
  updateSettings(provider: AiProvider, settings: ProviderSettings): Promise<ProviderStatus>;
  disconnect(provider: AiProvider): Promise<ProviderStatus>;
}
