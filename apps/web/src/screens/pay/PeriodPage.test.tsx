// @vitest-environment jsdom
import type { Me, PayrollPeriod } from '@nirvana/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PeriodPage } from './PeriodPage';

import { parsePaySearch } from '@/payroll/model';
import { HoldProvider } from '@/reports/Hold';
import {
  adjustmentOf,
  BASILE,
  IRIS,
  IRIS_ME,
  LOU,
  MEMBERS,
  NOV1,
  OCT1,
  OCT2,
  OWNER,
  OWNER_USER,
  PAY_RULES,
  payId,
  periodOf,
  SCHEDULING_SETTINGS,
  statementOf,
  summaryFor,
  THEO,
} from '@/test/pay';

vi.mock('@/scheduling/time', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/scheduling/time')>()),
  readerZone: () => 'Europe/Paris',
}));

const NBSP = /[\u00a0\u202f]/gu;
const refusal = (code: string) => ({ error: { code, message: code, details: {}, requestId: 'req-1' } });
const text = (element: Element | null | undefined): string => (element?.textContent ?? '').replace(NBSP, ' ');
/** An adjustment's id, made by the screen. */
const AN_ID: unknown = expect.any(String);

let periods: Record<string, PayrollPeriod | 'down'>;
let reports: unknown[];
/** What a `POST` answers, from its path. */
let answer: (path: string) => { status: number; body: unknown };
const writes: { path: string; body: unknown }[] = [];

function serve(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      const json = (body: unknown, status = 200) =>
        Promise.resolve(new Response(JSON.stringify(body), { status }));
      if (init?.method === 'POST') {
        const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null;
        writes.push({ path: url.pathname, body });
        const answered = answer(url.pathname);
        return json(answered.body, answered.status);
      }
      const period = /^\/v1\/payroll\/periods\/(.+)$/u.exec(url.pathname)?.[1];
      if (period !== undefined) {
        const found = periods[period];
        if (found === 'down') return json({ error: { code: 'internal', message: 'down' } }, 500);
        return json(found ?? periodOf(period, [], { window: null }));
      }
      switch (url.pathname) {
        case '/v1/scheduling/settings':
          return json(SCHEDULING_SETTINGS);
        case '/v1/payroll/periods':
          return json({
            items: Object.values(periods)
              .filter((one): one is PayrollPeriod => one !== 'down' && one.statements.length > 0)
              .toSorted((a, b) => b.period.localeCompare(a.period))
              .map(summaryFor),
            nextCursor: null,
          });
        case '/v1/team/members':
          return json({ members: MEMBERS });
        case '/v1/team/pay-rules':
          return json(PAY_RULES);
        case '/v1/payroll/exchange-rates':
          return json({ usd: null });
        case '/v1/scheduling/shift-reports':
          return json({ reports, shifts: [], accounts: [], members: [] });
        default:
          return json(null, 404);
      }
    }),
  );
}

