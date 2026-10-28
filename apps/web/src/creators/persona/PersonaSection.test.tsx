// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import blocksYaml from '../../../../../personas/demo/v0.2.0.yaml?raw';

import { PersonaSection } from './PersonaSection';
import { parsePersonaYaml } from './source';

const CREATOR = '6f1c2a0e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const SUMMARY = {
  id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  version: '0.2.0',
  contentHash: 'a'.repeat(64),
  isActive: true,
  createdAt: '2026-10-28T08:00:00.000Z',
};

beforeEach(() => {
  // jsdom has no matchMedia: a reduced motion, so the tab lens does not play.
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  );
  // jsdom has no layout: bringing the picked tab into view is a no-op.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Her stored persona is the demo with every block; a save answers `saved` (status, body). */
async function serve(saved: readonly [number, unknown]) {
  const persona = await parsePersonaYaml(blocksYaml);
  const fake = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url, init) => {
    if (init?.method === 'POST') {
      return Promise.resolve(new Response(JSON.stringify(saved[1]), { status: saved[0] }));
    }
    if (url === `/v1/creators/${CREATOR}/persona`) {
      const overview = { creatorId: CREATOR, latest: { summary: SUMMARY, persona }, versions: [SUMMARY] };
      return Promise.resolve(new Response(JSON.stringify(overview), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
  vi.stubGlobal('fetch', fake);
  return fake;
}

const refusal = (faults: unknown) =>
  [
    422,
    {
      error: {
        code: 'persona_sample_reply_unprocessable',
        message: 'Une réponse type est refusée.',
        details: { faults },
        requestId: 'req-1',
      },
    },
  ] as const;

const tab = (name: string): HTMLElement => screen.getByRole('tab', { name: new RegExp(`^${name}`, 'u') });

describe('Créatrices › Persona, the P5-01 blocks', () => {
  it('shows how complete she is, and opens the tab of a block still to write', async () => {
    await serve([500, {}]);
    render(<PersonaSection creatorId={CREATOR} canSave timezone="Europe/Paris" />);
    const gauge = await screen.findByRole('progressbar', { name: 'Complétude de la persona' });
    expect(gauge.getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByText('100 %')).toBeDefined();

    fireEvent.click(tab('Réponses types'));
    // Her three replies: each « Retirer » removes the first one left.
    for (let left = 3; left > 0; left -= 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Retirer la 1re réponse' }));
    }
    expect(screen.queryByRole('button', { name: /^Retirer la/u })).toBeNull();
    expect(
      screen.getByRole('progressbar', { name: 'Complétude de la persona' }).getAttribute('aria-valuenow'),
    ).not.toBe('100');
    const missing = screen.getByText('À compléter :').parentElement;
    if (missing === null) throw new Error('the missing blocks have a line');
    fireEvent.click(within(missing).getByRole('button', { name: 'Réponses types' }));
    expect(tab('Réponses types').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(tab('Détails'));
    fireEvent.click(within(missing).getByRole('button', { name: 'Réponses types' }));
    expect(tab('Réponses types').getAttribute('aria-selected')).toBe('true');
  });

  it('puts a 422 on the reply the agent would not send, until the next edit', async () => {
    const fake = await serve(refusal([{ index: 1, code: 'ai_disclosure' }]));
    render(<PersonaSection creatorId={CREATOR} canSave timezone="Europe/Paris" />);
    await screen.findByRole('progressbar', { name: 'Complétude de la persona' });

    fireEvent.click(tab('Réponses types'));
    fireEvent.change(screen.getByLabelText('Situation de la 1re réponse'), {
      target: { value: 'Il lui demande ce qu’elle fait ce soir' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer une version' }));

    expect((await screen.findByRole('alert')).textContent).toBe('L’agent ne l’enverrait pas : un aveu d’IA.');
    expect(screen.getByText('1 champ à corriger')).toBeDefined();
    expect(within(tab('Réponses types')).getByLabelText('1 à corriger')).toBeDefined();
    expect(fake.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Situation de la 2e réponse'), { target: { value: '' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says a refusal it cannot read as a failed save', async () => {
    await serve(refusal([{ index: 99, code: 'ai_disclosure' }]));
    render(<PersonaSection creatorId={CREATOR} canSave timezone="Europe/Paris" />);
    await screen.findByRole('progressbar', { name: 'Complétude de la persona' });
    fireEvent.click(tab('Mode de vie'));
    fireEvent.change(screen.getByLabelText('Ses projets'), { target: { value: 'Ouvrir un studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer une version' }));
    expect(await screen.findByText(/L’enregistrement n’a pas abouti/u)).toBeDefined();
  });
});
