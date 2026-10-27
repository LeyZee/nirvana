// @vitest-environment jsdom
import {
  ConversationDetailSchema,
  ConversationSummarySchema,
  MessageViewSchema,
  type ConversationDetail,
  type ConversationSummary,
  type FanFlags,
} from '@nirvana/contracts';
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

import { TrackingPage } from './TrackingPage';
import { parseTrackingSearch } from './view';

import { apiDashboard } from '@/test/fakes';

/* Invented creators and fans: no real data. */
const LEA = { id: '0192f3a0-0000-7000-8000-0000000000c1', displayName: 'Léa', timezone: 'Europe/Paris' };
const NINA = { id: '0192f3a0-0000-7000-8000-0000000000c2', displayName: 'Nina', timezone: 'Europe/Paris' };
const DRAFT = '0192f3a0-0000-7000-8000-0000000000d1';

function conversation(id: string, patch: Partial<ConversationSummary> = {}): ConversationSummary {
  return ConversationSummarySchema.parse({
    id: `0192f3a0-0000-7000-8000-00000000000${id}`,
    fanId: `0192f3a0-0000-7000-8000-0000000000f${id}`,
    fanDisplayName: `Fan ${id}`,
    state: 'idle',
    mode: 'copilot',
    lastInboundAt: null,
    lastOutboundAt: null,
    unreadCount: 0,
    updatedAt: '2026-10-17T20:00:00Z',
    ...patch,
  });
}

/** Fan 1 waits for a draft: « Coucou toi » then « Tu fais quoi ? ». */
function waiting(patch: Partial<ConversationDetail> = {}): ConversationDetail {
  return ConversationDetailSchema.parse({
    ...conversation('1', { state: 'awaiting_approval' }),
    openDrafts: [
      {
        id: DRAFT,
        status: 'pending',
        bubbles: ['Coucou toi', 'Tu fais quoi ?'],
        finalBubbles: null,
        createdAt: '2026-10-17T20:01:00Z',
      },
    ],
    ...patch,
  });
}

const FAN_MESSAGE = MessageViewSchema.parse({
  id: '0192f3a0-0000-7000-8000-000000000101',
  direction: 'inbound',
  author: 'fan',
  text: 'Salut, ça va ?',
  priceMinor: null,
  currency: null,
  isPaid: false,
  draftId: null,
  platformCreatedAt: '2026-10-17T20:00:00Z',
});

interface Reply {
  status: number;
  body?: unknown;
}

/** One POST the fake server received: the action (`approve`, `takeover`…) and its JSON body. */
interface Posted {
  readonly action: string;
  readonly body: unknown;
}

/**
 * A fake server: `/v1/creators`, `/v1/conversations` by creator id, `/v1/dashboard`, one conversation's detail,
 * messages and events, and the commands, which answer `command` (204 by default) and are recorded in `posted`.
 */
function serve(routes: {
  creators: Reply | (() => Reply);
  conversations?: Record<string, { items: ConversationSummary[]; nextCursor: string | null }>;
  dashboard?: Reply;
  detail?: () => Reply;
  command?: (action: string) => Reply;
  /** The fan's limits read first, and after a `PUT` (the same when not given). */
  flags?: { before?: FanFlags; after?: FanFlags };
}): Posted[] {
  const posted: Posted[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      const path = url.pathname;
      let reply: Reply;
      const flagsView = (flags: FanFlags = {}): Reply => ({
        status: 200,
        body: { fanId: path.split('/')[3], flags },
      });
      if (init?.method === 'POST' || init?.method === 'PUT') {
        const action = path.split('/').at(-1) ?? '';
        posted.push({ action, body: JSON.parse(typeof init.body === 'string' ? init.body : 'null') });
        reply =
          routes.command?.(action) ??
          (init.method === 'PUT' ? flagsView(routes.flags?.after ?? routes.flags?.before) : { status: 204 });
      } else if (path.startsWith('/v1/fans/')) {
        reply = flagsView(routes.flags?.before);
      } else if (path === '/v1/creators') {
        reply = typeof routes.creators === 'function' ? routes.creators() : routes.creators;
      } else if (path === '/v1/conversations') {
        reply = { status: 200, body: routes.conversations?.[url.searchParams.get('creatorId') ?? ''] };
      } else if (path === '/v1/dashboard') {
        reply = routes.dashboard ?? { status: 200, body: apiDashboard({ todos: [] }) };
      } else if (path.endsWith('/messages')) {
        reply = { status: 200, body: { items: [FAN_MESSAGE], nextCursor: null } };
      } else if (path.endsWith('/events')) {
        reply = { status: 200, body: { items: [], nextCursor: null } };
      } else {
        reply = routes.detail?.() ?? { status: 404 };
      }
      if (reply.status === 204) return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(JSON.stringify(reply.body ?? null), { status: reply.status }));
    }),
  );
  return posted;
}

