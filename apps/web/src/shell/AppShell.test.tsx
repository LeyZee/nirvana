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

const base = { id: 'u1', email: 'membre@example.test', name: 'Nora', creatorIds: [], routedCreatorIds: [] };
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
  // jsdom has no matchMedia: a reduced motion, so the lens and the icons do not play.
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  );
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
  [
    ...screen
      .getByRole('navigation', { name: 'Navigation' })
      .querySelectorAll('.nv-rail__item:not(.nv-rail__more)'),
  ].map((tab) => tab.getAttribute('title') ?? '');

describe('the rail of each role', () => {
  it('gives the owner his tabs in the order of ADR 0024, under Chatting and Agence', async () => {
    renderApp(owner, '/');
    await screen.findByText('Chatting');
    expect(tabs()).toEqual(['Dashboard', 'Suivi', 'Entraîner', 'Équipe', 'Paie', 'Créatrices', 'Réglages']);
    expect(screen.getByText('Agence')).toBeDefined();
    // Seven places: the phone keeps four on its bar and folds the rest under « Plus ».
    expect(screen.getByRole('button', { name: 'Plus' })).toBeDefined();
    expect(screen.getByText('Propriétaire')).toBeDefined();
  });

  it('opens Équipe on its Planning, Membres a tab away', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    const router = renderApp(owner, '/equipe');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/equipe/planning');
    });
    const sub = await screen.findByRole('navigation', { name: 'Équipe' });
    expect(within(sub).getByRole('link', { name: 'Membres' }).getAttribute('href')).toBe('/equipe/membres');
  });

  it('sends a chatter who opens Réglages back to his first tab, and shows him only his own', async () => {
    const router = renderApp(chatter, '/reglages');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/aujourdhui');
    });
    expect(tabs()).toEqual(['Aujourd’hui', 'Suivi', 'Planning', 'Commissions']);
    expect(screen.getByText('Chatteur')).toBeDefined();
    // No Dashboard in his rail: no agent pill reading it either.
    expect(screen.queryByText('Agent')).toBeNull();
  });

  it('sends a chatter away from the Dashboard and from Entraîner too', async () => {
    const router = renderApp(chatter, '/entrainer/playground');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/aujourdhui');
    });
    await router.navigate({ to: '/' });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/aujourdhui');
    });
    // Équipe is the agency's: its Planning is not his.
    await router.navigate({ to: '/equipe/planning' });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/aujourdhui');
    });
  });

  it('names a manager on leave a manager, though he has the chatter’s rail', async () => {
    renderApp({ ...manager, team: { role: 'manager', status: 'on_leave' }, teamScope: 'self' }, '/suivi');
    expect(await screen.findByText('Manager')).toBeDefined();
    expect(tabs()).toEqual(['Aujourd’hui', 'Suivi', 'Planning', 'Commissions']);
  });

  it('sends a creator who opens Suivi to the Dashboard: she never sees a conversation', async () => {
    const router = renderApp(
      { ...base, role: 'creator', team: null, teamScope: 'self' },
      '/suivi?conversation=c1',
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(tabs()).toEqual(['Dashboard', 'Créatrices', 'Réglages']);
    expect(screen.getByText('Créatrice')).toBeDefined();
  });

  it('keeps a manager out of Entraîner and Réglages', async () => {
    const router = renderApp(manager, '/reglages/modeles-ia');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(tabs()).toEqual(['Dashboard', 'Suivi', 'Équipe', 'Paie']);
  });
});

