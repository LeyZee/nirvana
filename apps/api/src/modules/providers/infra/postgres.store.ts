import {
  AiProviderSchema,
  AuditEntryIdSchema,
  newId,
  ProviderConnectionStateSchema,
  ProviderErrorKindSchema,
  ProviderFactSchema,
  ProviderSettingsSchema,
  ProviderVoiceSchema,
} from '@nirvana/contracts';
import {
  and,
  decryptSecret,
  encryptSecret,
  eq,
  keyVersionOf,
  schema,
  withAdmin,
  type Database,
  type EncryptionKey,
} from '@nirvana/db';
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
 * not open. A row whose key no longer decrypts (an encryption key dropped too early) reads as a key to replace, and
 * its ciphertext is left untouched so that putting the old encryption key back recovers it. The row's version is
 * `updated_at` in milliseconds, always written from here so it round-trips exactly.
 */
export function createPostgresCredentialStore(deps: PostgresStoreDeps): CredentialStore {
  function toCredential(row: Row): StoredCredential {
    const parsed = RowSchema.parse(row);
    let key: string | null;
    try {
      key = decryptSecret(row.keyCiphertext, deps.keys, parsed.provider);
    } catch {
      key = null;
    }
    return {
      provider: parsed.provider,
      key,
      keyLabel: row.keyLabel,
      summary: row.summary,
      facts: parsed.facts,
      settings: parsed.settings,
      voices: parsed.voices,
      state: key === null ? 'needs_reconnect' : parsed.state,
      verifiedAt: row.verifiedAt,
      charactersLeft: row.charactersLeft,
      lastErrorKind: key === null ? 'unauthorized' : parsed.lastErrorKind,
      revision: row.updatedAt.getTime(),
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
    async update(credential) {
      const updated = await withAdmin(deps.adminDb, (tx) =>
        tx
          .update(table)
          .set({
            keyLabel: credential.keyLabel,
            state: credential.state,
            summary: credential.summary,
            facts: credential.facts,
            settings: credential.settings,
            voices: credential.voices,
            charactersLeft: credential.charactersLeft,
            lastErrorKind: credential.lastErrorKind,
            verifiedAt: credential.verifiedAt,
            // Strictly later than the version read, even within the same millisecond.
            updatedAt: new Date(Math.max(Date.now(), credential.revision + 1)),
          })
          .where(
            and(eq(table.provider, credential.provider), eq(table.updatedAt, new Date(credential.revision))),
          )
          .returning({ provider: table.provider }),
      );
      return updated.length === 1;
    },
    async remove(provider) {
      await withAdmin(deps.adminDb, (tx) => tx.delete(table).where(eq(table.provider, provider)));
    },
  };
}

interface ResealReport {
  /** Rows re-sealed with the newest key. */
  readonly rewritten: number;
  /** Rows no key of the list opens: left as they are, so an older key put back can still recover them. */
  readonly unreadable: readonly string[];
}

/**
 * After a rotation of CREDENTIALS_ENCRYPTION_KEYS (`v2:<new>,v1:<old>`), re-seals every saved key with the newest
 * one, in one transaction, so that `v1` can then be dropped (runbooks/rotate-secrets.md). Re-running it is a no-op.
 * Only the ciphertext and its version change: the row's state and version (`updated_at`) are kept, so a check
 * running meanwhile still lands. Leaves an `audit_log` line, without any key.
 */
export function resealProviderCredentials(
  adminDb: Database,
  keys: readonly EncryptionKey[],
): Promise<ResealReport> {
  const current = keys[0]?.version;
  if (current === undefined) throw new Error('CREDENTIALS_ENCRYPTION_KEYS est vide');
  return withAdmin(adminDb, async (tx) => {
    const rows = await tx
      .select({ provider: table.provider, sealed: table.keyCiphertext })
      .from(table)
      .for('update');
    let rewritten = 0;
    const unreadable: string[] = [];
    for (const row of rows) {
      if (keyVersionOf(row.sealed) === current) continue;
      let key: string;
      try {
        key = decryptSecret(row.sealed, keys, row.provider);
      } catch {
        unreadable.push(row.provider);
        continue;
      }
      const sealed = encryptSecret(key, keys, row.provider);
      await tx
        .update(table)
        .set({ keyCiphertext: sealed, keyVersion: keyVersionOf(sealed) })
        .where(eq(table.provider, row.provider));
      rewritten += 1;
    }
    if (rewritten === 0 && unreadable.length === 0) return { rewritten, unreadable };
    await tx.insert(schema.auditLog).values({
      id: newId(AuditEntryIdSchema),
      userId: null,
      action: 'provider_key.reencrypted',
      entity: 'provider_credential',
      entityId: null,
      details: { keyVersion: current, rewritten, unreadable },
    });
    return { rewritten, unreadable };
  });
}
