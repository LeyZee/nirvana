// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModeControl } from './ModeControl';
import { useFloatingTip } from './parts';

import type { AgentMode, AutomaticGate } from '@/agent/mode';

const CLOSED: AutomaticGate = {
  open: false,
  missing: [{ kind: 'live_rate', value: 64, target: 80 }, { kind: 'blind_test' }],
};
const OPEN: AutomaticGate = { open: true, missing: [] };

function Harness(props: {
  mode: AgentMode;
  automatic: AutomaticGate;
  onChange: (mode: AgentMode) => void;
}): JSX.Element {
  const tip = useFloatingTip();
  return (
    <>
      <ModeControl {...props} creatorName="Léa" tip={tip} />
      {tip.element}
    </>
  );
}

function setup(mode: AgentMode, automatic: AutomaticGate) {
  const onChange = vi.fn<(mode: AgentMode) => void>();
  render(<Harness mode={mode} automatic={automatic} onChange={onChange} />);
  return { onChange, option: (name: string) => screen.getByRole('radio', { name }) };
}

const dialog = (): HTMLElement => screen.getByRole('dialog', { hidden: true });

afterEach(cleanup);

describe('ModeControl', () => {
  it('keeps a closed Automatique out of reach and says what is missing', () => {
    const { onChange, option } = setup('copilot', CLOSED);
    const auto = option('Automatique');
    expect(auto.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(auto);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.focus(auto);
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toContain('Automatique : verrouillé');
    expect(tip.textContent).toContain('64 % sur 80 %');
    expect(tip.textContent).toContain('pas encore validé');
  });

  it('opens Automatique when the server says so', () => {
    const { onChange, option } = setup('copilot', OPEN);
    expect(option('Automatique').getAttribute('aria-disabled')).toBe('false');
    fireEvent.click(option('Automatique'));
    expect(onChange).toHaveBeenCalledWith('auto');
  });

  it('asks before stopping, and Annuler or Escape changes nothing', () => {
    const { onChange, option } = setup('copilot', CLOSED);
    expect(dialog().getAttribute('aria-hidden')).toBe('true');

    fireEvent.click(option('Arrêt'));
    expect(dialog().getAttribute('aria-hidden')).toBe('false');
    expect(dialog().textContent).toContain('au nom de Léa');
    expect(document.activeElement?.textContent).toBe('Annuler');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(dialog().getAttribute('aria-hidden')).toBe('true');

    fireEvent.click(option('Arrêt'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dialog().getAttribute('aria-hidden')).toBe('true');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(option('Arrêt'));
    fireEvent.click(screen.getByRole('button', { name: 'Arrêter l’agent' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('stop');
  });

  it('gives the focus back to the option checked once the dialog closes', () => {
    const { option } = setup('copilot', CLOSED);
    fireEvent.click(option('Arrêt'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).toBe(option('Copilote'));

    fireEvent.click(option('Arrêt'));
    fireEvent.click(screen.getByRole('button', { name: 'Arrêter l’agent' }));
    // The parent has not re-rendered with the new mode yet: the focus already aims at Arrêt.
    expect(document.activeElement).toBe(option('Arrêt'));
  });

  it('moves with the arrow keys, skipping a closed Automatique', () => {
    const { onChange, option } = setup('copilot', CLOSED);
    expect(option('Copilote').tabIndex).toBe(0);
    expect(option('Arrêt').tabIndex).toBe(-1);

    // Left from Copilote wraps past the locked Automatique to Arrêt, which still asks first: the dialog takes
    // the focus, on Annuler.
    fireEvent.keyDown(option('Copilote'), { key: 'ArrowLeft' });
    expect(dialog().getAttribute('aria-hidden')).toBe('false');
    expect(document.activeElement?.textContent).toBe('Annuler');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reaches an open Automatique with the arrow keys', () => {
    const { onChange, option } = setup('copilot', OPEN);
    fireEvent.keyDown(option('Copilote'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(option('Automatique'));
    expect(onChange).toHaveBeenCalledWith('auto');
  });
});
