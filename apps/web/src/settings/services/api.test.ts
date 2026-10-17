import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectKey, fetchOverview } from './api';

const status = {
  provider: 'xai',
  state: 'connected',
  source: 'dashboard',
  keyLabel: 'nirvana-prod',
  verifiedAt: '2026-10-17T20:00:00.000Z',
  message: 'Grok 4.7 écrit et décide',
  facts: [{ label: 'Modèle', value: 'Grok 4.7' }],
  settings: {},
  voices: [],
};

function answer(statusCode: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: statusCode }))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Services API client', () => {
  it('reads a connected key and a refusal, never anything else', async () => {
    answer(200, status);
    expect(await connectKey('xai', 'xai-FAKE')).toEqual({ ok: true, status });
    answer(422, { kind: 'unauthorized', message: 'xAI ne reconnaît pas cette clé.' });
    expect(await connectKey('xai', 'xai-FAKE')).toEqual({
      ok: false,
      refusal: { kind: 'unauthorized', message: 'xAI ne reconnaît pas cette clé.' },
    });
  });

  it('fails loudly on a shape it does not expect', async () => {
    answer(200, { services: 'nope' });
    await expect(fetchOverview()).rejects.toThrow();
    answer(403, { error: 'forbidden' });
    await expect(fetchOverview()).rejects.toThrow('GET : 403');
  });
});
