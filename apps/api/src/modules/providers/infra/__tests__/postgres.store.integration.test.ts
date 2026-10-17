import { randomBytes } from 'node:crypto';

import { parseEncryptionKeys, schema, withAdmin } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import type { StoredCredential } from '../../domain/credential';
import { createPostgresCredentialStore } from '../postgres.store';

const FAKE_KEY = 'sk_FAKEFAKEFAKEFAKEFAKEFAKE0000';

const newKey = (version: string) => parseEncryptionKeys(`${version}:${randomBytes(32).toString('base64')}`);

const elevenlabs: StoredCredential = {
  provider: 'elevenlabs',
  key: FAKE_KEY,
  keyLabel: null,
  summary: 'Voix de Démo · 1 000 vocaux ce mois',
  facts: [{ label: 'Ce mois', value: '1 000 vocaux possibles' }],
  settings: { voice: { id: 'v-demo', name: 'Démo' } },
  voices: [{ id: 'v-demo', name: 'Démo' }],
  state: 'connected',
  verifiedAt: new Date('2026-10-17T19:00:00Z'),
  charactersLeft: 100_000,
  lastErrorKind: null,
};

describe('Postgres credential store (ADR 0016)', () => {
  let test: TestDb;

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
  });

  afterAll(async () => {
    await test.close();
  });

  it('saves, replaces and removes a key, sealed at rest', async () => {
    const store = createPostgresCredentialStore({ adminDb: test.admin.db, keys: newKey('v1') });
    await store.save(elevenlabs);
    expect(await store.find('elevenlabs')).toEqual(elevenlabs);

    await store.save({ ...elevenlabs, state: 'low_credit', charactersLeft: 900 });
    expect(await store.list()).toMatchObject([
      { provider: 'elevenlabs', state: 'low_credit', charactersLeft: 900 },
    ]);

    const [row] = await withAdmin(test.admin.db, (tx) => tx.select().from(schema.providerCredentials));
    expect(row?.keyCiphertext.includes(FAKE_KEY)).toBe(false);
    expect(row?.keyVersion).toBe('v1');

    await store.remove('elevenlabs');
    expect(await store.find('elevenlabs')).toBeNull();
  });

  it('reads a key it can no longer open as one to replace, and still lists the others', async () => {
    await createPostgresCredentialStore({ adminDb: test.admin.db, keys: newKey('v1') }).save(elevenlabs);
    const rotatedTooEarly = createPostgresCredentialStore({ adminDb: test.admin.db, keys: newKey('v2') });
    expect(await rotatedTooEarly.find('elevenlabs')).toMatchObject({
      key: '',
      state: 'needs_reconnect',
      lastErrorKind: 'unauthorized',
    });
  });
});
