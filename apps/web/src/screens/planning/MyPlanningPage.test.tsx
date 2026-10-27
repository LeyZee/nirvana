// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MyPlanningPage } from './MyPlanningPage';

vi.mock('@/scheduling/time', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/scheduling/time')>()),
  readerZone: () => 'Indian/Antananarivo',
}));

/* An invented creator and member (ADR 0010). Antananarivo is UTC+3, the agency's Paris UTC+1 after 25/10. */
const id = (n: number): string => `0199f2a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const shift = (n: number, startsAt: string, endsAt: string): unknown => ({
  id: id(100 + n),
  creatorId: id(1),
  platformAccountId: id(11),
  memberId: id(21),
  startsAt,
  endsAt,
  templateId: null,
  stoppedAt: null,
});

const weeks: string[] = [];

function serve(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const url = new URL(input, 'http://localhost');
      weeks.push(url.searchParams.get('from') ?? '');
      const thisWeek = url.searchParams.get('from') === '2026-10-25T21:00:00.000Z';
      return Promise.resolve(
        new Response(
          JSON.stringify({
            settings: {
              timeZone: 'Europe/Paris',
              slotStartMinute: 0,
              slotLengthMinutes: 360,
              accessMarginMinutes: 15,
            },
            accounts: [
              { id: id(11), creatorId: id(1), creatorName: 'Nora Vidal', platform: 'reveal', handle: 'nora' },
            ],
            members: [{ id: id(21), displayName: 'Théo', color: null }],
            shifts: thisWeek
              ? [
                  shift(1, '2026-10-27T22:00:00Z', '2026-10-28T04:00:00Z'),
                  shift(2, '2026-10-29T16:00:00Z', '2026-10-29T22:00:00Z'),
                ]
              : [],
            conflicts: [],
          }),
          { status: 200 },
        ),
      );
    }),
  );
}

function renderPage(): void {
  const root = createRootRoute();
  const page = createRoute({ getParentRoute: () => root, path: '/planning', component: MyPlanningPage });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/planning'] }),
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  weeks.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the chatter’s Planning', () => {
  it('lists his week by day at his own hour, the agency’s beside it', async () => {
    serve();
    renderPage();
    const today = await screen.findByRole('region', { name: 'Aujourd’hui' });
    const night = within(today).getByRole('listitem');
    // 22:00Z is 1 h on Wednesday 28 in Antananarivo, 23 h on Tuesday in Paris.
    expect(night.textContent).toContain('1 h – 7 h');
    expect(night.textContent).toContain('@nora sur Reveal · 23 h – 5 h à Paris');
    expect(night.textContent).toContain('En poste');
    const thursday = screen.getByRole('region', { name: 'Jeudi 29 octobre' });
    expect(thursday.textContent).toContain('19 h – 1 h');
    expect(thursday.textContent).toContain('À venir');
    expect(screen.getByText('2 shifts · 12 h')).toBeTruthy();
  });

  it('turns to the next week, says when it is empty, and comes back', async () => {
    serve();
    renderPage();
    await screen.findByText('2 shifts · 12 h');
    fireEvent.click(screen.getByRole('button', { name: 'Semaine suivante' }));
    expect(await screen.findByRole('heading', { name: 'Aucun shift cette semaine' })).toBeTruthy();
    expect(weeks.at(-1)).toBe('2026-11-01T21:00:00.000Z');
    fireEvent.click(screen.getByRole('button', { name: 'Cette semaine' }));
    expect(await screen.findByText('2 shifts · 12 h')).toBeTruthy();
  });
});
