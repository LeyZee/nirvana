// @vitest-environment jsdom
import { ConversationSummarySchema, type ConversationSummary } from '@nirvana/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TrackingPage } from './TrackingPage';

/* Invented creators and fans: no real data. */
const LEA = { id: '0192f3a0-0000-7000-8000-0000000000c1', displayName: 'Léa', timezone: 'Europe/Paris' };
const NINA = { id: '0192f3a0-0000-7000-8000-0000000000c2', displayName: 'Nina', timezone: 'Europe/Paris' };

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

interface Reply {
  status: number;
  body?: unknown;
}

/** A fake server: one answer per path, `/v1/conversations` by creator id. */
function serve(routes: {
  creators: Reply | (() => Reply);
  conversations?: Record<string, { items: ConversationSummary[]; nextCursor: string | null }>;
}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const url = new URL(input, 'http://localhost');
      const reply: Reply =
        url.pathname === '/v1/creators'
          ? typeof routes.creators === 'function'
            ? routes.creators()
            : routes.creators
          : { status: 200, body: routes.conversations?.[url.searchParams.get('creatorId') ?? ''] };
      return Promise.resolve(new Response(JSON.stringify(reply.body ?? null), { status: reply.status }));
    }),
  );
}

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TrackingPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TrackingPage', () => {
  it('says how to create the first creator when there is none', async () => {
    serve({ creators: { status: 200, body: { creators: [] } } });
    renderPage();
    expect(await screen.findByText('Aucune créatrice reliée')).toBeDefined();
    expect(screen.getByText(/pnpm creator:create/u)).toBeDefined();
  });

  it('says the server did not answer, and Réessayer reads again', async () => {
    let calls = 0;
    serve({
      creators: () => (++calls === 1 ? { status: 500 } : { status: 200, body: { creators: [LEA] } }),
      conversations: { [LEA.id]: { items: [conversation('1')], nextCursor: null } },
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Fan 1')).toBeDefined();
    expect(screen.queryByText('Le serveur n’a pas répondu')).toBeNull();
  });

  it('lists the conversations of one creator, most recent first, with their state', async () => {
    serve({
      creators: { status: 200, body: { creators: [LEA] } },
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
});
