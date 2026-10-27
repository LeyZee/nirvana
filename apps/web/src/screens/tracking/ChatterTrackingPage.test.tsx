// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatterTrackingPage } from './ChatterTrackingPage';

vi.mock('@/scheduling/time', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/scheduling/time')>()),
  readerZone: () => 'Europe/Paris',
}));

/* An invented creator (ADR 0010). Paris is UTC+1 after 25/10: 22:00Z is 23 h. */
const id = (n: number): string => `0199f2a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const tomorrow = {
  id: id(102),
  creatorId: id(1),
  platformAccountId: id(11),
  memberId: id(21),
  startsAt: '2026-10-28T22:00:00Z',
  endsAt: '2026-10-29T04:00:00Z',
  templateId: null,
  stoppedAt: null,
  creatorName: 'Nora Vidal',
  platform: 'reveal',
  handle: 'nora',
  accessStartsAt: '2026-10-28T21:45:00Z',
  accessEndsAt: '2026-10-29T04:15:00Z',
};

/** The chatter's shifts, and no creator open to him: what the server sends off shift (ADR 0025). */
function serve(shifts: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const path = new URL(input, 'http://localhost').pathname;
      const body =
        path === '/v1/scheduling/my-shifts' ? shifts : path === '/v1/creators' ? { creators: [] } : null;
      return Promise.resolve(new Response(JSON.stringify(body), { status: body === null ? 404 : 200 }));
    }),
  );
}

function renderPage(): void {
  const root = createRootRoute();
  const page = createRoute({
    getParentRoute: () => root,
    path: '/suivi',
    component: () => (
      <ChatterTrackingPage selected={null} onSelect={() => undefined} canDecide canAddCreator={false} />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/suivi'] }),
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Suivi of a chatter (EQ-13)', () => {
  it('says he is not on shift, with his next shift, instead of an empty list', async () => {
    serve({ current: null, next: tomorrow, ended: null });
    renderPage();
    const off = await screen.findByRole('heading', { name: 'Tu n’es pas en poste' });
    expect(off.closest('section')?.textContent).toContain(
      'Prochain shift aujourd’hui, 23 h – 5 h sur Nora Vidal. Ses conversations s’ouvrent ici à 22 h 45.',
    );
    expect(screen.getByRole('link', { name: 'Mon planning' }).getAttribute('href')).toBe('/planning');
    expect(screen.queryByText('Rien pour toi pour l’instant')).toBeNull();
  });

  it('says nothing of the kind while his access is open', async () => {
    serve({
      current: null,
      next: { ...tomorrow, startsAt: '2026-10-28T00:10:00Z', accessStartsAt: '2026-10-27T23:55:00Z' },
      ended: null,
    });
    renderPage();
    expect(await screen.findByText('Rien pour toi pour l’instant')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Tu n’es pas en poste' })).toBeNull();
  });
});
