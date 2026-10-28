// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TelegramSection } from './TelegramSection';
import { TelegramOff, fetchDeliveries, fetchOverview } from './api';
import { parseTelegramSearch, searchOfTab, tabOfSearch } from './search';

vi.mock('./api', async (actual) => ({
  ...(await actual<typeof import('./api')>()),
  fetchOverview: vi.fn(),
  fetchDeliveries: vi.fn(),
}));

function renderSection(): void {
  const rootRoute = createRootRoute();
  const page = createRoute({ getParentRoute: () => rootRoute, path: '/', component: TelegramSection });
  const router = createRouter({
    routeTree: rootRoute.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  vi.mocked(fetchDeliveries).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('Réglages › Telegram when the page cannot load', () => {
  it('blames the server, not Telegram, when Nirvana itself does not answer', async () => {
    vi.mocked(fetchOverview).mockRejectedValue(new TypeError('Failed to fetch'));
    renderSection();
    expect(await screen.findByText('Le serveur ne répond pas')).toBeTruthy();
    expect(screen.queryByText(/Telegram ne répond pas/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });

  it('says Telegram is off when the server runs without it', async () => {
    vi.mocked(fetchOverview).mockRejectedValue(new TelegramOff());
    renderSection();
    expect(await screen.findByText('Telegram est éteint')).toBeTruthy();
    expect(screen.queryByText('Le serveur ne répond pas')).toBeNull();
  });
});

describe('Réglages › Telegram with its tab in the address', () => {
  /** Renders the page at `address`; gives what the address now holds and how many steps back it has. */
  function renderAt(address: string): () => { search: unknown; steps: number } {
    const rootRoute = createRootRoute();
    const page = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateSearch: parseTelegramSearch,
      component: function Page() {
        const search = page.useSearch();
        const navigate = page.useNavigate();
        return (
          <TelegramSection
            tab={tabOfSearch(search)}
            onTab={(tab) => void navigate({ search: searchOfTab(tab), replace: true })}
          />
        );
      },
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([page]),
      history: createMemoryHistory({ initialEntries: [address] }),
    });
    render(<RouterProvider router={router} />);
    return () => ({ search: router.state.location.search, steps: router.history.length });
  }

  beforeEach(() => {
    vi.mocked(fetchOverview).mockResolvedValue({ bots: [], routes: [], coverage: [], version: 0 });
    // jsdom lays nothing out: the chosen tab scrolls into view on a phone, here a no-op.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('opens Ventes from ?onglet=ventes, as a link from Réglages › Alertes does', async () => {
    renderAt('/?onglet=ventes');
    expect((await screen.findByRole('tab', { name: /Ventes/ })).getAttribute('aria-selected')).toBe('true');
  });

  it('falls back on Alertes for a tab it does not know, without an error', async () => {
    renderAt('/?onglet=inconnu');
    expect((await screen.findByRole('tab', { name: /Alertes/ })).getAttribute('aria-selected')).toBe('true');
  });

  it('writes a tab change in the address in place, without one more step back', async () => {
    const address = renderAt('/');
    fireEvent.click(await screen.findByRole('tab', { name: /Bots et groupes/ }));
    expect(await screen.findByRole('tab', { name: /Bots et groupes/, selected: true })).toBeTruthy();
    expect(address()).toEqual({ search: { onglet: 'bots' }, steps: 1 });
  });
});
