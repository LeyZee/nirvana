import type { AiProvider } from '@nirvana/contracts';

import type { StoredCredential } from './credential';

/** Saved keys. The Postgres adapter encrypts `key` with CREDENTIALS_ENCRYPTION_KEYS (ADR 0016). */
export interface CredentialStore {
  find(provider: AiProvider): Promise<StoredCredential | null>;
  list(): Promise<readonly StoredCredential[]>;
  save(credential: StoredCredential): Promise<void>;
  remove(provider: AiProvider): Promise<void>;
}

export interface Clock {
  now(): Date;
}
