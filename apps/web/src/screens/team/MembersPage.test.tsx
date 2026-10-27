// @vitest-environment jsdom
import { TeamMemberSchema, type TeamMember } from '@nirvana/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  type AnyRouter,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MembersPage } from './MembersPage';
import { parseTeamSearch } from './model';

const confirmPassword = vi.fn<(password: string) => Promise<string>>();
vi.mock('@/settings/services/api', () => ({
  confirmPassword: (password: string) => confirmPassword(password),
}));

/* Invented members and creators: no real data (ADR 0010). */
const LEA = { id: '0192f3a0-0000-7000-8000-0000000000c1', displayName: 'Léa', timezone: 'Europe/Paris' };
const PRESET = '0199f2a0-0000-7000-8000-0000000000b1';
const PRESETS = [{ id: PRESET, name: 'Confirmé', rateBps: 1500, effectiveFrom: '2026-10-01' }];
const id = (n: number): string => `0199f2a0-0000-7000-8000-0000000000${String(n)}`;

function member(n: number, patch: Partial<TeamMember> = {}): TeamMember {
  return TeamMemberSchema.parse({
    id: id(n),
    userId: id(n + 50),
    email: 'membre@example.test',
    firstName: 'Théo',
    lastName: 'Martin',
    displayName: 'Théo',
    teamRole: 'chatter',
    status: 'active',
    country: 'BJ',
    timeZone: 'Africa/Porto-Novo',
    color: null,
    joinedOn: '2026-09-01',
    creatorIds: [LEA.id],
    commission: { rateBps: 1500, teamShareBps: null, presetId: PRESET, effectiveFrom: '2026-09-01' },
    invitationPending: false,
    invitationExpiresAt: null,
    ...patch,
  });
}

const THEO = member(11);
const BASILE = member(12, {
  displayName: 'Basile',
  firstName: 'Basile',
  status: 'on_leave',
  commission: null,
});
const JULES = member(13, { displayName: 'Jules', firstName: 'Jules', status: 'left' });
const INES = member(14, { displayName: 'Inès', firstName: 'Inès', teamRole: 'manager', country: 'FR' });
const TEAM = [THEO, BASILE, JULES, INES];

interface Reply {
  readonly status: number;
  readonly body?: unknown;
}
interface Posted {
  readonly path: string;
  readonly body: unknown;
}

const apiError = (code: string): unknown => ({
  error: { code, message: code, details: {}, requestId: 'r1' },
});

/** A fake `/v1/team`: the list, the presets, the notes, and every POST answered by `post` and kept in `posted`. */
function serve(routes: { members?: Reply; post?: (path: string, body: unknown) => Reply } = {}): Posted[] {
  const posted: Posted[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const path = new URL(input, 'http://localhost').pathname;
      let reply: Reply;
      if (init?.method === 'POST') {
        const body: unknown = JSON.parse(typeof init.body === 'string' ? init.body : 'null');
        posted.push({ path, body });
        reply = routes.post?.(path, body) ?? { status: 500 };
      } else if (path === '/v1/team/members')
        reply = routes.members ?? { status: 200, body: { members: TEAM } };
      else if (path === '/v1/team/commission-presets') reply = { status: 200, body: { presets: PRESETS } };
      else if (path === '/v1/creators') reply = { status: 200, body: { creators: [LEA] } };
      else if (path.endsWith('/notes')) reply = { status: 200, body: { notes: [] } };
      else reply = { status: 404 };
      return Promise.resolve(new Response(JSON.stringify(reply.body ?? null), { status: reply.status }));
    }),
  );
  return posted;
}

