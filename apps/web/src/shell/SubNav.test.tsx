// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { act, useState, type JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SubNav, type SubNavItem } from './layout';

const placeTabBarLens = vi.fn();
vi.mock('@nirvana/design-system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nirvana/design-system')>()),
  placeTabBarLens: (...args: unknown[]) => {
    placeTabBarLens(...args);
  },
}));

let setItems: (items: readonly SubNavItem[]) => void = () => undefined;

function renderNav(first: readonly SubNavItem[]): void {
  const root = createRootRoute();
  const page = createRoute({
    getParentRoute: () => root,
    path: '/paie/quinzaine',
    component: function Page() {
      return <Nav first={first} />;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/paie/quinzaine'] }),
  });
  render(<RouterProvider router={router} />);
}

function Nav({ first }: { first: readonly SubNavItem[] }): JSX.Element {
  const [items, set] = useState(first);
  setItems = set;
  return <SubNav items={items} label="Paie" />;
}

beforeEach(() => {
  placeTabBarLens.mockClear();
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

describe('SubNav', () => {
  it('moves its thumb again when a count arrives and widens a tab', async () => {
    const releves: SubNavItem = { to: '/paie/releves', label: 'Relevés' };
    renderNav([{ to: '/paie/quinzaine', label: 'Quinzaine' }, releves]);
    await screen.findByRole('link', { name: 'Quinzaine' });
    const before = placeTabBarLens.mock.calls.length;
    expect(before).toBeGreaterThan(0);
    act(() => {
      setItems([{ to: '/paie/quinzaine', label: 'Quinzaine', count: 4 }, releves]);
    });
    expect(screen.getByText('4').className).toBe('nv-subnav__count');
    expect(placeTabBarLens.mock.calls.length).toBeGreaterThan(before);
  });
});