function renderPage(user: Me, initial = '/paie/quinzaine'): void {
  const root = createRootRoute({
    component: () => (
      <HoldProvider>
        <Outlet />
      </HoldProvider>
    ),
  });
  const page = createRoute({
    getParentRoute: () => root,
    path: '/paie/quinzaine',
    validateSearch: parsePaySearch,
    component: function Page() {
      const { quinzaine } = page.useSearch();
      const navigate = page.useNavigate();
      return (
        <PeriodPage
          user={user}
          chosen={quinzaine ?? null}
          onPeriod={(period) => void navigate({ search: period === null ? {} : { quinzaine: period } })}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const row = (name: string): HTMLElement => {
  const found = screen.getByRole('button', { name }).closest('li');
  if (found === null) throw new Error(`No row for ${name}`);
  return found;
};

const PAID = {
  status: 'paid',
  canValidate: false,
  paidAt: '2026-10-17T09:00:00.000Z',
  paidBy: OWNER_USER,
  payment: { paidOn: '2026-10-17', method: 'wise', reference: null, sentMinor: 2_125 },
};

/** The second half of October, ended, nobody validated yet: Lou is under the minimum. */
const endedOctober = (patch: Partial<Record<keyof PayrollPeriod, unknown>> = {}, irisValidates = true) =>
  periodOf(
    OCT2,
    [
      statementOf(THEO, OCT2, {
        netMinor: 120_000,
        commissionMinor: 30_000,
        totalMinor: 30_000,
        payableMinor: 30_000,
      }),
      statementOf(BASILE, OCT2),
      statementOf(LOU, OCT2, { totalMinor: 1_200, carryOverOutMinor: 1_200, payableMinor: 0 }),
      statementOf(IRIS, OCT2, { canValidate: irisValidates }),
    ],
    patch,
  );

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Monday 2 November, 10:00 in Paris: the second half of October has ended.
  vi.setSystemTime(new Date('2026-11-02T09:00:00Z'));
  writes.length = 0;
  reports = [];
  periods = {
    [OCT1]: periodOf(OCT1, [statementOf(THEO, OCT1, { netMinor: 100_000, ...PAID })], {
      closing: {
        period: OCT1,
        exchangeRates: [],
        closedBy: OWNER_USER,
        closedAt: '2026-10-16T08:00:00.000Z',
      },
    }),
    [OCT2]: endedOctober(),
    [NOV1]: periodOf(NOV1, [statementOf(THEO, NOV1)]),
  };
  answer = () => ({ status: 200, body: null });
  serve();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Paie › Quinzaine', () => {
  it('opens the period to validate, what to pay first, every draft checked, a carry-over its one amber mark', async () => {
    renderPage(OWNER);
    expect(text(await screen.findByText('À verser pour la quinzaine')).length).toBeGreaterThan(0);
    expect(screen.getByText('16 – 31 octobre 2026')).toBeTruthy();
    expect(text(screen.getByText('À verser pour la quinzaine').nextElementSibling)).toBe('342,50 €');
    expect(screen.getByRole('button', { name: 'Valider (4)' })).toBeTruthy();
    expect(text(row('Lou'))).toContain(
      'Sous le minimum de 15,00 € : 12,00 € reportés sur la quinzaine suivante.',
    );
    expect(within(row('Lou')).getByText('Reporté').className).toContain('rp-chip--warn');
    // Théo made a fifth more than in the first half.
    expect(text(within(row('Théo')).getByTitle(/Net comparé/u))).toBe('+20 %');
    expect(screen.getByText(/Le premier relevé validé clôt la quinzaine pour toute l’équipe/u)).toBeTruthy();
  });

  it('says before the first validation that it closes the period, then validates one by one, a refusal on its row', async () => {
    answer = (path) =>
      path.includes(statementOf(BASILE, OCT2).id)
        ? {
            status: 409,
            body: refusal('commission_statement_changed_conflict'),
          }
        : { status: 200, body: statementOf(THEO, OCT2, { status: 'validated' }) };
    renderPage(OWNER);
    fireEvent.click(await screen.findByRole('button', { name: 'Valider (4)' }));

    const dialog = await screen.findByRole('dialog');
    expect(text(dialog)).toContain('Clore la quinzaine du 16 au 31 octobre ?');
    expect(text(dialog)).toContain(
      'Un rapport validé après la clôture ira sur la quinzaine du 1er au 15 novembre',
    );
    expect(writes).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clore et valider 4 relevés' }));

    await waitFor(() => {
      expect(writes).toHaveLength(4);
    });
    // In the members' order, each with the revision the reader saw.
    expect(writes.map(({ path }) => path)).toEqual(
      [BASILE, IRIS, LOU, THEO].map((one) => `/v1/payroll/statements/${statementOf(one, OCT2).id}/validate`),
    );
    expect(writes.every(({ body }) => JSON.stringify(body) === '{"revision":3}')).toBe(true);
    expect(text(await within(row('Basile')).findByRole('alert'))).toContain(
      'Ce relevé a changé depuis que tu l’as ouvert. Relis la nouvelle version avant de valider.',
    );
    expect(screen.getByRole('button', { name: 'Relire le relevé de Basile' })).toBeTruthy();
  });

  it('says what blocks the period, and offers nothing to validate meanwhile, the manager’s own row locked', async () => {
    periods[OCT2] = endedOctober({}, false);
    reports = [
      { ...report(1, BASILE.id), status: 'submitted' },
      { ...report(2, LOU.id), status: 'submitted' },
    ];
    renderPage(IRIS_ME);
    expect(await screen.findByText('2 rapports de la quinzaine attendent leur relecture')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Relire les 2 rapports' }).getAttribute('href')).toBe(
      '/equipe/rapports',
    );
    expect(screen.queryAllByRole('checkbox')).toEqual([]);
    expect(screen.queryByRole('button', { name: /^Valider/u })).toBeNull();
    expect(text(row('Iris'))).toContain('Ton relevé : un autre membre de l’agence le valide.');
  });

  it('lets the owner mark a validated statement paid in two steps, the amount to pay and none other', async () => {
    const closed = {
      period: OCT2,
      exchangeRates: [],
      closedBy: OWNER_USER,
      closedAt: '2026-11-02T08:41:00.000Z',
    };
    periods[OCT2] = periodOf(
      OCT2,
      [
        statementOf(THEO, OCT2, {
          status: 'validated',
          payableMinor: 28_840,
          totalMinor: 28_840,
          canValidate: false,
        }),
      ],
      { closing: closed },
    );
    renderPage(OWNER);
    fireEvent.click(
      await within(await waitFor(() => row('Théo'))).findByRole('button', { name: 'Marquer payé' }),
    );
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText('Montant envoyé');
    fireEvent.change(amount, { target: { value: '200' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vérifier' }));
    expect(text(within(dialog).getByText(/Celui à verser/u))).toContain('288,40 €');
    expect(within(dialog).queryByText(/versés à/u)).toBeNull();

    fireEvent.change(amount, { target: { value: '288,40' } });
    // Never before the period's first day, never an IBAN in the reference (an invented one, its check digits right).
    const day = within(dialog).getByLabelText('Payé le');
    expect(day.getAttribute('min')).toBe(OCT2);
    fireEvent.change(day, { target: { value: '2026-10-15' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vérifier' }));
    expect(within(dialog).getByText('Un jour du vendredi 16 octobre à aujourd’hui.')).toBeTruthy();
    expect(within(dialog).queryByText(/versés à/u)).toBeNull();

    fireEvent.change(day, { target: { value: '2026-11-02' } });
    const reference = within(dialog).getByLabelText('Référence du transfert, facultative');
    fireEvent.change(reference, { target: { value: 'FR62 1234 5678 9000 00AB C123 456' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vérifier' }));
    expect(within(dialog).getByText(/Ceci contient un IBAN/u)).toBeTruthy();
    expect(within(dialog).queryByText(/versés à/u)).toBeNull();

    fireEvent.change(reference, { target: { value: 'VIR-2611-0412' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vérifier' }));
    expect(text(await within(dialog).findByText(/versés à/u))).toBe(
      '288,40 € versés à Théo le lundi 2 novembre par virement, référence VIR-2611-0412, pour la quinzaine du 16 au 31 octobre.',
    );
    answer = () => ({ status: 200, body: statementOf(THEO, OCT2, { status: 'paid' }) });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Marquer payé' }));
    await waitFor(() => {
      expect(writes).toEqual([
        {
          path: `/v1/payroll/statements/${statementOf(THEO, OCT2).id}/pay`,
          body: {
            revision: 3,
            paidOn: '2026-11-02',
            method: 'bank_transfer',
            sentMinor: 28_840,
            reference: 'VIR-2611-0412',
          },
        },
      ]);
    });
  });

  it('adjusts a validated statement on the member’s next period to validate, which it says before sending', async () => {
    const validated = statementOf(THEO, OCT2, { status: 'validated', canValidate: false });
    periods[OCT2] = periodOf(OCT2, [validated], {
      closing: {
        period: OCT2,
        exchangeRates: [],
        closedBy: OWNER_USER,
        closedAt: '2026-11-02T08:41:00.000Z',
      },
    });
    answer = () => ({
      status: 201,
      body: adjustmentOf(9, THEO, NOV1, { amountMinor: 500, correctsStatementId: validated.id }),
    });
    renderPage(OWNER, `/paie/quinzaine?quinzaine=${OCT2}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Théo' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajuster' }));
    expect(text(await within(dialog).findByText(/^Il va sur la quinzaine/u))).toBe(
      'Il va sur la quinzaine du 1er au 15 novembre : la prochaine de Théo à valider.',
    );
    fireEvent.change(within(dialog).getByLabelText('Montant'), { target: { value: '5' } });
    fireEvent.change(within(dialog).getByLabelText('Motif'), {
      target: { value: 'Rapport du 28 oct. oublié.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vérifier' }));
    expect(text(await within(dialog).findByText(/^Il corrige/u))).toBe(
      'Il corrige son relevé du 16 au 31 octobre, qui ne change plus. Un ajustement ne s’annule pas : une erreur se corrige par un autre. Théo le lira avec son relevé.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter l’ajustement' }));
    expect(text(await within(dialog).findByRole('status'))).toBe(
      'Ajustement de +5,00 € pour Théo ajouté sur la quinzaine du 1er au 15 novembre.',
    );
    expect(writes).toEqual([
      {
        path: '/v1/payroll/adjustments',
        body: {
          id: AN_ID,
          memberId: THEO.id,
          amountMinor: 500,
          reason: 'Rapport du 28 oct. oublié.',
          correctsStatementId: validated.id,
        },
      },
    ]);
  });

  it('never offers a manager to mark a statement paid', async () => {
    periods[OCT2] = periodOf(OCT2, [statementOf(THEO, OCT2, { status: 'validated', canValidate: false })], {
      closing: {
        period: OCT2,
        exchangeRates: null,
        closedBy: OWNER_USER,
        closedAt: '2026-11-02T08:41:00.000Z',
      },
    });
    renderPage(IRIS_ME, `/paie/quinzaine?quinzaine=${OCT2}`);
    await waitFor(() => row('Théo'));
    expect(screen.queryByRole('button', { name: 'Marquer payé' })).toBeNull();
    expect(text(screen.getByText(/^Close le/u))).toBe(
      'Close le lundi 2 novembre à 9 h 41 par le propriétaire',
    );
  });

  it('holds a validation five seconds once the period is closed, and reads a statement validated meanwhile again without a word', async () => {
    periods[OCT2] = periodOf(OCT2, [statementOf(BASILE, OCT2)], {
      closing: {
        period: OCT2,
        exchangeRates: [],
        closedBy: OWNER_USER,
        closedAt: '2026-11-02T08:41:00.000Z',
      },
    });
    answer = () => ({ status: 409, body: refusal('commission_statement_status_conflict') });
    renderPage(OWNER);
    fireEvent.click(await screen.findByRole('button', { name: 'Valider (1)' }));
    expect(text(await screen.findByRole('status'))).toContain('Validation du relevé de Basile');
    expect(writes).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(within(row('Basile')).queryByRole('alert')).toBeNull();
  });

  it('says the server does not answer, never an empty period', async () => {
    periods[OCT2] = 'down';
    renderPage(OWNER, `/paie/quinzaine?quinzaine=${OCT2}`);
    expect(
      await screen.findByText('Le serveur ne répond pas : la quinzaine n’a pas pu être lue.'),
    ).toBeTruthy();
  });

  it('says a period before the team’s first closing is closed without a statement, never paid', async () => {
    // Pay never wrote it: no window, so it never reads as ended either.
    periods[OCT1] = periodOf(OCT1, [], { window: null, beforeFirstClosing: true });
    renderPage(OWNER, `/paie/quinzaine?quinzaine=${OCT1}`);
    expect(await screen.findByText('Close avant la première clôture')).toBeTruthy();
    expect(
      screen.getByText('Avant la première clôture de l’équipe : la quinzaine est close sans relevé.'),
    ).toBeTruthy();
    expect(screen.getByText('Aucun relevé avant la première clôture.')).toBeTruthy();
    expect(screen.queryByText('Payée')).toBeNull();
    expect(screen.queryByText(/pour la quinzaine/u)).toBeNull();
  });

  it('shows a running period’s net and where its pace leads, with nothing to validate', async () => {
    // Thursday 5 November at midnight in Paris: five days of fifteen gone.
    vi.setSystemTime(new Date('2026-11-05T23:00:00Z'));
    periods[NOV1] = periodOf(NOV1, [statementOf(THEO, NOV1, { netMinor: 50_000 })]);
    renderPage(OWNER, `/paie/quinzaine?quinzaine=${NOV1}`);
    expect(await screen.findByText('Net de l’équipe à ce jour')).toBeTruthy();
    expect(text(screen.getByText(/À ce rythme/u))).toBe('À ce rythme, 1 500,00 € le dimanche 15 novembre.');
    expect(screen.queryAllByRole('checkbox')).toEqual([]);
    expect(screen.queryByRole('button', { name: /^Valider/u })).toBeNull();
  });
});

function report(n: number, memberId: string) {
  return {
    id: payId(500 + n),
    shiftId: payId(600 + n),
    creatorId: payId(2),
    platformAccountId: payId(11),
    memberId,
    period: OCT2,
    correctsId: null,
    amount: { amountMinor: 10_000, currency: 'EUR' },
    comment: null,
    incident: null,
    version: 1,
    byAgency: false,
    canReview: true,
    submittedAt: '2026-10-31T22:00:00.000Z',
    reviewedAt: null,
    reviewNote: null,
    createdAt: '2026-10-31T22:00:00.000Z',
  };
}
