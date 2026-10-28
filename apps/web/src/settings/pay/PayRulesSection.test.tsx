// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PayRulesSection } from './PayRulesSection';

/* Invented creators and accounts (ADR 0010); the rates are examples, not anyone's. */
const id = (n: number): string => `0199f2a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const account = (n: number, creatorName: string, handle: string) => ({
  id: id(10 + n),
  creatorId: id(n),
  creatorName,
  platform: 'reveal',
  handle,
});
const rules = (n: number, accountN: number, fromPeriod: string, patch: Record<string, unknown> = {}) => ({
  id: id(500 + n),
  platformAccountId: id(10 + accountN),
  creatorId: id(accountN),
  fromPeriod,
  currency: 'EUR',
  vatBps: 2_000,
  platformFeeBps: 1_500,
  earningsSource: 'declared',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...patch,
});

let answer: { status: number; body: unknown };
const writes: { path: string; body: unknown }[] = [];

function serve(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      const json = (body: unknown, status = 200) =>
        Promise.resolve(new Response(JSON.stringify(body), { status }));
      if (init?.method === 'POST') {
        writes.push({
          path: url.pathname,
          body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
        });
        return json(answer.body, answer.status);
      }
      if (url.pathname === '/v1/team/pay-rules') {
        return json({
          currentPeriod: '2026-10-16',
          accounts: [
            {
              account: account(1, 'Anna Lys', 'anna'),
              rules: [rules(2, 1, '2026-11-01', { vatBps: 550 }), rules(1, 1, '2026-10-01')],
            },
            { account: account(2, 'Inès Moreau', 'ines'), rules: [] },
          ],
        });
      }
      return json(null, 404);
    }),
  );
}

function renderSection(): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PayRulesSection />
    </QueryClientProvider>,
  );
}

const plain = (text: string | null | undefined): string => (text ?? '').replaceAll(/\s/gu, ' ');

beforeEach(() => {
  writes.length = 0;
  answer = { status: 201, body: rules(9, 2, '2026-10-16') };
  serve();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Réglages › Règles de paie', () => {
  it('puts the account without rules first, then each account’s rules in force and to come', async () => {
    renderSection();
    expect(await screen.findByText('Un compte sans règles de paie')).toBeTruthy();
    const cards = screen.getAllByRole('listitem').filter((item) => item.classList.contains('rp-account'));
    expect(cards.map((card) => within(card).getByText(/Anna Lys|Inès Moreau/u).textContent)).toEqual([
      'Inès Moreau',
      'Anna Lys',
    ]);
    const anna = plain(cards[1]?.textContent);
    expect(anna).toContain('En vigueur');
    expect(anna).toContain('Euros · TVA 20 % · plateforme 15 % · rapports de fin de shift');
    expect(anna).toContain('À venir');
    expect(anna).toContain('TVA 5,5 %');
  });

  it('offers the current period for an account’s first rules, and posts them after a recap', async () => {
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Poser les règles' }));
    const dialog = screen.getByRole('dialog', { name: 'Poser les règles de paie' });
    const from = within(dialog).getByLabelText<HTMLSelectElement>('À partir de la quinzaine');
    expect([...from.options].map((option) => option.value).slice(0, 2)).toEqual(['2026-10-16', '2026-11-01']);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Vérifier' }));
    expect(within(dialog).getAllByText('Un taux entre 0 et 100, comme 20 ou 5,5.')).toHaveLength(2);
    expect(within(dialog).queryByRole('button', { name: 'Poser ces règles' })).toBeNull();
  });

  it('sends nothing until the recap is confirmed, then the rules once', async () => {
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Poser les règles' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('TVA'), { target: { value: '20' } });
    fireEvent.change(within(dialog).getByLabelText('Commission de la plateforme'), {
      target: { value: '12,5' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vérifier' }));

    expect(
      plain(within(dialog).getByText('Commission de la plateforme').nextElementSibling?.textContent),
    ).toBe('12,5 %');
    expect(writes).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Poser ces règles' }));
    await act(() => Promise.resolve());

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      path: '/v1/team/pay-rules',
      body: {
        platformAccountId: id(12),
        fromPeriod: '2026-10-16',
        currency: 'EUR',
        vatBps: 2_000,
        platformFeeBps: 1_250,
        earningsSource: 'declared',
      },
    });
  });

  it('starts new rules of an account from its last ones, never from a period that has begun', async () => {
    answer = {
      status: 409,
      body: {
        error: {
          code: 'pay_rules_period_conflict',
          message: 'x',
          details: { accountPayRulesId: id(502) },
          requestId: 'r',
        },
      },
    };
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelles règles' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouvelles règles de paie' });
    const from = within(dialog).getByLabelText<HTMLSelectElement>('À partir de la quinzaine');
    // 1 November already has rules: the next free periods only.
    expect([...from.options].map((option) => option.value)).toEqual([
      '2026-11-16',
      '2026-12-01',
      '2026-12-16',
    ]);
    expect(within(dialog).getByLabelText<HTMLInputElement>('TVA').value).toBe('5,5');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Vérifier' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Poser ces règles' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Ce compte a déjà des règles à partir de cette quinzaine.',
    );
  });
});
