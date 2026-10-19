// @vitest-environment jsdom
import { AgentModeResultSchema, type AgentMode, type Dashboard as ApiDashboard } from '@nirvana/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from './DashboardPage';

import { apiDashboard, CREATOR, serveDashboard } from '@/test/fakes';

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
});

/** A server that keeps her mode: `PUT /v1/agent/mode` changes what `GET /v1/dashboard` says next. */
function serveModes(
  first: AgentMode,
  answer: (asked: AgentMode) => { status: number; body?: unknown } = (asked) => ({
    status: 200,
    body: { mode: asked, globalStop: false },
  }),
  patch: Partial<ApiDashboard> = {},
): { creatorId: string; mode: AgentMode }[] {
  let state = { mode: first, globalStop: patch.globalStop ?? false };
  const writes: { creatorId: string; mode: AgentMode }[] = [];
  serveDashboard(
    () => ({ status: 200, body: apiDashboard({ ...patch, ...state }) }),
    undefined,
    (body) => {
      writes.push(body);
      const reply = answer(body.mode);
      if (reply.status === 200) state = AgentModeResultSchema.parse(reply.body);
      return reply;
    },
  );
  return writes;
}

const checked = (name: string): string | null =>
  screen.getByRole('radio', { name }).getAttribute('aria-checked');

describe('DashboardPage changing the mode', () => {
  it('stops the agent after the confirmation, on the server, and resumes it in one click', async () => {
    const writes = serveModes('copilot');
    renderDashboard();
    fireEvent.click(await screen.findByRole('radio', { name: 'Arrêt' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Arrêter l’agent' }));
      await tick();
    });
    await waitFor(() => {
      expect(checked('Arrêt')).toBe('true');
    });
    expect(headline()).toContain('arrêté');
    expect(writes).toEqual([{ creatorId: CREATOR.id, mode: 'stop' }]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Repasser en copilote' }));
      await tick();
    });
    await waitFor(() => {
      expect(checked('Copilote')).toBe('true');
    });
  });

  it('drops a read still in flight, so an Arrêt is never put back by an older answer', async () => {
    let mode: AgentMode = 'copilot';
    let reads = 0;
    const held: (() => void)[] = [];
    const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        const path = new URL(input, 'http://localhost').pathname;
        if (path === '/v1/creators') return Promise.resolve(json({ creators: [CREATOR] }));
        if (init?.method === 'PUT') {
          mode = 'stop';
          return Promise.resolve(json({ mode, globalStop: false }));
        }
        reads += 1;
        const answer = json(apiDashboard({ mode }));
        // The second read, sent before the click, answers the old mode only once the click is done.
        if (reads !== 2) return Promise.resolve(answer);
        return new Promise<Response>((resolve) => {
          held.push(() => {
            resolve(answer);
          });
        });
      }),
    );
    const client = renderDashboard();
    await screen.findByRole('radio', { name: 'Arrêt' });
    void client.refetchQueries({ queryKey: ['dashboard'] });
    await waitFor(() => {
      expect(held).toHaveLength(1);
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Arrêt' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Arrêter l’agent' }));
      await tick();
    });
    await act(async () => {
      held.forEach((release) => {
        release();
      });
      await tick();
    });
    expect(checked('Arrêt')).toBe('true');
  });

  it('says so when the global switch keeps the agent stopped', async () => {
    serveModes('stop', () => ({ status: 200, body: { mode: 'stop', globalStop: true } }));
    renderDashboard();
    fireEvent.click(await screen.findByRole('radio', { name: 'Copilote' }));
    expect((await screen.findByRole('alert')).textContent).toContain('arrêt général');
    expect(checked('Arrêt')).toBe('true');
  });

  it('says from the start when a global switch holds the agent, and offers no way back it cannot give', async () => {
    serveModes('stop', undefined, { globalStop: true });
    renderDashboard();
    expect((await screen.findByRole('alert')).textContent).toContain('seul un opérateur peut le lever');
    expect(screen.getByRole('radio', { name: 'Copilote' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Repasser en copilote' })).toBeNull();
  });

  it('says it is sending while the server has not answered', async () => {
    serveModes('stop');
    const server = globalThis.fetch;
    let answer: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) =>
        init?.method === 'PUT'
          ? new Promise<Response>((resolve) => {
              answer = () => {
                resolve(
                  new Response(JSON.stringify({ mode: 'copilot', globalStop: false }), { status: 200 }),
                );
              };
            })
          : server(input, init),
      ),
    );
    renderDashboard();
    fireEvent.click(await screen.findByRole('radio', { name: 'Copilote' }));
    expect(await screen.findByText('Envoi au serveur…')).toBeDefined();
    expect(checked('Arrêt')).toBe('true');
    await act(async () => {
      answer?.();
      await tick();
    });
    await waitFor(() => {
      expect(screen.queryByText('Envoi au serveur…')).toBeNull();
    });
  });

  it('drops a refusal once the page has read the server again', async () => {
    serveModes('copilot', () => ({ status: 500 }));
    const client = renderDashboard();
    fireEvent.click(await screen.findByRole('radio', { name: 'Arrêt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Arrêter l’agent' }));
    expect(await screen.findByRole('alert')).toBeDefined();
    await act(async () => {
      await client.refetchQueries({ queryKey: ['dashboard'] });
      await tick();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the server’s refusal of Automatique and changes nothing', async () => {
    serveModes(
      'copilot',
      () => ({
        status: 409,
        body: {
          error: {
            code: 'agent_mode_conflict',
            message: 'Le mode Automatique reste fermé',
            details: {
              missing: [{ kind: 'live_rate', value: 79.5, target: 80 }, { kind: 'blind_test' }],
            },
            requestId: 'req-1',
          },
        },
      }),
      { automatic: { open: true, missing: [] } },
    );
    renderDashboard();
    fireEvent.click(await screen.findByRole('radio', { name: 'Automatique' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Automatique reste fermé : taux en réel 79,5\u00a0% sur 80\u00a0%, test à l’aveugle pas encore validé.',
    );
    expect(checked('Copilote')).toBe('true');
  });

  it('never shows a change the server did not make', async () => {
    serveModes('copilot', () => ({ status: 500 }));
    renderDashboard();
    fireEvent.click(await screen.findByRole('radio', { name: 'Arrêt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Arrêter l’agent' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Le mode n’a pas changé');
    expect(checked('Copilote')).toBe('true');
    expect(headline()).not.toContain('arrêté');
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
