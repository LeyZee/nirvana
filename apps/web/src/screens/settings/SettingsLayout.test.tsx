// @vitest-environment jsdom
import type { Me } from '@nirvana/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '@/router';

/* Invented members: no real person. */
const base = { id: 'u1', email: 'membre@example.test', name: 'Nora', creatorIds: [], routedCreatorIds: [] };
const owner: Me = { ...base, role: 'owner', team: null, teamScope: 'owner' };
const creator: Me = { ...base, role: 'creator', team: null, teamScope: 'self' };

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  );
  // The pages stay on their loading state: only the tabs are under test.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => undefined)),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function settingsTabs(user: Me): Promise<string[]> {
  const router = createAppRouter(
    { user, onSignOut: () => undefined },
    createMemoryHistory({ initialEntries: ['/reglages/apparence'] }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const nav = await screen.findByRole('navigation', { name: 'Réglages' });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent);
}

describe('Réglages tabs', () => {
  it('gives Telegram to the owner, whom the server serves it to', async () => {
    expect(await settingsTabs(owner)).toContain('Telegram');
  });

  it('shows neither Telegram nor Modèles IA to a member the server would refuse', async () => {
    const tabs = await settingsTabs(creator);
    expect(tabs).not.toContain('Telegram');
    expect(tabs).not.toContain('Modèles IA');
    expect(tabs).toContain('Apparence');
  });

  it('puts « Se déconnecter » under a class of its own, hidden on a wide screen by settings.css', async () => {
    await settingsTabs(owner);
    expect(screen.getByRole('button', { name: 'Se déconnecter' }).className).toContain('st-signout');
  });
});
