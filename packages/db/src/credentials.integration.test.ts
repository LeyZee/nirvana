import { randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { withAdmin } from './client';
import { decryptSecret, encryptSecret, keyVersionOf, parseEncryptionKeys } from './crypto';
import { providerCredentials } from './schema';
import { createTestDb, type TestDb } from './test/test-db';

const keys = parseEncryptionKeys(`v1:${randomBytes(32).toString('base64')}`);
const FAKE_KEY = 'xai-FAKEFAKEFAKEFAKEFAKEFAKE0000';

/** The Postgres message behind a failed query (Drizzle wraps it as `cause`). */
async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    return cause instanceof Error ? cause.message : String(cause);
  }
  return 'no error';
}

function row(state: string) {
  const sealed = encryptSecret(FAKE_KEY, keys, 'xai');
  return {
    provider: 'xai',
    keyCiphertext: sealed,
    keyVersion: keyVersionOf(sealed),
    state,
    summary: 'Grok 4.7 écrit et décide',
    verifiedAt: new Date('2026-10-17T19:00:00Z'),
  };
}

describe('provider_credentials (ADR 0016)', () => {
  let test: TestDb;

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
  });

  afterAll(async () => {
    await test.close();
  });

  it('keeps one sealed key per provider, readable through withAdmin only', async () => {
    await withAdmin(test.admin.db, (tx) => tx.insert(providerCredentials).values(row('connected')));
    const [saved] = await withAdmin(test.admin.db, (tx) =>
      tx.select().from(providerCredentials).where(eq(providerCredentials.provider, 'xai')),
    );
    expect(saved?.keyCiphertext.toString('utf8')).not.toContain(FAKE_KEY);
    expect(saved === undefined ? null : decryptSecret(saved.keyCiphertext, keys, 'xai')).toBe(FAKE_KEY);
    expect(
      await failure(
        withAdmin(test.admin.db, (tx) => tx.insert(providerCredentials).values(row('connected'))),
      ),
    ).toMatch(/duplicate key/);
  });

  it('is out of reach of the application role', async () => {
    expect(await failure(test.app.db.select().from(providerCredentials))).toMatch(/permission denied/);
  });

  it('refuses a state outside the stored ones', async () => {
    await withAdmin(test.admin.db, (tx) => tx.delete(providerCredentials));
    expect(
      await failure(
        withAdmin(test.admin.db, (tx) => tx.insert(providerCredentials).values(row('not_connected'))),
      ),
    ).toMatch(/provider_credentials_state_check/);
  });
});
