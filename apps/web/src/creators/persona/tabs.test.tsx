// @vitest-environment jsdom
import type { Persona } from '@nirvana/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import demoYaml from '../../../../../personas/demo/v0.1.0.yaml?raw';
import blocksYaml from '../../../../../personas/demo/v0.2.0.yaml?raw';

import { parsePersonaYaml } from './source';
import { StrategiesTab } from './tabs';

afterEach(() => {
  cleanup();
});

describe('Stratégies › the desire thresholds (P3-12)', () => {
  it('says the band each threshold falls in, and empties to the default', async () => {
    const persona: Persona = await parsePersonaYaml(demoYaml);
    const onChange = vi.fn<(value: Persona['strategies']) => void>();
    render(<StrategiesTab value={persona.strategies} onChange={onChange} issues={[]} />);
    const opening = screen.getByLabelText('Elle ne l’ouvre qu’à partir d’une note de désir de');
    expect(opening).toHaveProperty('value', '45');
    expect(screen.getByText('À partir de 45 : bande joueur.')).toBeDefined();
    expect(screen.getByText('À partir de 75 : bande chaud.')).toBeDefined();

    fireEvent.change(opening, { target: { value: '' } });
    const [emptied] = onChange.mock.lastCall ?? [];
    expect(emptied).toMatchObject({ sexualization: { initiate_after_hours: 36 } });
    expect(JSON.stringify(emptied)).not.toContain('min_desire_to_open');
  });

  it('says Suivi still shows « joueur » when scripts go out under 70, without a warning', async () => {
    const persona: Persona = await parsePersonaYaml(demoYaml);
    const strategies = {
      ...persona.strategies,
      script_launch: { ...persona.strategies.script_launch, min_desire: 60 },
    };
    render(<StrategiesTab value={strategies} onChange={vi.fn()} issues={[]} />);
    const hint = screen.getByText(/À partir de 60 : bande joueur/u);
    expect(hint.textContent).toBe(
      'À partir de 60 : bande joueur. Le Suivi dira encore « joueur » quand les scripts partent.',
    );
    expect(hint.className).toBe('ps-hint');
  });
});

describe('Stratégies › the canvas lines (P5-01)', () => {
  it('adds a line last, keeping the order she chose', async () => {
    const persona: Persona = await parsePersonaYaml(blocksYaml);
    const onChange = vi.fn<(value: Persona['strategies']) => void>();
    render(<StrategiesTab value={persona.strategies} onChange={onChange} issues={[]} />);
    fireEvent.focus(screen.getByRole('combobox', { name: 'Lignes du canevas' }));
    fireEvent.click(screen.getByRole('option', { name: /Envies/u }));
    const [changed] = onChange.mock.lastCall ?? [];
    expect(changed?.kyc.collect).toEqual([
      'first_name',
      'age',
      'location',
      'job',
      'situation',
      'hobbies',
      'desires',
    ]);
  });
});