/** The page as the app mounts it: the tab and the open member live in the address. */
function renderPage(at = '/equipe', canManage = true): AnyRouter {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute();
  const team = createRoute({
    getParentRoute: () => root,
    path: '/equipe',
    validateSearch: parseTeamSearch,
    component: function Team() {
      const { onglet, membre } = team.useSearch();
      const navigate = team.useNavigate();
      return (
        <MembersPage
          tab={onglet === 'managers' ? 'manager' : 'chatter'}
          selected={membre ?? null}
          canManage={canManage}
          onTab={(tab) =>
            void navigate({ search: (s) => ({ ...s, onglet: tab === 'manager' ? 'managers' : undefined }) })
          }
          onSelect={(memberId) => void navigate({ search: (s) => ({ ...s, membre: memberId ?? undefined }) })}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([team]),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const names = (list: string): string[] =>
  within(screen.getByRole('list', { name: list }))
    .getAllByRole('button')
    .map((row) => row.querySelector('.nv-convo__name')?.firstChild?.textContent ?? '');

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  confirmPassword.mockReset();
});

describe('Équipe › Membres', () => {
  it('lists the chatters at work first, folds those who left, and counts each tab', async () => {
    serve();
    renderPage();
    await screen.findByText('2 actifs · 1 absent');
    expect(names('Chatteurs')).toEqual(['Théo', 'Basile']);
    expect(within(screen.getByRole('radio', { name: /Chatteurs/u })).getByText('2')).toBeDefined();
    expect(within(screen.getByRole('radio', { name: /Managers/u })).getByText('1')).toBeDefined();
    expect(names('Partis')).toEqual(['Jules']);
    expect(screen.getAllByText(/Confirmé · 15\s%/u).length).toBeGreaterThan(0);
  });

  it('keeps the managers tab in the address', async () => {
    serve();
    const router = renderPage();
    fireEvent.click(await screen.findByRole('radio', { name: /Managers/u }));
    await waitFor(() => {
      expect(names('Managers')).toEqual(['Inès']);
    });
    expect(router.state.location.search).toEqual({ onglet: 'managers' });
  });

  it('searches by name and says when nobody answers', async () => {
    serve();
    renderPage();
    const search = await screen.findByLabelText('Rechercher un membre');
    fireEvent.change(search, { target: { value: 'basi' } });
    expect(names('Chatteurs')).toEqual(['Basile']);
    fireEvent.change(search, { target: { value: 'Zoé' } });
    expect(screen.getByText('Personne ne répond à « Zoé ».')).toBeDefined();
  });

  it('opens a member on the right, with his rate, his creators and his notes', async () => {
    serve({
      post: () => ({
        status: 201,
        body: { id: id(90), body: 'À suivre', authorName: 'Nora', createdAt: '2026-10-27T10:00:00.000Z' },
      }),
    });
    const router = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /^Théo/u }));
    const sheet = await screen.findByRole('region', { name: 'Théo' });
    expect(router.state.location.search).toEqual({ membre: THEO.id });
    expect(within(sheet).getByText(/Confirmé · depuis le/u)).toBeDefined();
    expect(within(sheet).getByText('Léa')).toBeDefined();
    expect(within(sheet).getByText('Lues par toi et les managers, jamais par Théo.')).toBeDefined();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Fermer la fiche' }));
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Théo' })).toBeNull();
    });
  });

  it('adds an internal note', async () => {
    const posted = serve({
      post: () => ({
        status: 201,
        body: { id: id(90), body: 'À suivre', authorName: 'Nora', createdAt: '2026-10-27T10:00:00.000Z' },
      }),
    });
    renderPage(`/equipe?membre=${THEO.id}`);
    fireEvent.change(await screen.findByLabelText('Nouvelle note'), { target: { value: '  À suivre  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la note' }));
    await waitFor(() => {
      expect(posted).toEqual([{ path: `/v1/team/members/${THEO.id}/notes`, body: { body: 'À suivre' } }]);
    });
  });

  it('lets a manager read the team, never add a member nor make a link', async () => {
    serve();
    renderPage(`/equipe?membre=${THEO.id}`, false);
    await screen.findByRole('region', { name: 'Théo' });
    expect(screen.queryByRole('button', { name: 'Ajouter un membre' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lien de nouveau mot de passe' })).toBeNull();
  });

  it('offers the first member to an empty team, and says when the server does not answer', async () => {
    serve({ members: { status: 200, body: { members: [] } } });
    renderPage();
    expect(await screen.findByText('Ton équipe commence ici')).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Ajouter un membre' })).toHaveLength(1);
    cleanup();
    serve({ members: { status: 503 } });
    renderPage();
    expect(await screen.findByText('Le serveur ne répond pas')).toBeDefined();
  });
});

describe('adding a member', () => {
  const fill = (label: string, value: string): void => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  };
  const open = async (): Promise<void> => {
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter un membre' }));
    await screen.findByRole('dialog', { name: 'Nouveau membre' });
  };
  const who = (): void => {
    fill('Prénom', 'Kofi');
    fill('Nom', 'Agbo');
    fill('E-mail', 'kofi@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
  };
  const KOFI = member(20, { displayName: 'Kofi', firstName: 'Kofi', invitationPending: true });

  it('stops a step on what is missing, in words', async () => {
    serve();
    renderPage();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(screen.getByText('Indique son prénom.')).toBeDefined();
    expect(screen.getByText('Une adresse e-mail complète.')).toBeDefined();
    expect(screen.getByLabelText('Prénom').getAttribute('aria-invalid')).toBe('true');
  });

  it('goes through the three steps, creates the member, then hands over his link', async () => {
    const posted = serve({
      post: (path) =>
        path === '/v1/team/members'
          ? { status: 201, body: KOFI }
          : {
              status: 201,
              body: {
                url: 'https://nirvana.example.test/bienvenue#t=lien-invente-0001',
                expiresAt: '2026-10-30T12:00:00.000Z',
              },
            },
    });
    const router = renderPage();
    await open();
    who();
    // The team name followed the first name; the zone follows the country.
    fireEvent.change(await screen.findByLabelText('Pays'), { target: { value: 'MG' } });
    expect(screen.getByText(/Indian\/Antananarivo/u)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Confirmé/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Léa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter Kofi' }));

    expect(await screen.findByRole('heading', { name: 'Kofi est dans l’équipe' })).toBeDefined();
    expect(screen.getByLabelText<HTMLInputElement>('Lien à envoyer').value).toBe(
      'https://nirvana.example.test/bienvenue#t=lien-invente-0001',
    );
    expect(posted[0]).toMatchObject({
      path: '/v1/team/members',
      body: {
        email: 'kofi@example.test',
        firstName: 'Kofi',
        displayName: 'Kofi',
        teamRole: 'chatter',
        country: 'MG',
        timeZone: 'Indian/Antananarivo',
        commission: { presetId: PRESET },
        creatorIds: [LEA.id],
        teamShareBps: null,
      },
    });
    expect(posted[1]).toEqual({
      path: `/v1/team/members/${KOFI.id}/invitation-link`,
      body: { purpose: 'invitation' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Voir sa fiche' }));
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ membre: KOFI.id });
    });
  });

  it('sends a rate typed by hand under « Autre »', async () => {
    const posted = serve({ post: () => ({ status: 500 }) });
    renderPage();
    await open();
    who();
    fireEvent.click(await screen.findByRole('button', { name: 'Continuer' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Autre/u }));
    fill('Taux à la main', '12,5');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter Kofi' }));
    expect(await screen.findByText(/Personne n’a été ajouté/u)).toBeDefined();
    expect(posted[0]?.body).toMatchObject({ commission: { rateBps: 1250 } });
  });

  it('takes the owner back to the e-mail when an account already has it', async () => {
    serve({ post: () => ({ status: 409, body: apiError('member_conflict') }) });
    renderPage();
    await open();
    who();
    fireEvent.click(await screen.findByRole('button', { name: 'Continuer' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Confirmé/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter Kofi' }));
    expect(await screen.findByText('Un compte utilise déjà cet e-mail.')).toBeDefined();
    expect(screen.getByLabelText('E-mail').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('a link from the sheet', () => {
  it('asks for the password when the sign-in is old, then makes the link', async () => {
    let calls = 0;
    serve({
      post: () => {
        calls += 1;
        return calls === 1
          ? { status: 403, body: apiError('reauthentication_forbidden') }
          : {
              status: 201,
              body: {
                url: 'https://nirvana.example.test/nouveau-mot-de-passe#t=lien-invente-0002',
                expiresAt: '2026-10-30T12:00:00.000Z',
              },
            };
      },
    });
    confirmPassword.mockResolvedValue('ok');
    renderPage(`/equipe?membre=${THEO.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Lien de nouveau mot de passe' }));
    const password = await screen.findByLabelText('Ton mot de passe');
    fireEvent.change(password, { target: { value: 'mot-de-passe-invente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(await screen.findByLabelText('Lien à envoyer')).toBeDefined();
    expect(confirmPassword).toHaveBeenCalledWith('mot-de-passe-invente');
  });

  it('says why a member who left gets no link', async () => {
    serve({ post: () => ({ status: 409, body: apiError('member_left_conflict') }) });
    renderPage(`/equipe?membre=${BASILE.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Lien de nouveau mot de passe' }));
    expect(await screen.findByText('Ce membre est parti : sa fiche ne change plus.')).toBeDefined();
  });
});
