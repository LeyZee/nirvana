// @vitest-environment jsdom
import { CreatorIdSchema, TelegramBotIdSchema, TelegramChatIdSchema } from '@nirvana/contracts';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TelegramSection } from './TelegramSection';
import { TelegramForbidden, TelegramOff, fetchDeliveries, fetchOverview, saveRoutes } from './api';
import { parseTelegramSearch, searchOfTab, tabOfSearch } from './search';

vi.mock('./api', async (actual) => ({
  ...(await actual<typeof import('./api')>()),
  fetchOverview: vi.fn(),
  fetchDeliveries: vi.fn(),
  saveRoutes: vi.fn(),
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

  it('tells a member who is not the owner whose page it is, with nothing to retry', async () => {
    vi.mocked(fetchOverview).mockRejectedValue(new TelegramForbidden());
    renderSection();
    expect(await screen.findByText('Seul le propriétaire règle Telegram')).toBeTruthy();
    expect(screen.queryByText('Le serveur ne répond pas')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });
});

describe('Réglages › Telegram with a bot Telegram refuses', () => {
  beforeEach(() => {
    vi.mocked(fetchOverview).mockResolvedValue({
      bots: [
        {
          id: TelegramBotIdSchema.parse('01900000-0000-7000-8000-0000000000b2'),
          username: 'refuse_bot',
          displayName: 'Refusé',
          state: 'refused',
          lastPolledAt: null,
          chats: [
            {
              id: TelegramChatIdSchema.parse('01900000-0000-7000-8000-0000000000c2'),
              title: 'Astreinte',
              kind: 'group',
              membership: 'member',
              canPost: true,
              lastSentAt: null,
              lastError: null,
            },
          ],
        },
      ],
      routes: [],
      coverage: [
        {
          creatorId: CreatorIdSchema.parse('01900000-0000-7000-8000-0000000000a1'),
          displayName: 'Démo',
          urgentReachable: false,
          topicsWithoutGroup: [],
        },
      ],
      version: 1,
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('offers to repair that bot, not to choose a group or add a new bot', async () => {
    renderSection();
    expect(await screen.findByText('Les alertes ne partent plus')).toBeTruthy();
    expect(screen.queryByText(/Choisis au moins un groupe/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mettre un bot dans un groupe' })).toBeNull();
    const [repair] = screen.getAllByRole('button', { name: 'Réparer le bot' });
    if (repair === undefined) throw new Error('no « Réparer le bot »');
    fireEvent.click(repair);
    expect(await screen.findByRole('tab', { name: /Bots et groupes/, selected: true })).toBeTruthy();
  });

  it('says « son groupe » for a bot that serves one group', async () => {
    renderSection();
    const [repair] = await screen.findAllByRole('button', { name: 'Réparer le bot' });
    if (repair === undefined) throw new Error('no « Réparer le bot »');
    fireEvent.click(repair);
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText(/Son groupe ne recevra plus rien\./)).toBeTruthy();
    expect(screen.queryByText(/Ses 1 groupe/)).toBeNull();
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

describe('Réglages › Telegram, her own alerts (P4-01)', () => {
  const chatId = TelegramChatIdSchema.parse('01900000-0000-7000-8000-0000000000c1');

  beforeEach(() => {
    vi.mocked(fetchOverview).mockResolvedValue({
      bots: [
        {
          id: TelegramBotIdSchema.parse('01900000-0000-7000-8000-0000000000b1'),
          username: 'demo_bot',
          displayName: 'Démo',
          state: 'active',
          lastPolledAt: null,
          chats: [
            {
              id: chatId,
              title: 'Équipe',
              kind: 'supergroup',
              membership: 'member',
              canPost: true,
              lastSentAt: null,
              lastError: null,
            },
          ],
        },
      ],
      routes: [],
      coverage: [],
      version: 3,
    });
    vi.mocked(saveRoutes).mockResolvedValue({ ok: true, value: { routes: [], version: 4 } });
  });

  it('routes « Alertes personnalisées » from the Alertes tab, as Réglages › Alertes links to', async () => {
    renderSection();
    const row = await screen.findByRole('group', { name: 'Groupes pour Alertes personnalisées' });
    fireEvent.click(within(row).getByRole('checkbox', { name: /Équipe/ }));
    await waitFor(() => {
      expect(saveRoutes).toHaveBeenCalledWith(3, [{ creatorId: null, topic: 'custom', chatId }]);
    });
  });
});