/** Suivi as the app mounts it: the open conversation lives in the address. */
function renderPage(at = '/suivi', canDecide = true, canAddCreator = true): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute();
  const tracking = createRoute({
    getParentRoute: () => root,
    path: '/suivi',
    validateSearch: parseTrackingSearch,
    component: function Tracking() {
      const { conversation } = tracking.useSearch();
      const navigate = tracking.useNavigate();
      return (
        <TrackingPage
          selected={conversation ?? null}
          onSelect={(id) => void navigate({ search: id === null ? {} : { conversation: id } })}
          canDecide={canDecide}
          canAddCreator={canAddCreator}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([tracking, createRoute({ getParentRoute: () => root, path: '/creatrices' })]),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const ONE = { creators: { status: 200, body: { creators: [LEA] } } };
const OPEN = `/suivi?conversation=${conversation('1').id}`;

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TrackingPage', () => {
  it('sends to Créatrices when there is no creator yet, with no developer command', async () => {
    serve({ creators: { status: 200, body: { creators: [] } } });
    renderPage();
    expect(await screen.findByText('Aucune créatrice pour l’instant')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Aller à Créatrices' }).getAttribute('href')).toBe('/creatrices');
    expect(screen.queryByText(/pnpm/u)).toBeNull();
  });

  it('never sends a team member to Créatrices, which is not in his rail', async () => {
    serve({ creators: { status: 200, body: { creators: [] } } });
    renderPage('/suivi', true, false);
    expect(await screen.findByText('Rien pour toi pour l’instant')).toBeDefined();
    expect(screen.queryByText('Aucune créatrice pour l’instant')).toBeNull();
    expect(document.querySelector('a[href="/creatrices"]')).toBeNull();
  });

  it('says the server does not answer, and Réessayer reads again', async () => {
    let calls = 0;
    serve({
      creators: () => (++calls === 1 ? { status: 500 } : { status: 200, body: { creators: [LEA] } }),
      conversations: { [LEA.id]: { items: [conversation('1')], nextCursor: null } },
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Fan 1')).toBeDefined();
    expect(screen.queryByText('Le serveur ne répond pas')).toBeNull();
  });

  it('lists the conversations of one creator, most recent first, with their state', async () => {
    serve({
      ...ONE,
      conversations: {
        [LEA.id]: {
          items: [
            conversation('1', { updatedAt: '2026-10-17T18:00:00Z' }),
            conversation('2', {
              fanDisplayName: '  ',
              state: 'awaiting_approval',
              unreadCount: 3,
              updatedAt: '2026-10-17T20:30:00Z',
            }),
          ],
          nextCursor: 'next',
        },
      },
    });
    renderPage();
    const list = await screen.findByRole('list', { name: 'Conversations' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.nv-convo__name')?.textContent)).toEqual([
      'Fan sans nom',
      'Fan 1',
    ]);
    expect(rows[0]?.textContent).toContain('À valider');
    expect(rows[0]?.textContent).toContain('3 non lus');
    // One creator: her name heads the page, not every row.
    expect(screen.getByText('Léa')).toBeDefined();
    expect(rows[1]?.textContent).not.toContain('Léa');
    expect(screen.getByText('Seules les plus récentes sont affichées.')).toBeDefined();
  });

  it('names the creator on each row when the account sees several', async () => {
    serve({
      creators: { status: 200, body: { creators: [LEA, NINA] } },
      conversations: {
        [LEA.id]: { items: [conversation('1')], nextCursor: null },
        [NINA.id]: { items: [conversation('2')], nextCursor: null },
      },
    });
    renderPage();
    const list = await screen.findByRole('list', { name: 'Conversations' });
    const text = within(list)
      .getAllByRole('listitem')
      .map((row) => row.textContent);
    expect(text.some((line) => line.includes('Léa · '))).toBe(true);
    expect(text.some((line) => line.includes('Nina · '))).toBe(true);
  });

  it('puts first what waits for a human, as the server computed it, and opens it', async () => {
    serve({
      ...ONE,
      conversations: { [LEA.id]: { items: [conversation('1')], nextCursor: null } },
      // The default todo: Kévin, a possible minor, on conversation 1.
      dashboard: { status: 200, body: apiDashboard() },
      detail: () => ({ status: 200, body: waiting({ state: 'human', openDrafts: [] }) }),
    });
    renderPage();
    const queue = await screen.findByRole('list', { name: 'À traiter' });
    expect(queue.textContent).toContain('Mineur possible · Kévin');
    expect(queue.textContent).toContain('19 min');
    fireEvent.click(within(queue).getByRole('button'));
    expect(await screen.findByText('Salut, ça va ?')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Rendre la main à l’agent' })).toBeDefined();
  });
});

describe('the reader of Suivi', () => {
  const withDraft = {
    ...ONE,
    conversations: {
      [LEA.id]: { items: [conversation('1', { state: 'awaiting_approval' })], nextCursor: null },
    },
  };

  it('opens the conversation of a Telegram link, with the draft that waits', async () => {
    serve({ ...withDraft, detail: () => ({ status: 200, body: waiting() }) });
    renderPage(OPEN);
    const draft = await screen.findByRole('region', { name: 'Brouillon à valider' });
    expect(within(draft).getByText('Coucou toi')).toBeDefined();
    expect(screen.getByText('Salut, ça va ?')).toBeDefined();
  });

  it('sends the draft as written on Valider, then reads the conversation again', async () => {
    let approved = false;
    const posted = serve({
      ...withDraft,
      detail: () => ({
        status: 200,
        body: approved ? waiting({ state: 'idle', openDrafts: [] }) : waiting(),
      }),
      command: () => {
        approved = true;
        return { status: 204 };
      },
    });
    renderPage(OPEN);
    fireEvent.click(await screen.findByRole('button', { name: 'Valider' }));
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Brouillon à valider' })).toBeNull();
    });
    expect(posted).toEqual([{ action: 'approve', body: {} }]);
  });

  it('sends the retouched bubbles, one per line', async () => {
    const posted = serve({ ...withDraft, detail: () => ({ status: 200, body: waiting() }) });
    renderPage(OPEN);
    fireEvent.click(await screen.findByRole('button', { name: 'Retoucher' }));
    fireEvent.change(screen.getByLabelText('Une bulle par ligne'), {
      target: { value: 'Coucou toi\nTu fais quoi ce soir ?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la retouche' }));
    await waitFor(() => {
      expect(posted).toEqual([
        { action: 'approve', body: { bubbles: ['Coucou toi', 'Tu fais quoi ce soir ?'] } },
      ]);
    });
  });

  it('keeps the draft and says which guard blocks it when the server refuses it', async () => {
    serve({
      ...withDraft,
      detail: () => ({ status: 200, body: waiting() }),
      command: () => ({
        status: 422,
        body: {
          error: {
            code: 'draft_unprocessable',
            message: 'x',
            details: { guards: ['meeting_promise'] },
            requestId: 'r',
          },
        },
      }),
    });
    renderPage(OPEN);
    fireEvent.click(await screen.findByRole('button', { name: 'Valider' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ce message ne peut pas partir : une promesse de rencontre. Retouche-le ou refuse-le.',
    );
    expect(screen.getByRole('region', { name: 'Brouillon à valider' })).toBeDefined();
  });

  it('refuses the draft with the reason given', async () => {
    const posted = serve({ ...withDraft, detail: () => ({ status: 200, body: waiting() }) });
    renderPage(OPEN);
    fireEvent.click(await screen.findByRole('button', { name: 'Refuser' }));
    fireEvent.change(screen.getByLabelText(/Pourquoi/u), { target: { value: 'Trop froid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refuser le brouillon' }));
    await waitFor(() => {
      expect(posted).toEqual([{ action: 'reject', body: { reason: 'Trop froid' } }]);
    });
  });

  it('takes the hand over: a person answers in Reveal from then on', async () => {
    const posted = serve({ ...withDraft, detail: () => ({ status: 200, body: waiting() }) });
    renderPage(OPEN);
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre la main' }));
    await waitFor(() => {
      expect(posted).toEqual([{ action: 'takeover', body: {} }]);
    });
  });

  it('gives the hand back with what the chatter wants the agent to remember', async () => {
    const posted = serve({
      ...withDraft,
      detail: () => ({ status: 200, body: waiting({ state: 'human', openDrafts: [] }) }),
    });
    renderPage(OPEN);
    fireEvent.change(await screen.findByLabelText(/À retenir sur ce fan/u), {
      target: { value: '  Il fête son anniversaire le 12 mars  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rendre la main à l’agent' }));
    await waitFor(() => {
      expect(posted).toEqual([{ action: 'release', body: { note: 'Il fête son anniversaire le 12 mars' } }]);
    });
  });

  it('gives the hand back with no note when none is written', async () => {
    const posted = serve({
      ...withDraft,
      detail: () => ({ status: 200, body: waiting({ state: 'human', openDrafts: [] }) }),
    });
    renderPage(OPEN);
    expect((await screen.findByLabelText(/À retenir sur ce fan/u)).getAttribute('maxlength')).toBe('300');
    fireEvent.click(screen.getByRole('button', { name: 'Rendre la main à l’agent' }));
    await waitFor(() => {
      expect(posted).toEqual([{ action: 'release', body: {} }]);
    });
  });

  it('folds the fan’s limits to one line, in amber when one stops the agent', async () => {
    serve({
      ...withDraft,
      detail: () => ({ status: 200, body: waiting() }),
      flags: { before: { doNotContact: true } },
    });
    renderPage(OPEN);
    const line = await screen.findByText('Ne plus lui écrire', { selector: '.tr-limits__sum' });
    expect(line.className).toContain('tr-warn');
  });

  it('opens when a limit blocks, and stays open once it is lifted', async () => {
    const posted = serve({
      ...withDraft,
      detail: () => ({ status: 200, body: waiting() }),
      flags: { before: { doNotContact: true }, after: {} },
    });
    renderPage(OPEN);
    const lift = await screen.findByRole('switch', { name: /Ne plus lui écrire/u });
    const section = lift.closest('details');
    expect(section).toHaveProperty('open', true);
    fireEvent.click(lift);
    expect(await screen.findByText('Aucune', { selector: '.tr-limits__sum' })).toBeDefined();
    expect(posted).toEqual([{ action: 'flags', body: { flag: 'doNotContact', set: false } }]);
    expect(section).toHaveProperty('open', true);
  });

  it('freezes sales as a human’s call, and shows the limits the server answers', async () => {
    const posted = serve({
      ...withDraft,
      detail: () => ({ status: 200, body: waiting() }),
      flags: { after: { salesFrozen: { reason: 'operator', since: '2026-10-23T10:00:00.000Z' } } },
    });
    renderPage(OPEN);
    fireEvent.click(await screen.findByRole('switch', { name: /Ventes gelées/u }));
    expect(await screen.findByText('Depuis le 23 octobre : décision d’un humain.')).toBeDefined();
    expect(posted).toEqual([
      { action: 'flags', body: { flag: 'salesFrozen', set: true, freezeReason: 'operator' } },
    ]);
  });

  it('confirms his age in two clicks only', async () => {
    const posted = serve({
      ...withDraft,
      detail: () => ({ status: 200, body: waiting() }),
      flags: { after: { ageConfirmedAt: '2026-10-23T10:00:00.000Z' } },
    });
    renderPage(OPEN);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer son âge' }));
    expect(posted).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Oui, il est majeur' }));
    expect(await screen.findByText('Majeur, confirmé le 23 octobre.')).toBeDefined();
    expect(posted).toEqual([{ action: 'flags', body: { flag: 'ageConfirmedAt', set: true } }]);
  });

  it('sets a ceiling typed in euros, in cents', async () => {
    const posted = serve({ ...withDraft, detail: () => ({ status: 200, body: waiting() }) });
    renderPage(OPEN);
    fireEvent.click(await screen.findByRole('button', { name: 'Fixer un plafond' }));
    fireEvent.change(screen.getByLabelText('Plafond en euros'), { target: { value: '49,90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => {
      expect(posted).toEqual([
        { action: 'flags', body: { flag: 'spendingLimitMinor', set: true, limitMinor: 4990 } },
      ]);
    });
  });

  it('keeps the limits as they were and says why when the server refuses', async () => {
    serve({
      ...withDraft,
      detail: () => ({ status: 200, body: waiting() }),
      command: () => ({ status: 403 }),
    });
    renderPage(OPEN);
    const fragile = await screen.findByRole('switch', { name: /Fan fragile/u });
    fireEvent.click(fragile);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Seuls le propriétaire et les chatteurs changent les limites d’un fan.',
    );
    expect(fragile).toHaveProperty('checked', false);
  });

  it('lets a creator read, never decide', async () => {
    serve({ ...withDraft, detail: () => ({ status: 200, body: waiting() }) });
    renderPage(OPEN, false);
    expect(await screen.findByText(/Seuls le propriétaire et les chatteurs/u)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reprendre la main' })).toBeNull();
    // Her fan's limits: read, never changed.
    expect(await screen.findByRole('switch', { name: /Ventes gelées/u })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: 'Confirmer son âge' })).toBeNull();
  });

  it('says the server does not answer, in amber, with nothing to click', async () => {
    serve({ ...withDraft, detail: () => ({ status: 503 }) });
    renderPage(OPEN);
    // One retry first (a blip is not an outage), then the reader says so.
    expect(await screen.findByText('Le serveur ne répond pas', undefined, { timeout: 4_000 })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull();
  });
});
