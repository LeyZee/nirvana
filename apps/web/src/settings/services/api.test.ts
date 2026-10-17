import { afterEach, describe, expect, it, vi } from 'vitest';

import { confirmPassword, connectKey, disconnect, fetchOverview, ReauthRequired } from './api';

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

  it('asks for the password when the sign-in is too old for a key, and only then', async () => {
    answer(403, { error: { code: 'reauthentication_forbidden', message: 'x', details: {}, requestId: 'r' } });
    await expect(connectKey('xai', 'xai-FAKE')).rejects.toBeInstanceOf(ReauthRequired);
    await expect(disconnect('xai')).rejects.toBeInstanceOf(ReauthRequired);
    answer(403, { error: { code: 'role_forbidden', message: 'x', details: {}, requestId: 'r' } });
    const other = await disconnect('xai').catch((error: unknown) => error);
    expect(other).toBeInstanceOf(Error);
    expect(other).not.toBeInstanceOf(ReauthRequired);
  });

  it('confirms the password by signing in again as the current user', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        calls.push(
          `${init?.method ?? 'GET'} ${url} ${typeof init?.body === 'string' ? init.body : ''}`.trim(),
        );
        const body =
          url === '/v1/me'
            ? { id: 'u1', email: 'owner@example.test', name: 'Owner', role: 'owner', creatorIds: [] }
            : { user: {} };
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      }),
    );
    expect(await confirmPassword('correct horse battery')).toBe('ok');
    expect(calls).toEqual([
      'GET /v1/me',
      'POST /v1/auth/sign-in/email {"email":"owner@example.test","password":"correct horse battery"}',
    ]);
  });
});
