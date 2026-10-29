// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppearancePage } from './AppearancePage';

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Réglages › Apparence', () => {
  it('does not repeat the tab’s name as a title', () => {
    render(<AppearancePage />);
    expect(screen.queryByRole('heading', { name: 'Apparence' })).toBeNull();
  });

  it('is one stop in the Tab order, and the arrows move and pick, as a radio group does', () => {
    render(<AppearancePage />);
    const radio = (name: string): HTMLElement => screen.getByRole('radio', { name });
    expect([radio('Nuit'), radio('Jour'), radio('Appareil')].map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    radio('Nuit').focus();
    fireEvent.keyDown(radio('Nuit'), { key: 'ArrowRight' });
    expect(radio('Jour').getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(radio('Jour'));
    expect(radio('Jour').tabIndex).toBe(0);
    fireEvent.keyDown(radio('Jour'), { key: 'ArrowLeft' });
    fireEvent.keyDown(radio('Nuit'), { key: 'ArrowLeft' });
    expect(radio('Appareil').getAttribute('aria-checked')).toBe('true');
  });
});
