import type { AiProvider } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import type { VerificationOutcome } from '../../domain/verification';
import { createMemoryCredentialStore } from '../../infra/memory.store';
import {
  connectProvider,
  disconnectProvider,
  listProviderStatuses,
  createRefusalReporter,
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

  it('turns red at once when a production call is refused and the provider confirms it', async () => {
    const answer: { current: VerificationOutcome } = { current: works };
    const { deps, store } = setup(answer);
    const cache = createKeyCache(store, null);
    await connectProvider(deps, 'xai', OLD_KEY);
    await cache.reload();
    expect(cache.lookup('xai')).toBe(OLD_KEY);
    answer.current = { ok: false, kind: 'unauthorized' };
    await createRefusalReporter(deps)('xai', 'unauthorized');
    await cache.reload();
    expect(cache.lookup('xai')).toBeUndefined();
    expect((await listProviderStatuses(deps))[0]).toMatchObject({ state: 'needs_reconnect' });
  });

  it('keeps a voice of the account, refuses any other, and forgets everything on disconnect', async () => {
    const { deps, store } = setup({ current: { ...works, voices: [{ id: 'v1', name: 'Messa' }] } });
    await connectProvider(deps, 'xai', OLD_KEY);
    const updated = await updateProviderSettings(deps, 'xai', { voice: { id: 'v1', name: 'Messa' } });
    expect(updated.settings.voice).toEqual({ id: 'v1', name: 'Messa' });
    await expect(updateProviderSettings(deps, 'xai', { voice: { id: 'v9', name: 'Autre' } })).rejects.toThrow(
      /n’existe pas/,
    );
    const status = await disconnectProvider(deps, 'xai');
    expect(status.state).toBe('not_connected');
    expect(await store.find('xai')).toBeNull();
  });
});

describe('a refusal reported for a key replaced since (recette, bug 2)', () => {
  /** xAI refuses the old (leaked, revoked) key and accepts the new one; it counts the checks. */
  function twoKeys() {
    const checked: string[] = [];
    const { deps, store } = setup({ current: works });
    const xai: ConnectionsDeps = {
      ...deps,
      verifiers: [
        {
          provider: 'xai',
          verify: (key) => {
            checked.push(key);
            return Promise.resolve(key === OLD_KEY ? { ok: false, kind: 'unauthorized' } : works);
          },
        },
      ],
    };
    return { deps: xai, store, checked };
  }

  it('leaves the new key green when the worker still used the old one', async () => {
    const { deps, store, checked } = twoKeys();
    await connectProvider(deps, 'xai', NEW_KEY);
    const report = createRefusalReporter(deps);
    // The worker, still holding the revoked key for a few seconds, sees three refusals.
    await Promise.all([report('xai', 'unauthorized'), report('xai', 'unauthorized')]);
    await report('xai', 'unauthorized');
    expect(await store.find('xai')).toMatchObject({ key: NEW_KEY, state: 'connected' });
    // One check for the concurrent pair, none for the third: the accepted key is trusted for a minute.
    expect(checked.filter((key) => key === NEW_KEY)).toHaveLength(2);
  });

  it('concludes nothing when the provider cannot be reached to confirm', async () => {
    const answer: { current: VerificationOutcome } = { current: works };
    const { deps, store } = setup(answer);
    await connectProvider(deps, 'xai', OLD_KEY);
    answer.current = { ok: false, kind: 'unreachable' };
    await createRefusalReporter(deps)('xai', 'unauthorized');
    expect(await store.find('xai')).toMatchObject({ state: 'connected' });
  });

  it('ignores a service that has no saved key', async () => {
    const { deps, store } = setup({ current: works });
    await createRefusalReporter(deps)('xai', 'unauthorized');
    expect(await store.find('xai')).toBeNull();
  });
});

describe('a check running while the key changes', () => {
  /** xAI answers at once for a new key, and only when the test says so for the old one (a slow provider). */
  async function slowCheck() {
    const { deps, store } = setup({ current: works });
    await connectProvider(deps, 'xai', OLD_KEY);
    let answerOldKey: (outcome: VerificationOutcome) => void = () => undefined;
    const slow: ConnectionsDeps = {
      ...deps,
      verifiers: [
        {
          provider: 'xai',
          verify: (key) =>
            key === OLD_KEY
              ? new Promise<VerificationOutcome>((resolve) => {
                  answerOldKey = resolve;
                })
              : Promise.resolve(works),
        },
      ],
    };
    const check = reverifyProvider(slow, 'xai');
    await Promise.resolve();
    return {
      deps: slow,
      store,
      check,
      answerOldKey: (outcome: VerificationOutcome) => {
        answerOldKey(outcome);
      },
    };
  }

  it('does not bring back a key disconnected meanwhile', async () => {
    const { deps, store, check, answerOldKey } = await slowCheck();
    await disconnectProvider(deps, 'xai');
    answerOldKey({ ok: false, kind: 'unauthorized' });
    expect((await check).state).toBe('not_connected');
    expect(await store.find('xai')).toBeNull();
  });

  it('does not overwrite a key replaced meanwhile', async () => {
    const { deps, store, check, answerOldKey } = await slowCheck();
    await connectProvider(deps, 'xai', NEW_KEY);
    answerOldKey({ ok: false, kind: 'unauthorized' });
    expect((await check).state).toBe('connected');
    expect(await store.find('xai')).toMatchObject({ key: NEW_KEY, state: 'connected' });
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
