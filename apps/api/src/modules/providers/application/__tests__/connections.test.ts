import type { AiProvider } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import type { VerificationOutcome } from '../../domain/verification';
import { createMemoryCredentialStore } from '../../infra/memory.store';
import {
  connectProvider,
  disconnectProvider,
  listProviderStatuses,
  reportRefusedKey,
  reverifyProvider,
  updateProviderSettings,
  type ConnectionsDeps,
} from '../connections';
import { createKeyCache } from '../key-cache';

const OLD_KEY = 'xai-OLDFAKEOLDFAKEOLDFAKE0000';
const NEW_KEY = 'xai-NEWFAKENEWFAKENEWFAKE0000';

const works: VerificationOutcome = {
  ok: true,
  keyLabel: 'nirvana-prod',
  summary: 'Grok 4.7 écrit et décide',
  facts: [],
  settings: {},
  voices: [],
  charactersLeft: null,
  isLowCredit: false,
};

/** A fake xAI whose answer the test sets; it records every key it was shown. */
function setup(answer: { current: VerificationOutcome }) {
  const store = createMemoryCredentialStore();
  const changes: AiProvider[] = [];
  const deps: ConnectionsDeps = {
    store,
    clock: { now: () => new Date('2026-10-17T19:00:00Z') },
    verifiers: [{ provider: 'xai', verify: () => Promise.resolve(answer.current) }],
    onChange: (provider) => {
      changes.push(provider);
    },
  };
  return { deps, store, changes };
}

describe('connecting a key', () => {
  it('saves a key the provider accepts and shows what it found', async () => {
    const { deps, store, changes } = setup({ current: works });
    const result = await connectProvider(deps, 'xai', OLD_KEY);
    expect(result).toMatchObject({ ok: true, value: { state: 'connected', keyLabel: 'nirvana-prod' } });
    expect((await store.find('xai'))?.key).toBe(OLD_KEY);
    expect(changes).toEqual(['xai']);
  });

  it('answers a misplaced key without calling the provider', async () => {
    const { deps, store } = setup({ current: { ok: false, kind: 'unreachable' } });
    const result = await connectProvider(deps, 'xai', 'AIzaFAKEFAKEFAKEFAKEFAKEFAKE000');
    expect(result).toEqual({
      ok: false,
      error: { kind: 'wrong_provider', message: 'Cette clé vient de Google : elle va dans Gemini.' },
    });
    expect(await store.find('xai')).toBeNull();
  });

  it('keeps the old key running when the replacement is refused', async () => {
    const answer: { current: VerificationOutcome } = { current: works };
    const { deps, store } = setup(answer);
    await connectProvider(deps, 'xai', OLD_KEY);
    answer.current = { ok: false, kind: 'model_not_allowed' };
    const result = await connectProvider(deps, 'xai', NEW_KEY);
    expect(result.ok).toBe(false);
    expect((await store.find('xai'))?.key).toBe(OLD_KEY);
  });
});

describe('after the connection', () => {
  it('ignores an unreachable provider but turns red on a refusal', async () => {
    const answer: { current: VerificationOutcome } = { current: works };
    const { deps } = setup(answer);
    await connectProvider(deps, 'xai', OLD_KEY);
    answer.current = { ok: false, kind: 'unreachable' };
    expect((await reverifyProvider(deps, 'xai')).state).toBe('connected');
    answer.current = { ok: false, kind: 'unauthorized' };
    expect((await reverifyProvider(deps, 'xai')).state).toBe('needs_reconnect');
  });

  it('turns red at once when a production call is refused, and the cache stops handing out the key', async () => {
    const { deps, store } = setup({ current: works });
    const cache = createKeyCache(store, null);
    await connectProvider(deps, 'xai', OLD_KEY);
    await cache.reload();
    expect(cache.lookup('xai')).toBe(OLD_KEY);
    await reportRefusedKey(deps, 'xai', 'unauthorized');
    await cache.reload();
    expect(cache.lookup('xai')).toBeUndefined();
    expect((await listProviderStatuses(deps))[0]?.state).toBe('needs_reconnect');
  });

  it('keeps the chosen voice and forgets everything on disconnect', async () => {
    const { deps, store } = setup({ current: works });
    await connectProvider(deps, 'xai', OLD_KEY);
    const updated = await updateProviderSettings(deps, 'xai', { voice: { id: 'v1', name: 'Messa' } });
    expect(updated.settings.voice).toEqual({ id: 'v1', name: 'Messa' });
    const status = await disconnectProvider(deps, 'xai');
    expect(status.state).toBe('not_connected');
    expect(await store.find('xai')).toBeNull();
  });
});

describe('key cache', () => {
  it('uses the environment only when given one and nothing is saved', async () => {
    const store = createMemoryCredentialStore();
    const dev = createKeyCache(store, (p) => (p === 'xai' ? 'env-key' : undefined));
    const production = createKeyCache(store, null);
    await dev.reload();
    await production.reload();
    expect(dev.lookup('xai')).toBe('env-key');
    expect(production.lookup('xai')).toBeUndefined();
  });

  it('lists the three services in reading order, the environment marked as such', async () => {
    const { deps } = setup({ current: works });
    const statuses = await listProviderStatuses({ ...deps, hasEnvironmentKey: (p) => p === 'google' });
    expect(statuses.map((s) => [s.provider, s.source])).toEqual([
      ['xai', null],
      ['google', 'environment'],
      ['elevenlabs', null],
    ]);
  });
});
