import {
  AiProviderSchema,
  ProviderConnectionStateSchema,
  ProviderErrorKindSchema,
  ProviderFactSchema,
  ProviderSettingsSchema,
  ProviderVoiceSchema,
} from '@nirvana/contracts';
import {
  decryptSecret,
  encryptSecret,
  keyVersionOf,
  schema,
  withAdmin,
  type Database,
  type EncryptionKey,
} from '@nirvana/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { StoredCredential } from '../domain/credential';
import type { CredentialStore } from '../domain/ports';

const table = schema.providerCredentials;
type Row = typeof table.$inferSelect;

const StoredStateSchema = ProviderConnectionStateSchema.exclude(['not_connected']);

/** The jsonb and text columns, checked on the way out like any other boundary. */
const RowSchema = z.object({
  provider: AiProviderSchema,
  state: StoredStateSchema,
  facts: z.array(ProviderFactSchema),
  settings: ProviderSettingsSchema,
  voices: z.array(ProviderVoiceSchema),
  lastErrorKind: ProviderErrorKindSchema.nullable(),
});

export interface PostgresStoreDeps {
  /** The admin connection: `provider_credentials` is revoked from the application role (ADR 0016). */
  readonly adminDb: Database;
  /** CREDENTIALS_ENCRYPTION_KEYS, newest first. */
  readonly keys: readonly EncryptionKey[];
}

/**
 * Keys sealed with AES-256-GCM, the provider bound as associated data so a ciphertext copied to another row does
 * not open. A row whose key no longer decrypts (an encryption key dropped too early) reads as a key to replace.
 */
export function createPostgresCredentialStore(deps: PostgresStoreDeps): CredentialStore {
  function toCredential(row: Row): StoredCredential {
    const parsed = RowSchema.parse(row);
    let key: string;
    try {
      key = decryptSecret(row.keyCiphertext, deps.keys, parsed.provider);
    } catch {
      key = '';
    }
    return {
      provider: parsed.provider,
      key,
      keyLabel: row.keyLabel,
      summary: row.summary,
      facts: parsed.facts,
      settings: parsed.settings,
      voices: parsed.voices,
      state: key === '' ? 'needs_reconnect' : parsed.state,
      verifiedAt: row.verifiedAt,
      charactersLeft: row.charactersLeft,
      lastErrorKind: key === '' ? 'unauthorized' : parsed.lastErrorKind,
    };
  }

  return {
    async find(provider) {
      const rows = await withAdmin(deps.adminDb, (tx) =>
        tx.select().from(table).where(eq(table.provider, provider)),
      );
      const row = rows[0];
      return row === undefined ? null : toCredential(row);
    },
    async list() {
      const rows = await withAdmin(deps.adminDb, (tx) => tx.select().from(table));
      return rows.map(toCredential);
    },
    async save(credential) {
      const sealed = encryptSecret(credential.key, deps.keys, credential.provider);
      const values = {
        keyCiphertext: sealed,
        keyVersion: keyVersionOf(sealed),
        keyLabel: credential.keyLabel,
        state: credential.state,
        summary: credential.summary,
        facts: credential.facts,
        settings: credential.settings,
        voices: credential.voices,
        charactersLeft: credential.charactersLeft,
        lastErrorKind: credential.lastErrorKind,
        verifiedAt: credential.verifiedAt,
        updatedAt: new Date(),
      };
      await withAdmin(deps.adminDb, (tx) =>
        tx
          .insert(table)
          .values({ provider: credential.provider, ...values })
          .onConflictDoUpdate({ target: table.provider, set: values }),
      );
    },
    async remove(provider) {
      await withAdmin(deps.adminDb, (tx) => tx.delete(table).where(eq(table.provider, provider)));
    },
  };
}
