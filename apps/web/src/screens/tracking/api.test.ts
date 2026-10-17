import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchCreators } from './api';

function answer(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchCreators', () => {
  it('reads the creators of the account', async () => {
    const creator = {
      id: '0192f3a0-0000-7000-8000-0000000000c1',
      displayName: 'Créatrice A',
      timezone: 'Europe/Paris',
    };
    answer(200, { creators: [creator] });
    expect(await fetchCreators()).toEqual([creator]);
  });

  it('has none to show on a server without the route yet', async () => {
    answer(404, { error: { code: 'route_not_found' } });
    expect(await fetchCreators()).toEqual([]);
  });

  it('fails on any other error, so the page says the server did not answer', async () => {
    answer(500, {});
    await expect(fetchCreators()).rejects.toThrow('500');
  });
});
