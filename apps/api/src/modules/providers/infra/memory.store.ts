import type { AiProvider } from '@nirvana/contracts';

import type { StoredCredential } from '../domain/credential';
import type { CredentialStore } from '../domain/ports';

/** Tests, and development until the Postgres store lands with P0-03 (fiche P3-03, step 2). Nothing persists. */
export function createMemoryCredentialStore(): CredentialStore {
  const rows = new Map<AiProvider, StoredCredential>();
  return {
    find: (provider) => Promise.resolve(rows.get(provider) ?? null),
    list: () => Promise.resolve([...rows.values()]),
    save: (credential) => {
      rows.set(credential.provider, credential);
      return Promise.resolve();
    },
    remove: (provider) => {
      rows.delete(provider);
      return Promise.resolve();
    },
  };
}
