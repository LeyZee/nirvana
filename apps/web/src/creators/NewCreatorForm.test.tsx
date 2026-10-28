// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { NewCreatorForm } from './NewCreatorForm';

/* An invented creator: no real data. */
const LEA = { id: '0192f3a0-0000-7000-8000-0000000000c1', displayName: 'Léa', timezone: 'Europe/Paris' };

function show(status: number, body?: unknown) {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(new Response(JSON.stringify(body ?? {}), { status })),
  );
  vi.stubGlobal('fetch', fetch);
  const onCreated = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NewCreatorForm onCreated={onCreated} onCancel={null} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText('Prénom ou pseudo'), { target: { value: ' Léa ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
  return { fetch, onCreated };
}

/** The JSON body of the n-th request the form sent. */
function sentBody(fetch: ReturnType<typeof show>['fetch'], call = 0): unknown {
  const body = fetch.mock.calls[call]?.[1].body;
  return typeof body === 'string' ? JSON.parse(body) : undefined;
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('NewCreatorForm', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('creates her with the name typed and Paris by default', async () => {
    const { fetch, onCreated } = show(201, LEA);
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(LEA);
    });
    expect(fetch).toHaveBeenCalledWith('/v1/creators', expect.objectContaining({ method: 'POST' }));
    const sent = z.object({ id: z.string(), displayName: z.string(), timezone: z.string() }).strict();
    const body = sent.parse(sentBody(fetch));
    expect(body.id).toMatch(ID);
    expect(body).toMatchObject({ displayName: 'Léa', timezone: 'Europe/Paris' });
  });

  it('sends once on a double click', async () => {
    const { fetch, onCreated } = show(201, LEA);
    fireEvent.click(screen.getByRole('button', { name: /Créer|Création/ }));
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('sends the same id again after a failure, so a retry cannot make a twin', async () => {
    const { fetch } = show(503);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });
    const first = z.object({ id: z.string() }).parse(sentBody(fetch, 0)).id;
    expect(first).toMatch(ID);
    expect(z.object({ id: z.string() }).parse(sentBody(fetch, 1)).id).toBe(first);
  });

  it('says what went wrong and creates nothing', async () => {
    const { onCreated } = show(400);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Ce fuseau n’existe pas. Choisis-en un dans la liste, par exemple Europe/Paris.',
    );
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('says when the same form already made her under another name', async () => {
    const { onCreated } = show(409);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Cette créatrice vient d’être créée sous un autre nom. Recharge la page pour la voir.',
    );
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('cannot create a creator without a name', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NewCreatorForm onCreated={vi.fn()} onCancel={null} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Créer' })).toHaveProperty('disabled', true);
  });
});
