// @vitest-environment jsdom
import type { PlaygroundState } from '@nirvana/contracts';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RateBar } from './RateBar';

const STATE: PlaygroundState = {
  presets: [],
  presetId: null,
  situation: {
    now: '2026-10-17T21:40:00.000Z',
    timeZone: 'Europe/Paris',
    relationshipStartedAt: '2026-10-17T21:40:00.000Z',
    spentCents: 0,
    isNight: true,
  },
  fanNotes: [],
  history: [],
  rate: { rate: null, rated: 0, validated: 0, target: 0.8, trendPoints: null, previousVersion: null },
  version: { voicePrompt: '1.4.0', voiceModel: 'grok-4.7' },
  rejectReasons: [],
  sessionCostEur: 1.5,
  voice: { reachable: true },
  pending: null,
};

/** Where the bar's router is, once a test has rendered it. */
let location = (): string => '';

function renderBar(state: PlaygroundState): void {
  // « Clé manquante » links to Réglages: the bar needs a router around it.
  const root = createRootRoute();
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/',
        component: () => <RateBar state={state} isDemo={false} />,
      }),
      createRoute({ getParentRoute: () => root, path: '/reglages/modeles-ia' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  location = () => router.state.location.href;
  render(<RouterProvider router={router} />);
}

describe('RateBar', () => {
  afterEach(cleanup);

  it('names the voice and says what the session cost in euros', async () => {
    renderBar(STATE);
    expect(
      await screen.findByText((_, element) => element?.textContent === '1,50\u00a0€ cette session'),
    ).toBeTruthy();
    expect(screen.queryByText('Clé manquante')).toBeNull();
  });

  it('says before the first message that no key reaches the voice, and leads to its settings', async () => {
    renderBar({ ...STATE, voice: { reachable: false } });
    const key = await screen.findByText('Clé manquante');
    // No model and no amount: nothing suggests a voice ready to write.
    expect(screen.queryByText(/grok-4\.7/)).toBeNull();
    expect(screen.queryByText(/cette session/)).toBeNull();
    fireEvent.click(key);
    await waitFor(() => {
      expect(location()).toBe('/reglages/modeles-ia');
    });
  });
});
