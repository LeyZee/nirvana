// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

/** A fake `/v1/me` that answers each status in turn, the last one for good. */
function serveMe(...statuses: number[]): ReturnType<typeof vi.fn> {
  const fake = vi.fn(() => {
    const status = statuses.length > 1 ? (statuses.shift() ?? 401) : (statuses[0] ?? 401);
    return Promise.resolve(new Response('{}', { status }));
  });
  vi.stubGlobal('fetch', fake);
  return fake;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('App before any session', () => {
  it('shows it is loading while the session is read', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    render(<App />);
    expect(screen.getByRole('status', { name: 'Chargement de Nirvana' })).toBeDefined();
  });

  it('asks to sign in only when the server says there is no session', async () => {
    serveMe(401);
    render(<App />);
    expect(await screen.findByLabelText('Mot de passe')).toBeDefined();
  });

  it('says the server does not answer instead of asking to sign in, and asks again on its own', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetch = serveMe(502, 401);
    render(<App />);
    expect(await screen.findByText('ne répond pas')).toBeDefined();
    expect(screen.queryByLabelText('Mot de passe')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await screen.findByLabelText('Mot de passe')).toBeDefined();
  });

  it('says the same when the request does not even reach the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    render(<App />);
    expect(await screen.findByText('ne répond pas')).toBeDefined();
  });
});
