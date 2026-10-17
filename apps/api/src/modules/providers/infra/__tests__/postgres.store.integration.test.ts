import { randomBytes } from 'node:crypto';

import { parseEncryptionKeys, schema, withAdmin } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import type { NewCredential } from '../../domain/credential';
import { createPostgresCredentialStore } from '../postgres.store';

const FAKE_KEY = 'sk_FAKEFAKEFAKEFAKEFAKEFAKE0000';

const newKey = (version: string) => parseEncryptionKeys(`${version}:${randomBytes(32).toString('base64')}`);

const elevenlabs: NewCredential = {
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
  revision: 0,
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
    const saved = await store.find('elevenlabs');
    expect(saved).toEqual({ ...elevenlabs, revision: saved?.revision });
    expect(saved?.revision).toBeGreaterThan(0);

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

  it('writes a status only over the version it read, never the key', async () => {
    const store = createPostgresCredentialStore({ adminDb: test.admin.db, keys: newKey('v1') });
    await store.save(elevenlabs);
    const read = await store.find('elevenlabs');
    if (read === null) throw new Error('saved row not found');

    expect(await store.update({ ...read, state: 'low_credit', key: 'ignored' })).toBe(true);
    const after = await store.find('elevenlabs');
    expect(after).toMatchObject({ state: 'low_credit', key: FAKE_KEY });
    // A second write from the same stale read loses, as a 15-minute check must against a replacement.
    expect(await store.update({ ...read, state: 'needs_reconnect' })).toBe(false);
    expect(await store.find('elevenlabs')).toMatchObject({ state: 'low_credit' });

    await store.remove('elevenlabs');
    expect(await store.update(read)).toBe(false);
    expect(await store.find('elevenlabs')).toBeNull();
  });

  it('reads a key it can no longer open as one to replace, and leaves its seal intact', async () => {
    const original = newKey('v1');
    await createPostgresCredentialStore({ adminDb: test.admin.db, keys: original }).save(elevenlabs);
    const rotatedTooEarly = createPostgresCredentialStore({ adminDb: test.admin.db, keys: newKey('v2') });
    const unreadable = await rotatedTooEarly.find('elevenlabs');
    expect(unreadable).toMatchObject({ key: null, state: 'needs_reconnect', lastErrorKind: 'unauthorized' });
    if (unreadable === null) throw new Error('saved row not found');

    await rotatedTooEarly.update({ ...unreadable, settings: {} });
    // Putting the old encryption key back recovers the key.
    const restored = createPostgresCredentialStore({ adminDb: test.admin.db, keys: original });
    expect(await restored.find('elevenlabs')).toMatchObject({ key: FAKE_KEY });
  });
});
