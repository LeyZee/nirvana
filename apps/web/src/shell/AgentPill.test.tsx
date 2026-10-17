// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentPill } from './AgentPill';

import type { AgentMode } from '@/agent/mode';
import { useAgentMode } from '@/agent/useAgentMode';

/** Stands for the Dashboard control: another reader of the same shared state. */
let switchTo: (mode: AgentMode) => void = () => undefined;
function Switcher(): null {
  switchTo = useAgentMode().setMode;
  return null;
}

async function renderPill(): Promise<HTMLElement> {
  const root = createRootRoute({
    component: (): JSX.Element => (
      <>
        <AgentPill />
        <Switcher />
        <Outlet />
      </>
    ),
  });
  const routes = ['/', '/suivi'].map((path) => createRoute({ getParentRoute: () => root, path }));
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/suivi'] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return screen.findByRole('link');
}

const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

beforeEach(() => {
  // The router restores the scroll on each navigation; jsdom has no layout to scroll.
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AgentPill', () => {
  it('says what the agent does and opens the Dashboard', async () => {
    const pill = await renderPill();
    expect(pill.textContent).toBe('Copilote');
    expect(pill.getAttribute('href')).toBe('/');
    expect(pill.dataset['tone']).toBe('ok');
  });

  it('follows a switch made elsewhere, and never shows a refused Automatique', async () => {
    const pill = await renderPill();
    // The cache tells its readers on the next tick: `act` waits for it.
    await act(async () => {
      switchTo('stop');
      await tick();
    });
    expect(pill.textContent).toBe('Arrêt');
    expect(pill.dataset['tone']).toBe('bad');

    // The sample gate is closed: the switch is refused and the pill keeps the last real mode.
    await act(async () => {
      switchTo('auto');
      await tick();
    });
    expect(pill.textContent).toBe('Arrêt');
  });
});
