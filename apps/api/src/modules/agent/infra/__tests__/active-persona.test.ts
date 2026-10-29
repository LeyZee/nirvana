import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PersonaSchema, type Persona } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { startFollowUpPlan } from '../../index';
import { activePersonaForModels, type ActivePersonaSource } from '../active-persona';

/** The fictional demo persona of the repository (ADR 0010: never a real one in a test). */
const DEMO: Persona = PersonaSchema.parse(
  parse(
    readFileSync(
      fileURLToPath(new URL('../../../../../../../personas/demo/v0.2.0.yaml', import.meta.url)),
      'utf8',
    ),
  ),
);
const NOW = new Date('2026-10-29T10:00:00Z');

const sourceOf =
  (persona: Persona | null): ActivePersonaSource =>
  () =>
    Promise.resolve(persona === null ? null : { id: 'version-2', creatorName: 'Nora', persona });

describe('activePersonaForModels (recette G4)', () => {
  it('reads her active version for the models, her stored name standing in for a placeholder', async () => {
    const read = await activePersonaForModels(sourceOf(DEMO), 'creator-1', NOW);
    expect(read?.creatorName).toBe(DEMO.details.first_name);
    expect(read?.followUps.delaysHours).toEqual([12, 24]);

    const unnamed = { ...DEMO, details: { ...DEMO.details, first_name: '<à remplir>' } };
    expect((await activePersonaForModels(sourceOf(unnamed), 'creator-1', NOW))?.creatorName).toBe('Nora');
  });

  it('gives nothing without an active version, and lets a failed read through', async () => {
    expect(await activePersonaForModels(sourceOf(null), 'creator-1', NOW)).toBeNull();
    await expect(
      activePersonaForModels(() => Promise.reject(new Error('unreadable')), 'creator-1', NOW),
    ).rejects.toThrow('unreadable');
  });
});

describe('startFollowUpPlan', () => {
  it('reads her delays from her active version at each call, none without one or with them off', async () => {
    let active: Persona | null = DEMO;
    const plan = startFollowUpPlan({ activePersona: () => sourceOf(active)('creator-1'), now: () => NOW });
    expect(await plan.delaysHours('creator-1')).toEqual([12, 24]);
    active = { ...DEMO, follow_ups: { ...DEMO.follow_ups, enabled: false } };
    expect(await plan.delaysHours('creator-1')).toEqual([]);
    active = null;
    expect(await plan.delaysHours('creator-1')).toEqual([]);
  });
});
