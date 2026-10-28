// @vitest-environment jsdom
import { ValidateShiftReportsBodySchema } from '@nirvana/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportsPage } from './ReportsPage';

import { HoldProvider } from '@/reports/Hold';

vi.mock('@/scheduling/time', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/scheduling/time')>()),
  readerZone: () => 'Europe/Paris',
}));

/* Invented people (ADR 0010). Now: 01:00 on 28 October in Paris, period 16–31. */
const id = (n: number): string => `0199f2a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const THEO = id(21);
const BASILE = id(22);
const ACCOUNT = {
  id: id(11),
  creatorId: id(1),
  creatorName: 'Nora Vidal',
  platform: 'reveal',
  handle: 'nora',
};
const MEMBERS = [
  { id: THEO, displayName: 'Théo', color: null },
  { id: BASILE, displayName: 'Basile', color: null },
];

const shift = (n: number, memberId: string, day: number) => ({
  id: id(100 + n),
  creatorId: id(1),
  platformAccountId: id(11),
  memberId,
  startsAt: `2026-10-${String(day)}T16:00:00.000Z`,
  endsAt: `2026-10-${String(day)}T22:00:00.000Z`,
  templateId: null,
  stoppedAt: null,
});
const SHIFTS = [shift(1, THEO, 26), shift(2, BASILE, 26), shift(3, THEO, 25), shift(4, BASILE, 24)];

interface FakeReport {
  readonly id: string;
  readonly status: string;
  readonly [key: string]: unknown;
}

const report = (n: number, shiftIndex: number, patch: Record<string, unknown> = {}): FakeReport => {
  const ofShift = SHIFTS[shiftIndex] ?? SHIFTS[0];
  return {
    id: id(300 + n),
    shiftId: ofShift?.id,
    creatorId: id(1),
    platformAccountId: id(11),
    memberId: ofShift?.memberId,
    period: '2026-10-16',
    correctsId: null,
    amount: { amountMinor: 10_000 + n * 1_000, currency: 'EUR' },
    comment: null,
    incident: null,
    status: 'submitted',
    version: 1,
    byAgency: false,
    canReview: true,
    submittedAt: '2026-10-27T00:00:00.000Z',
    reviewedAt: null,
    reviewNote: null,
    createdAt: '2026-10-27T00:00:00.000Z',
    ...patch,
  };
};

let open: FakeReport[];
let period: FakeReport[];
/** What a `POST` answers: the same for each, or from what it was sent. */
let answer: { status: number; body: unknown } | ((body: unknown) => { status: number; body: unknown });
const writes: { method: string; path: string; body: unknown }[] = [];

function serve(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      const json = (body: unknown, status = 200) =>
        Promise.resolve(new Response(JSON.stringify(body), { status }));
      if (init?.method === 'POST') {
        const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null;
        writes.push({ method: init.method, path: url.pathname, body });
        const answered = typeof answer === 'function' ? answer(body) : answer;
        return json(answered.body, answered.status);
      }
      switch (url.pathname) {
        case '/v1/scheduling/settings':
          return json({
            timeZone: 'Europe/Paris',
            slotStartMinute: 0,
            slotLengthMinutes: 360,
            accessMarginMinutes: 15,
          });
        case '/v1/scheduling/shift-reports':
          return json(
            url.searchParams.has('period')
              ? url.searchParams.get('period') === '2026-10-16'
                ? { reports: period, shifts: SHIFTS, accounts: [ACCOUNT], members: MEMBERS }
                : { reports: [], shifts: [], accounts: [], members: [] }
              : { reports: open, shifts: SHIFTS, accounts: [ACCOUNT], members: MEMBERS },
          );
        case `/v1/scheduling/shifts/${id(101)}/report`:
          return json({
            shift: SHIFTS[0],
            account: ACCOUNT,
            period: '2026-10-16',
            opensAt: '2026-10-26T21:30:00.000Z',
            rules: null,
            reports: period.filter((one) => one['shiftId'] === id(101)),
          });
        default:
          return json(null, 404);
      }
    }),
  );
}

/** Every report of the batch validated, as the server answers it. */
const validatesAll = (body: unknown): { status: number; body: unknown } => {
  const sent = ValidateShiftReportsBodySchema.parse(body).reports;
  return {
    status: 200,
    body: {
      results: sent.map((one) => ({
        outcome: 'validated',
        report: { ...report(0, 0), id: one.id, status: 'validated', version: one.version + 1 },
      })),
    },
  };
};

function renderPage(): void {
  // The app's one hold, as the shell mounts it.
  const root = createRootRoute({
    component: () => (
      <HoldProvider>
        <Outlet />
      </HoldProvider>
    ),
  });
  const page = createRoute({
    getParentRoute: () => root,
    path: '/equipe/rapports',
    component: () => <ReportsPage owner />,
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/equipe/rapports'] }),
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Équipe's tabs watch their own width.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
  writes.length = 0;
  open = [
    report(1, 0, { comment: 'Un pack a bien plu' }),
    report(2, 1, { incident: 'Le compte a été déconnecté une heure' }),
    report(3, 2, { canReview: false }),
  ];
  period = [];
  answer = { status: 200, body: { results: [] } };
  serve();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Équipe › Rapports', () => {
  it('counts what waits, oldest shift first, says the incident, and keeps out of the batch what the reader may not review', async () => {
    renderPage();
    const panel = (await screen.findByText('rapports attendent')).closest('section');
    expect(panel?.textContent).toContain('3');
    expect(screen.getByText('Le compte a été déconnecté une heure')).toBeTruthy();
    expect(screen.getByText('Ton propre shift : un autre membre de l’agence le valide.')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Tout sélectionner'));
    expect(screen.getByRole('button', { name: 'Valider (2)' })).toBeTruthy();
    expect(
      screen
        .getAllByRole('checkbox', { name: /Sélectionner le rapport de Théo/u })
        .map((box) => box.matches(':disabled')),
    ).toEqual([true, false]);
  });

  it('validates the selection after five seconds, each report with the version it read', async () => {
    answer = {
      status: 200,
      body: {
        results: [
          {
            outcome: 'validated',
            report: {
              ...report(1, 0),
              status: 'validated',
              version: 2,
              reviewedAt: '2026-10-28T00:00:05.000Z',
            },
          },
          { outcome: 'refused', id: id(302), code: 'shift_report_changed_conflict' },
        ],
      },
    };
    renderPage();
    fireEvent.click(await screen.findByLabelText('Tout sélectionner'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider (2)' }));

    expect((await screen.findByRole('status')).textContent).toContain('Validation de 2 rapports dans 5 s');
    // Held in place, out of the selection, until they are sent.
    expect(screen.getAllByText('En validation')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Valider' }).matches(':disabled')).toBe(true);
    expect(writes).toEqual([]);
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/v1/scheduling/shift-reports/validate',
        body: {
          reports: [
            { id: id(301), version: 1 },
            { id: id(302), version: 1 },
          ],
        },
      },
    ]);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('1 validé, 1 refusé');
    // The refused one is named, with its shift.
    expect(alert.textContent).toContain('Le rapport de Basile (');
    expect(alert.textContent).toContain('ce rapport ou son shift a changé depuis qu’il a été lu');
  });

  it('keeps a second validation held while the first is answered, and says the first one’s refusal', async () => {
    answer = (body) => ({
      status: 200,
      body: {
        results: ValidateShiftReportsBodySchema.parse(body).reports.map((one) => ({
          outcome: 'refused',
          id: one.id,
          code: 'shift_report_changed_conflict',
        })),
      },
    });
    renderPage();
    const [theo] = (
      await screen.findAllByRole('checkbox', { name: /Sélectionner le rapport de Théo/u })
    ).filter((box) => !box.matches(':disabled'));
    if (theo === undefined) throw new Error('no box');
    fireEvent.click(theo);
    fireEvent.click(screen.getByRole('button', { name: 'Valider (1)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Sélectionner le rapport de Basile/u }));
    // The second hold sends the first at once.
    fireEvent.click(screen.getByRole('button', { name: 'Valider (1)' }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(writes).toHaveLength(1);
    // Answered, the first gives back its own row and leaves the second's held.
    expect(screen.getAllByText('En validation')).toHaveLength(1);
    expect(
      screen.getByRole('checkbox', { name: /Sélectionner le rapport de Basile/u }).matches(':disabled'),
    ).toBe(true);
    // Its refusal has its own island, above the second one counting down.
    expect((await screen.findByRole('alert')).textContent).toContain('Le rapport de Théo (');
    expect(screen.getByRole('status').textContent).toContain('Validation du rapport dans');
  });

  it('validates more than a batch holds in batches of 100, under one hold', async () => {
    open = Array.from({ length: 101 }, (_, n) => report(n + 1, n % 2));
    answer = validatesAll;
    renderPage();
    fireEvent.click(await screen.findByLabelText('Tout sélectionner'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider (101)' }));
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(writes.map((one) => ValidateShiftReportsBodySchema.parse(one.body).reports.length)).toEqual([
      100, 1,
    ]);
    expect((await screen.findByText('101 rapports validés')).closest('[role="status"]')).toBeTruthy();
  });

  it('gives the selection back on « Annuler », with nothing sent', async () => {
    renderPage();
    fireEvent.click(await screen.findByLabelText('Tout sélectionner'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider (2)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
    await act(() => vi.advanceTimersByTimeAsync(6_000));

    expect(writes).toEqual([]);
    expect(screen.getByRole('button', { name: 'Valider (2)' })).toBeTruthy();
  });

  it('sends a report back with a word, at once', async () => {
    answer = { status: 200, body: { ...report(1, 0), status: 'rejected', version: 2, reviewNote: 'x' } };
    renderPage();
    const row = (await screen.findByText('« Un pack a bien plu »')).closest('li');
    if (row === null) throw new Error('no row');
    fireEvent.click(within(row).getByRole('button', { name: 'Renvoyer' }));
    const send = within(row).getByRole('button', { name: 'Renvoyer avec ce mot' });
    expect(send.matches(':disabled')).toBe(true);
    fireEvent.change(within(row).getByLabelText('Ce que Théo doit revoir'), {
      target: { value: ' Il manque le pourboire ' },
    });
    fireEvent.click(send);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(writes).toEqual([
      {
        method: 'POST',
        path: `/v1/scheduling/shift-reports/${id(301)}/reject`,
        body: { version: 1, note: 'Il manque le pourboire' },
      },
    ]);
  });

  it('reads a period member by member, with the shifts still without a report', async () => {
    period = [
      report(5, 0, { status: 'validated', reviewedAt: '2026-10-27T08:00:00.000Z' }),
      report(6, 1, { status: 'submitted' }),
    ];
    renderPage();
    const theo = await screen.findByText('Théo', { selector: '.nv-disclosure__title' });
    const summary = theo.closest('summary');
    expect((summary?.textContent ?? '').replaceAll(/\s/gu, ' ')).toContain(
      '150,00 € validés · 1 sans rapport',
    );
    expect(screen.getByText(/16 – 31 octobre 2026/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quinzaine suivante' }).matches(':disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Corriger' }));
    const dialog = await screen.findByRole('dialog', { name: 'Corriger le rapport de Théo' });
    // No rules for the period: the owner is led to them, never told to warn the agency.
    expect(await within(dialog).findByText('Pas encore de règles de paie')).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Poser les règles' })).toBeTruthy();
    expect(dialog.textContent).not.toContain('Préviens l’agence');
  });
});
