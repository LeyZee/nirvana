// @vitest-environment jsdom
import type { AgentMode } from '@nirvana/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentPill } from './AgentPill';

import { apiDashboard, serveDashboard } from '@/test/fakes';

async function renderPill(): Promise<HTMLElement> {
  const root = createRootRoute({
    component: (): JSX.Element => (
      <>
        <AgentPill />
        <Outlet />
      </>
    ),
  });
  const routes = ['/', '/suivi'].map((path) => createRoute({ getParentRoute: () => root, path }));
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/suivi'] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return screen.findByRole('link');
}

const live = (mode: AgentMode) => ({ status: 200, body: apiDashboard({ mode }) });

beforeEach(() => {
  // The router restores the scroll on each navigation; jsdom has no layout to scroll.
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AgentPill', () => {
  it('says nothing about the mode until the server answers', async () => {
    serveDashboard(live('copilot'));
    const pill = await renderPill();
    expect(pill.textContent).toBe('Agent');
  });

  it('says the server’s mode and opens the Dashboard', async () => {
    serveDashboard(live('copilot'));
    const pill = await renderPill();
    await waitFor(() => {
      expect(pill.textContent).toBe('Copilote');
    });
    expect(pill.getAttribute('href')).toBe('/');
    expect(pill.dataset['tone']).toBe('ok');
  });

  it('turns red when the server says the agent is stopped', async () => {
    serveDashboard(live('stop'));
    const pill = await renderPill();
    await waitFor(() => {
      expect(pill.textContent).toBe('Arrêt');
    });
    expect(pill.dataset['tone']).toBe('bad');
  });

  it('says « Inconnu » when the server does not answer, never the sample’s Copilote', async () => {
    serveDashboard({ status: 500 });
    const pill = await renderPill();
    await waitFor(() => {
      expect(pill.textContent).toBe('Inconnu');
    });
    expect(pill.dataset['tone']).toBe('unknown');
    expect(pill.getAttribute('title')).toContain('Le serveur ne répond pas');
  });

  it('says « Inconnu » before any creator exists, never the sample’s mode', async () => {
    serveDashboard(live('copilot'), []);
    const pill = await renderPill();
    await waitFor(() => {
      expect(pill.textContent).toBe('Inconnu');
    });
    expect(pill.getAttribute('title')).toContain('Aucune créatrice');
  });
});