describe('Réglages › Sauvegardes', () => {
  const subTabs = async (): Promise<string[]> =>
    within(await screen.findByRole('navigation', { name: 'Réglages' }))
      .getAllByRole('link')
      .map((link) => link.textContent);

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  it('is a tab of the owner, after Telegram and the pay rules', async () => {
    const router = renderApp(owner, '/reglages/sauvegardes');
    expect(await subTabs()).toEqual([
      'Modèles IA',
      'Alertes',
      'Telegram',
      'Règles de paie',
      'Sauvegardes',
      'Apparence',
    ]);
    expect(router.state.location.pathname).toBe('/reglages/sauvegardes');
  });

  it('is no tab of an operator or a creator, and its address sends them back to Réglages', async () => {
    for (const user of [
      { ...base, role: 'operator', team: null, teamScope: 'self' },
      { ...base, role: 'creator', team: null, teamScope: 'self' },
    ] satisfies Me[]) {
      const router = renderApp(user, '/reglages/sauvegardes');
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/reglages/apparence');
      });
      expect(await subTabs()).not.toContain('Sauvegardes');
      cleanup();
    }
  });

  // The alerts are the owner's too (P4-01): same tab rule, same way back.
  it('keeps Réglages › Alertes for the owner alone', async () => {
    for (const user of [
      { ...base, role: 'operator', team: null, teamScope: 'self' },
      { ...base, role: 'creator', team: null, teamScope: 'self' },
    ] satisfies Me[]) {
      const router = renderApp(user, '/reglages/alertes');
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/reglages/apparence');
      });
      expect(await subTabs()).not.toContain('Alertes');
      cleanup();
    }
  });

  it('keeps the pay rules to the owner too (EQ-03)', async () => {
    const router = renderApp(
      { ...base, role: 'operator', team: null, teamScope: 'self' },
      '/reglages/regles-de-paie',
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/reglages/apparence');
    });
    expect(await subTabs()).not.toContain('Règles de paie');
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

describe('« Plus » on the phone, signing out (recette 28/10, M14)', () => {
  const rail: Rail = {
    kind: 'chatter',
    items: [{ to: '/suivi', label: 'Suivi', icon: 'tracking', family: null }],
    settings: null,
    home: '/suivi',
    headed: new Set(),
    more: new Set(),
  };

  function renderRail(onSignOut: () => void): void {
    const root = createRootRoute({
      component: (): JSX.Element => <RailNav rail={rail} current="/suivi" onSignOut={onSignOut} />,
    });
    const router = createRouter({
      routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/suivi' })]),
      history: createMemoryHistory({ initialEntries: ['/suivi'] }),
    });
    render(<RouterProvider router={router} />);
  }

  it('offers to sign out, even on a rail whose tabs all fit on the bar', async () => {
    const onSignOut = vi.fn();
    renderRail(onSignOut);
    fireEvent.click(await screen.findByRole('button', { name: 'Plus' }));
    const sheet = screen.getByRole('dialog', { name: 'Plus' });
    const out = within(sheet).getByRole('button', { name: 'Se déconnecter' });
    expect(document.activeElement).toBe(out);
    fireEvent.click(out);
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('puts it under the tabs of the sheet in the app', async () => {
    renderApp(owner, '/');
    fireEvent.click(await screen.findByRole('button', { name: 'Plus' }));
    const sheet = screen.getByRole('dialog', { name: 'Plus' });
    const lines = [...sheet.querySelectorAll('.nv-more__item')].map((line) => line.textContent);
    expect(lines.at(-1)).toBe('Se déconnecter');
  });
});

describe('Suivi › Historique des alertes (P4-01)', () => {
  const suiviTabs = async (): Promise<{ readonly label: string; readonly current: boolean }[]> =>
    within(await screen.findByRole('navigation', { name: 'Suivi' }))
      .getAllByRole('link')
      .map((link) => ({ label: link.textContent, current: link.getAttribute('aria-current') === 'page' }));

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  it('is a view of Suivi for the owner and a manager, lit alone on its own address', async () => {
    renderApp(owner, '/suivi/alertes');
    expect(await suiviTabs()).toEqual([
      { label: 'Conversations', current: false },
      { label: 'Historique des alertes', current: true },
    ]);
    cleanup();
    renderApp(manager, '/suivi?conversation=0192f3a0-0000-7000-8000-0000000000d1');
    expect(await suiviTabs()).toEqual([
      { label: 'Conversations', current: true },
      { label: 'Historique des alertes', current: false },
    ]);
  });

  it('sends a chatter to his own Suivi, which has no such view', async () => {
    const router = renderApp(chatter, '/suivi/alertes');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/suivi');
    });
    expect(screen.queryByRole('navigation', { name: 'Suivi' })).toBeNull();
  });

  it('sends a creator home, as from all of Suivi', async () => {
    const router = renderApp({ ...base, role: 'creator', team: null, teamScope: 'self' }, '/suivi/alertes');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });
});

describe('an address that leads nowhere (recette 28/10, M1)', () => {
  it('says so in French, lights no tab, and leads back to the first one', async () => {
    renderApp(owner, '/nimporte-quoi');
    expect(await screen.findByRole('heading', { name: 'Cette page n’existe pas' })).toBeDefined();
    expect(screen.queryByText('Not Found')).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Navigation' });
    expect(nav.querySelector('[aria-current="page"]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Revenir à Dashboard' }).getAttribute('href')).toBe('/');
    expect(document.title).toBe('Page introuvable · Nirvana');
  });
});

describe('the tab’s title (recette 28/10, M2)', () => {
  it('names the screen on show', async () => {
    const router = renderApp(owner, '/suivi');
    await waitFor(() => {
      expect(document.title).toBe('Suivi · Nirvana');
    });
    await router.navigate({ to: '/creatrices' });
    await waitFor(() => {
      expect(document.title).toBe('Créatrices · Nirvana');
    });
  });
});
