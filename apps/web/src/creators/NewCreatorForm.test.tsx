// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NewCreatorForm } from './NewCreatorForm';

/* An invented creator: no real data. */
const LEA = { id: '0192f3a0-0000-7000-8000-0000000000c1', displayName: 'Léa', timezone: 'Europe/Paris' };

function show(status: number, body?: unknown) {
  const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body ?? {}), { status })));
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
    // The id the page chose for this form: a second send finds the same creator instead of a twin.
    expect(JSON.stringify(fetch.mock.calls)).toMatch(
      /\\"id\\":\\"[0-9a-f-]{36}\\",\\"displayName\\":\\"Léa\\",\\"timezone\\":\\"Europe\/Paris\\"/,
    );
  });

  it('says what went wrong and creates nothing', async () => {
    const { onCreated } = show(400);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Ce fuseau n’existe pas. Choisis-en un dans la liste, par exemple Europe/Paris.',
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
