// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from './DashboardPage';

/** The shared mode reaches its readers on the next tick. */
const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

beforeEach(() => {
  // What jsdom lacks and the screen uses only for motion and layout.
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDashboard(): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

const headline = (): string => document.querySelector('h1')?.textContent ?? '';

describe('DashboardPage', () => {
  it('shows the sample with its badge, what waits, and a locked Automatique', () => {
    renderDashboard();
    expect(screen.getByText('Exemple')).toBeDefined();
    expect(headline()).toContain('3 choses');
    expect(screen.getByRole('radio', { name: 'Copilote' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Automatique' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('stops the agent after the confirmation, says so first, and resumes in one click', async () => {
    renderDashboard();
    await act(tick);
    fireEvent.click(screen.getByRole('radio', { name: 'Arrêt' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Arrêter l’agent' }));
      await tick();
    });
    expect(screen.getByRole('radio', { name: 'Arrêt' }).getAttribute('aria-checked')).toBe('true');
    expect(headline()).toContain('arrêté');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Repasser en copilote' }));
      await tick();
    });
    expect(screen.getByRole('radio', { name: 'Copilote' }).getAttribute('aria-checked')).toBe('true');
    expect(headline()).toContain('3 choses');
  });

  it('keeps an Arrêt made before the mode is first read', async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('radio', { name: 'Arrêt' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Arrêter l’agent' }));
      await tick();
      await tick();
    });
    expect(screen.getByRole('radio', { name: 'Arrêt' }).getAttribute('aria-checked')).toBe('true');
  });
});
