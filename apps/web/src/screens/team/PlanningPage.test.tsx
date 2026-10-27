// @vitest-environment jsdom
import { TeamMemberSchema, type TeamMember } from '@nirvana/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanningPage } from './PlanningPage';

const reader = vi.hoisted(() => ({ zone: 'Europe/Paris' }));
vi.mock('@/scheduling/time', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/scheduling/time')>()),
  readerZone: () => reader.zone,
}));

/* Invented creators and members: no real data (ADR 0010). Paris is UTC+1 after 25/10: 22:00Z is 23 h. */
const id = (n: number): string => `0199f2a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const NORA = id(1);
const NORA_REVEAL = id(11);
const THEO = id(21);
const NIGHT = id(101);
const TEMPLATE = id(31);
const NOW = new Date('2026-10-28T00:00:00Z');

const member = (patch: Partial<TeamMember>): TeamMember =>
  TeamMemberSchema.parse({
    id: THEO,
    userId: id(71),
    email: 'membre@example.test',
    firstName: 'Théo',
    lastName: 'Martin',
    displayName: 'Théo',
    teamRole: 'chatter',
    status: 'active',
    country: 'BJ',
    timeZone: 'Africa/Porto-Novo',
    color: '#c2410c',
    joinedOn: '2026-09-01',
    creatorIds: [NORA],
    commission: null,
    invitationPending: false,
    invitationExpiresAt: null,
    ...patch,
  });

const night = {
  id: NIGHT,
  creatorId: NORA,
  platformAccountId: NORA_REVEAL,
  memberId: THEO,
  startsAt: '2026-10-27T22:00:00Z',
  endsAt: '2026-10-28T04:00:00Z',
  templateId: TEMPLATE,
  stoppedAt: null,
};

const planning = (conflicts: unknown[] = []): unknown => ({
  settings: { timeZone: 'Europe/Paris', slotStartMinute: 0, slotLengthMinutes: 360, accessMarginMinutes: 15 },
  accounts: [
    { id: NORA_REVEAL, creatorId: NORA, creatorName: 'Nora Vidal', platform: 'reveal', handle: 'nora' },
  ],
  members: [{ id: THEO, displayName: 'Théo', color: '#c2410c' }],
  shifts: [night],
  conflicts,
});

const template = {
  id: TEMPLATE,
  creatorId: NORA,
  platformAccountId: NORA_REVEAL,
  memberId: THEO,
  weekday: 2,
  startMinute: 1380,
  endMinute: 300,
  validFrom: '2026-10-20',
  validUntil: null,
};

interface Reply {
  readonly status: number;
  readonly body?: unknown;
}
interface Written {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

/** A fake `/v1/scheduling` and `/v1/team/members`: every write is kept in the list returned and answered by `write`. */
function serve(
  routes: { planning?: unknown; write?: (method: string, path: string, body: unknown) => Reply } = {},
): Written[] {
  const written: Written[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const path = new URL(input, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      let reply: Reply;
      if (method !== 'GET') {
        const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        written.push({ method, path, body });
        reply = routes.write?.(method, path, body) ?? { status: 500 };
      } else if (path === '/v1/scheduling/planning')
        reply = { status: 200, body: routes.planning ?? planning() };
      else if (path === '/v1/scheduling/shift-templates')
        reply = { status: 200, body: { templates: [template] } };
      else if (path === '/v1/scheduling/on-duty')
        reply = {
          status: 200,
          body: {
            onDuty: [
              {
                creatorId: NORA,
                platformAccountId: NORA_REVEAL,
                member: { id: THEO, displayName: 'Théo', color: '#c2410c' },
                shiftId: NIGHT,
                endsAt: night.endsAt,
              },
            ],
          },
        };
      else if (path === '/v1/team/members') reply = { status: 200, body: { members: [member({})] } };
      else reply = { status: 404 };
      return Promise.resolve(
        new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? null), {
          status: reply.status,
        }),
      );
    }),
  );
  return written;
}

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute();
  const page = createRoute({ getParentRoute: () => root, path: '/equipe/planning', component: PlanningPage });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/equipe/planning'] }),
  });
  render(
    <QueryClientProvider client={client}>
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
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  reader.zone = 'Europe/Paris';
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Équipe › Planning', () => {
  it('lays the week out by account and day, with who is on shift now', async () => {
    serve();
    renderPage();
    const chip = await screen.findByRole('button', {
      name: 'Théo, 23 h – 5 h, jusqu’au lendemain, en poste',
    });
    // The night shift starts on Tuesday 27, at the agency's hour.
    const row = screen.getByRole('row', { name: /Nora Vidal/u });
    expect(within(row).getByRole('rowheader').textContent).toContain('Nora Vidal@nora sur Reveal');
    expect(within(row).getAllByRole('cell')[1]?.contains(chip)).toBe(true);
    const duty = screen.getByRole('region', { name: 'En poste maintenant' });
    expect(duty.textContent).toContain('ThéoNora Vidaljusqu’à 5 h');
    expect(screen.getByText('1 shift · 6 h')).toBeTruthy();
  });

  it('reads the week at the reader’s own hour on demand', async () => {
    reader.zone = 'Indian/Antananarivo';
    serve();
    renderPage();
    await screen.findByRole('button', { name: /^Théo, 23\u00a0h – 5\u00a0h/u });
    fireEvent.click(screen.getByRole('radio', { name: 'Mon heure (Antananarivo)' }));
    expect(await screen.findByRole('button', { name: /^Théo, 1\u00a0h – 7\u00a0h/u })).toBeTruthy();
  });

  it('says in amber which weekly shifts could not be placed, and opens the one in the way', async () => {
    serve({
      planning: planning([
        {
          templateId: TEMPLATE,
          startsAt: '2026-10-29T22:00:00Z',
          endsAt: '2026-10-30T04:00:00Z',
          reason: 'member_busy',
          shiftId: NIGHT,
        },
      ]),
    });
    renderPage();
    const amber = await screen.findByRole('status', {
      name: 'Un modèle de shift n’a pas pu poser son shift',
    });
    expect(amber.textContent).toContain('jeu. 29 · 23 h – 5 h sur Nora Vidal');
    expect(amber.textContent).toContain('Théo est déjà sur un autre shift.');
    fireEvent.click(within(amber).getByRole('button', { name: 'Voir le shift' }));
    expect((await screen.findByRole('dialog', { name: 'Théo' })).textContent).toContain(
      'Chaque mardi, 23 h – 5 h',
    );
  });

  it('places a shift, and names the one in the way when the member is taken', async () => {
    const written = serve({
      write: () => ({
        status: 409,
        body: {
          error: {
            code: 'shift_member_conflict',
            message: 'taken',
            details: { shiftId: NIGHT },
            requestId: 'r1',
          },
        },
      }),
    });
    renderPage();
    await screen.findByRole('row', { name: /Nora Vidal/u });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un shift' }));
    const panel = await screen.findByRole('dialog', { name: 'Nouveau shift' });
    // At 1 h, the night slot has begun: the panel opens on the next one.
    expect(within(panel).getByRole('radio', { name: '6 h – 12 h' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(within(panel).getByRole('radio', { name: '12 h – 18 h' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Placer Théo' }));
    expect((await within(panel).findByRole('alert')).textContent).toContain(
      'Ce membre est déjà sur un autre shift à ces heures.',
    );
    expect(written).toEqual([
      {
        method: 'POST',
        path: '/v1/scheduling/shifts',
        body: {
          creatorId: NORA,
          platformAccountId: NORA_REVEAL,
          memberId: THEO,
          startsAt: '2026-10-28T11:00:00.000Z',
          endsAt: '2026-10-28T17:00:00.000Z',
        },
      },
    ]);
    fireEvent.click(within(panel).getByRole('button', { name: 'Voir le shift gênant' }));
    expect(await screen.findByRole('dialog', { name: 'Théo' })).toBeTruthy();
  });

  it('stops a shift under way at the minute, after a confirmation', async () => {
    const written = serve({ write: () => ({ status: 200, body: { ...night, endsAt: NOW.toISOString() } }) });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /^Théo, 23\u00a0h – 5\u00a0h/u }));
    const sheet = await screen.findByRole('dialog', { name: 'Théo' });
    expect(sheet.textContent).toContain('En poste');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Arrêter maintenant' }));
    expect(written).toEqual([]);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Arrêter' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(written).toEqual([
      {
        method: 'PATCH',
        path: `/v1/scheduling/shifts/${NIGHT}`,
        body: { endsAt: '2026-10-28T00:00:00.000Z' },
      },
    ]);
  });

  it('closes the sheet when a stop in the first minute cancels the shift (204)', async () => {
    const written = serve({ write: () => ({ status: 204 }) });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /^Théo, 23\u00a0h – 5\u00a0h/u }));
    const sheet = await screen.findByRole('dialog', { name: 'Théo' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Arrêter maintenant' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Arrêter' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(written.map(({ method }) => method)).toEqual(['PATCH']);
  });

  it('keeps a shift template under 23 hours, and words a body the server refuses', async () => {
    const written = serve({
      write: () => ({
        status: 400,
        body: { error: { code: 'request_invalid', message: 'bad', details: {}, requestId: 'r2' } },
      }),
    });
    renderPage();
    await screen.findByRole('row', { name: /Nora Vidal/u });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un shift' }));
    const panel = await screen.findByRole('dialog', { name: 'Nouveau shift' });
    fireEvent.click(within(panel).getByRole('radio', { name: 'Autres heures' }));
    fireEvent.change(within(panel).getByLabelText('Début'), { target: { value: '08:00' } });
    fireEvent.change(within(panel).getByLabelText('Fin'), { target: { value: '07:30' } });
    // 23 h 30 is a shift, not a template: a change of time would stretch it past a day.
    expect(panel.textContent).toContain('23 h 30, jusqu’au lendemain.');
    fireEvent.click(within(panel).getByRole('switch', { name: /Chaque semaine/u }));
    expect(await screen.findByRole('dialog', { name: 'Nouveau modèle de shift' })).toBe(panel);
    expect(panel.textContent).toContain('Un modèle de shift dure 23 heures au plus.');
    const place = within(panel).getByRole('button', { name: 'Placer Théo' });
    expect(place.hasAttribute('disabled')).toBe(true);

    fireEvent.change(within(panel).getByLabelText('Fin'), { target: { value: '07:00' } });
    expect(place.hasAttribute('disabled')).toBe(false);
    fireEvent.click(place);
    expect((await within(panel).findByRole('alert')).textContent).toContain('Ces valeurs ne vont pas');
    expect(written.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'POST /v1/scheduling/shift-templates',
    ]);
  });

  it('says how long a single shift really lasts the night the clocks go forward', async () => {
    serve();
    renderPage();
    await screen.findByRole('row', { name: /Nora Vidal/u });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un shift' }));
    const panel = await screen.findByRole('dialog', { name: 'Nouveau shift' });
    fireEvent.change(within(panel).getByLabelText('Jour'), { target: { value: '2027-03-28' } });
    fireEvent.click(within(panel).getByRole('radio', { name: 'Autres heures' }));
    fireEvent.change(within(panel).getByLabelText('Début'), { target: { value: '00:00' } });
    fireEvent.change(within(panel).getByLabelText('Fin'), { target: { value: '06:00' } });
    // 2 h becomes 3 h in Paris: the night shift lasts 5 h; a template keeps its wall-clock 6 h.
    expect(panel.textContent).toContain('5 h.');
    fireEvent.click(within(panel).getByRole('switch', { name: /Chaque semaine/u }));
    expect(panel.textContent).toContain('6 h.');
  });
});
