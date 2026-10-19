// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from './DashboardPage';

import { apiDashboard, serveDashboard } from '@/test/fakes';

/** The shared mode reaches its readers on the next tick. */
const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

beforeEach(() => {
  // What jsdom lacks and the screen uses only for motion, layout and the router's scroll restoration.
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDashboard(): QueryClient {
  // No delay before the one retry: a failing server shows at once.
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  // The night banner links to Réglages: the page needs a router around it.
  const root = createRootRoute();
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/', component: DashboardPage }),
      createRoute({ getParentRoute: () => root, path: '/reglages/telegram' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return client;
}

const headline = (): string => document.querySelector('h1')?.textContent ?? '';
const dialog = (): HTMLElement => screen.getByRole('dialog', { hidden: true });

describe('DashboardPage on the server’s data', () => {
  it('waits for the server without showing any figure', async () => {
    serveDashboard({ status: 200, body: apiDashboard() });
    renderDashboard();
    expect(await screen.findByRole('status', { name: 'Chargement du Dashboard' })).toBeDefined();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('shows what the server says, with no « Exemple » badge and no sales made up', async () => {
    serveDashboard({ status: 200, body: apiDashboard() });
    renderDashboard();
    expect(await screen.findByText('Kévin')).toBeDefined();
    expect(screen.queryByText('Exemple')).toBeNull();
    expect(headline()).toBe('Une chose t’attend, dont une urgente');
    expect(screen.getByText(/dès que la connexion à Reveal les observera/u)).toBeDefined();
    expect(screen.getByText('Théo')).toBeDefined();
    // A todo of the server leaves the list when its conversation is handled, not on a tick here.
    expect(screen.queryByRole('button', { name: 'Marquer comme traité' })).toBeNull();
  });

  it('says under the hero when nobody is warned at night', async () => {
    serveDashboard({ status: 200, body: apiDashboard({ telegramCoverage: { urgentReachable: false } }) });
    renderDashboard();
    expect(await screen.findByText('Personne n’est prévenu la nuit')).toBeDefined();
  });

  it('shows the server’s mode and does not pretend to change it', async () => {
    serveDashboard({ status: 200, body: apiDashboard({ mode: 'stop' }) });
    renderDashboard();
    const stop = await screen.findByRole('radio', { name: 'Arrêt' });
    expect(stop.getAttribute('aria-checked')).toBe('true');
    expect(headline()).toContain('arrêté');
    // No route writes the mode yet: no « Repasser en copilote », and Copilote cannot be picked.
    expect(screen.queryByRole('button', { name: 'Repasser en copilote' })).toBeNull();
    const copilot = screen.getByRole('radio', { name: 'Copilote' });
    expect(copilot.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(copilot);
    expect(copilot.getAttribute('aria-checked')).toBe('false');
  });

  it('never opens the stop dialog when the mode cannot be written', async () => {
    serveDashboard({ status: 200, body: apiDashboard() });
    renderDashboard();
    fireEvent.click(await screen.findByRole('radio', { name: 'Arrêt' }));
    expect(dialog().getAttribute('aria-hidden')).toBe('true');
  });
});

describe('DashboardPage when the server does not answer', () => {
  it('says so in one sentence, with no figure and nothing to act on', async () => {
    serveDashboard({ status: 500 });
    renderDashboard();
    expect(await screen.findByText('ne répond pas')).toBeDefined();
    expect(headline()).toBe('Le serveur ne répond pas');
    expect(screen.getByText('Léa')).toBeDefined();
    expect(screen.queryByText('Exemple')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('never keeps an older answer on screen once a read fails', async () => {
    let up = true;
    serveDashboard(() => (up ? { status: 200, body: apiDashboard() } : { status: 500 }));
    const client = renderDashboard();
    expect(await screen.findByText('Kévin')).toBeDefined();
    up = false;
    await act(async () => {
      await client.refetchQueries({ queryKey: ['dashboard'] });
      await tick();
    });
    expect(headline()).toBe('Le serveur ne répond pas');
    expect(screen.queryByText('Kévin')).toBeNull();
  });
});

describe('DashboardPage before any creator exists', () => {
  it('shows the sample, marked « Exemple », where nothing can be acted on', async () => {
    serveDashboard({ status: 200, body: apiDashboard() }, []);
    renderDashboard();
    expect(await screen.findByText('Exemple')).toBeDefined();
    expect(headline()).toContain('3 choses');
    expect(screen.getByRole('radio', { name: 'Arrêt' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Arrêt' }));
    expect(dialog().getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Marquer comme traité' })).toBeNull();
  });
});
