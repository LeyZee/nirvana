import type { AiProvider } from '@nirvana/contracts';

import type { NewCredential, StoredCredential } from './credential';

/** Saved keys. The Postgres adapter encrypts `key` with CREDENTIALS_ENCRYPTION_KEYS (ADR 0016). */
export interface CredentialStore {
  find(provider: AiProvider): Promise<StoredCredential | null>;
  list(): Promise<readonly StoredCredential[]>;
  /** A connection or a replacement: writes the whole row, key included, whatever was there. */
  save(credential: NewCredential): Promise<void>;
  /**
   * A check, a refusal seen in production or a new setting: writes the state and the settings, never the key, and
   * only if the row is still at `credential.revision`. False when it changed or went away meanwhile (a replacement
   * or a disconnection during a 15-minute check must win).
   */
  update(credential: StoredCredential): Promise<boolean>;
  remove(provider: AiProvider): Promise<void>;
}

export interface Clock {
  now(): Date;
}
