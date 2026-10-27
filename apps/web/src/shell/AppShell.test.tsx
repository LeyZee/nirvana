// @vitest-environment jsdom
import type { Me } from '@nirvana/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter, type AppRouter } from '../router';

import { RailNav } from './AppShell';
import type { NavItem, Rail } from './nav';

const base = { id: 'u1', email: 'membre@example.test', name: 'Nora', creatorIds: [] };
const owner: Me = { ...base, role: 'owner', team: null, teamScope: 'owner' };
const manager: Me = {
  ...base,
  role: 'operator',
  team: { role: 'manager', status: 'active' },
  teamScope: 'agency',
};
const chatter: Me = {
  ...base,
  role: 'operator',
  team: { role: 'chatter', status: 'active' },
  teamScope: 'self',
};

beforeEach(() => {
  // The router restores the scroll on each navigation; jsdom has no layout to scroll.
  vi.stubGlobal('scrollTo', vi.fn());
  // The screens stay on their loading state: only the shell is under test.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => undefined)),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderApp(user: Me, path: string): AppRouter {
  const router = createAppRouter(
    { user, onSignOut: () => undefined },
    createMemoryHistory({ initialEntries: [path] }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const tabs = (): string[] =>
  [...screen.getByRole('navigation', { name: 'Navigation' }).querySelectorAll('.nv-rail__item')].map(
    (tab) => tab.getAttribute('title') ?? '',
  );

describe('the rail of each role', () => {
  it('gives the owner his tabs in the order of ADR 0024, with the Chatting heading', async () => {
    renderApp(owner, '/');
    await screen.findByText('Chatting');
    expect(tabs()).toEqual(['Dashboard', 'Suivi', 'Entraîner', 'Créatrices', 'Réglages']);
    expect(screen.queryByText('Agence')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Plus' })).toBeNull();
    expect(screen.getByText('Propriétaire')).toBeDefined();
  });

  it('sends a chatter who opens Réglages back to his first tab, and shows him only his own', async () => {
    const router = renderApp(chatter, '/reglages');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/suivi');
    });
    expect(tabs()).toEqual(['Suivi']);
    expect(screen.getByText('Chatteur')).toBeDefined();
    // No Dashboard in his rail: no agent pill reading it either.
    expect(screen.queryByText('Agent')).toBeNull();
  });

  it('sends a chatter away from the Dashboard and from Entraîner too', async () => {
    const router = renderApp(chatter, '/entrainer/playground');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/suivi');
    });
    await router.navigate({ to: '/' });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/suivi');
    });
  });

  it('names a manager on leave a manager, though he has the chatter’s rail', async () => {
    renderApp({ ...manager, team: { role: 'manager', status: 'on_leave' }, teamScope: 'self' }, '/suivi');
    expect(await screen.findByText('Manager')).toBeDefined();
    expect(tabs()).toEqual(['Suivi']);
  });

  it('keeps a manager out of Entraîner and Réglages', async () => {
    const router = renderApp(manager, '/reglages/modeles-ia');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(tabs()).toEqual(['Dashboard', 'Suivi']);
  });
});

describe('« Plus » on the phone', () => {
  const item = (to: NavItem['to'], label: string, icon: NavItem['icon']): NavItem => ({
    to,
    label,
    icon,
    family: null,
  });
  const rail: Rail = {
    kind: 'owner',
    items: [
      item('/suivi', 'Suivi', 'tracking'),
      item('/entrainer', 'Entraîner', 'train'),
      item('/creatrices', 'Créatrices', 'creators'),
    ],
    settings: item('/reglages', 'Réglages', 'settings'),
    home: '/suivi',
    headed: new Set(),
    more: new Set(['/entrainer', '/creatrices', '/reglages']),
  };

  function renderRail(path: string): void {
    const root = createRootRoute({
      component: (): JSX.Element => (
        <>
          <RailNav rail={rail} current={`/${path.split('/')[1] ?? ''}`} />
          <Outlet />
        </>
      ),
    });
    const routes = ['/suivi', '/entrainer', '/creatrices', '/reglages'].map((to) =>
      createRoute({ getParentRoute: () => root, path: to }),
    );
    const router = createRouter({
      routeTree: root.addChildren(routes),
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    render(<RouterProvider router={router} />);
  }

  it('lights up when the screen shown is one of its tabs', async () => {
    renderRail('/creatrices');
    const more = await screen.findByRole('button', { name: 'Plus' });
    expect(more.getAttribute('data-current')).toBe('true');
    expect(screen.getByTitle('Créatrices').getAttribute('data-phone')).toBe('more');
    expect(screen.getByTitle('Suivi').getAttribute('data-phone')).toBe('bar');
  });

  it('opens a modal sheet on the current tab, keeps Tab inside, and gives the focus back on Escape', async () => {
    renderRail('/creatrices');
    const more = await screen.findByRole('button', { name: 'Plus' });
    more.focus();
    fireEvent.click(more);
    const sheet = screen.getByRole('dialog', { name: 'Plus' });
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const links = within(sheet).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Entraîner', 'Créatrices', 'Réglages']);
    expect(document.activeElement).toBe(within(sheet).getByRole('link', { current: 'page' }));

    links[2]?.focus();
    fireEvent.keyDown(sheet, { key: 'Tab' });
    expect(document.activeElement).toBe(links[0]);
    fireEvent.keyDown(sheet, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(links[2]);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it('closes on a tap outside, and when a tab is chosen', async () => {
    renderRail('/suivi');
    const more = await screen.findByRole('button', { name: 'Plus' });
    expect(more.getAttribute('data-current')).toBe('false');
    fireEvent.click(more);
    const scrim = document.querySelector('.nv-more-scrim');
    if (scrim === null) throw new Error('no scrim');
    fireEvent.click(scrim);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(more);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Réglages' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
