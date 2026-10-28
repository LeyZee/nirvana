// @vitest-environment jsdom
import type { Persona } from '@nirvana/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import demoYaml from '../../../../../personas/demo/v0.1.0.yaml?raw';
import blocksYaml from '../../../../../personas/demo/v0.2.0.yaml?raw';

import { validate } from './model';
import { parsePersonaYaml } from './source';
import { ageLine, FollowUpsTab, orNull, StrategiesTab } from './tabs';

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

/** The tab as the screen holds it: its own draft, validated on each change. */
function Strategies({ initial }: { initial: Persona }): JSX.Element {
  const [persona, setPersona] = useState(initial);
  return (
    <StrategiesTab
      value={persona.strategies}
      onChange={(strategies) => {
        setPersona({ ...persona, strategies });
      }}
      issues={validate(persona)}
    />
  );
}

describe('recette 28/10', () => {
  it('keeps a block open once its error clears, so the next keys land in the field', async () => {
    render(<Strategies initial={await parsePersonaYaml(blocksYaml)} />);
    const field = screen.getByLabelText('Au plus, en messages');
    const block = field.closest('details');
    if (block === null) throw new Error('the KYC block folds');
    expect(block.open).toBe(false);
    fireEvent.change(field, { target: { value: '' } });
    expect(block.open).toBe(true);
    fireEvent.change(field, { target: { value: '4' } });
    expect(block.open).toBe(true);
    fireEvent.change(field, { target: { value: '40' } });
    expect(screen.getByLabelText('Au plus, en messages')).toHaveProperty('value', '40');
  });

  it('never prints « NaN min » under an emptied duration', async () => {
    render(<Strategies initial={await parsePersonaYaml(blocksYaml)} />);
    fireEvent.change(screen.getByLabelText('Au plus, en temps'), { target: { value: '' } });
    expect(screen.queryByText(/NaN/u)).toBeNull();
  });

  it('switching follow-ups off drops a custom text never written, which would block the save unseen', async () => {
    const persona = await parsePersonaYaml(blocksYaml);
    const onChange = vi.fn<(value: Persona['follow_ups']) => void>();
    const custom = { ...persona.follow_ups, enabled: true, type: 'custom' as const, text: '' };
    render(<FollowUpsTab value={custom} onChange={onChange} issues={[]} />);
    const [toggle] = screen.getAllByRole('switch');
    if (toggle === undefined) throw new Error('follow-ups have their switch');
    fireEvent.click(toggle);
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ enabled: false, type: 'soft', text: null });
  });

  it('refuses a follow-up delay that is not a whole number of hours', async () => {
    const persona = await parsePersonaYaml(blocksYaml);
    render(<FollowUpsTab value={persona.follow_ups} onChange={vi.fn()} issues={[]} />);
    const next = screen.getByLabelText('Nouvelle relance, en heures');
    fireEvent.change(next, { target: { value: '1.5' } });
    expect(screen.getByRole('button', { name: 'Ajouter' })).toHaveProperty('disabled', true);
    fireEvent.change(next, { target: { value: '2' } });
    expect(screen.getByRole('button', { name: 'Ajouter' })).toHaveProperty('disabled', false);
  });

  it('reads a field of spaces only as not given, and an age only for a birth already past', () => {
    expect(orNull('   ')).toBeNull();
    expect(orNull(' Lyon ')).toBe(' Lyon ');
    expect(ageLine('2000-10-28', '2026-10-28')).toBe('26 ans aujourd’hui');
    expect(ageLine('2030-01-01', '2026-10-28')).toBeUndefined();
    expect(ageLine('', '2026-10-28')).toBeUndefined();
  });
});
