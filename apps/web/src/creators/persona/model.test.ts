import { PERSONA_OPTIONS, type Persona } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import demoYaml from '../../../../../personas/demo/v0.1.0.yaml?raw';
import exampleYaml from '../../../../../personas/messalina/v0.0.0.yaml?raw';

import {
  followUpsSummary,
  issueCountByTab,
  issuesOf,
  isPlaceholder,
  changedFields,
  hasChange,
  minutesLabel,
  nudgesSummary,
  physiqueSummary,
  strategySummaries,
  TABS,
  validate,
  localTime,
  matchOptions,
  nextVersion,
  togglePick,
} from './model';
import { parsePersonaYaml } from './source';

const example = (): Promise<Persona> => parsePersonaYaml(exampleYaml);
const demo = (): Promise<Persona> => parsePersonaYaml(demoYaml);

describe('Persona screen rules', () => {
  it('follows the tabs of OnlyChat, plus the limits, and never a negotiation', () => {
    expect(TABS.map((tab) => tab.label)).toEqual([
      'Détails',
      'Infos en plus',
      'Comportement',
      'Stratégies',
      'Relances',
      'Notifications',
      'Limites',
    ]);
    expect(JSON.stringify(TABS).toLowerCase()).not.toContain('négociation');
  });

  it('loads the example of the repository, which passes the schema', async () => {
    const persona = await example();
    expect(persona.meta.version).toBe('0.0.0');
    expect(validate(persona)).toEqual([]);
  });

  it('refuses a file that does not pass the schema', async () => {
    await expect(parsePersonaYaml('meta: { schema: 1 }')).rejects.toThrow();
  });

  it('names each problem in French, at its field, and counts it in its tab', async () => {
    const persona = await example();
    const draft: Persona = {
      ...persona,
      details: { ...persona.details, first_name: '', hobbies: ['Danse', 'danse'] },
      strategies: {
        ...persona.strategies,
        kyc: { ...persona.strategies.kyc, max_messages: 900 },
        sexualization: { ...persona.strategies.sexualization, initiate_after_hours: Number.NaN },
      },
    };
    const issues = validate(draft);
    expect(issuesOf(issues, 'details.first_name')).toEqual([
      { field: 'details.first_name', message: 'À remplir' },
    ]);
    expect(issuesOf(issues, 'details.hobbies')[0]?.message).toBe('Entrée en double');
    expect(issuesOf(issues, 'strategies.kyc.max_messages')[0]?.message).toBe('500 au plus');
    expect(issuesOf(issues, 'strategies.sexualization.initiate_after_hours')[0]?.message).toBe(
      'Nombre entier attendu',
    );
    const counts = issueCountByTab(issues);
    expect(counts.details).toBe(2);
    expect(counts.strategies).toBe(2);
    expect(counts.limits).toBe(0);
  });

  it('asks for the instructions of a custom strategy, and only then', async () => {
    const persona = await example();
    const custom = (instructions: string | null): Persona => ({
      ...persona,
      strategies: {
        ...persona.strategies,
        kyc: { ...persona.strategies.kyc, style: 'custom', instructions },
      },
    });
    expect(issuesOf(validate(custom('')), 'strategies.kyc.instructions')[0]?.message).toBe('À remplir');
    expect(validate(custom('Pose une question à chaque message'))).toEqual([]);
    expect(issuesOf(validate(custom(null)), 'strategies.kyc.instructions')).toHaveLength(1);
  });

  it('refuses a creator under 18 on the date of the version', async () => {
    const persona = await example();
    const young = { ...persona, details: { ...persona.details, date_of_birth: '2010-01-01' } };
    expect(issuesOf(validate(young), 'details.date_of_birth')[0]?.message).toContain('18 ans');
  });

  it('writes the summary lines of the folded blocks, in hours where the schema counts hours', async () => {
    const persona = await demo();
    expect(physiqueSummary(persona.details)).toBe('165 cm · pointure 38 · cheveux noirs · yeux verts · 75C');
    const placeholder = await example();
    expect(physiqueSummary(placeholder.details)).toBe('Rien de renseigné');
    expect(strategySummaries(placeholder.strategies)).toEqual({
      kyc: 'Par défaut · 100 messages, 6 h au plus · le suit s’il chauffe après 1 h',
      sexualization: 'Par défaut · ouvre après 24 h',
      script_launch: 'Normal · au moins 10 h entre deux scripts',
      post_offer: 'Par défaut · relance après 7 jours',
    });
    expect(followUpsSummary(placeholder.follow_ups)).toBe('12 h, 23 h après son dernier message');
    expect(followUpsSummary({ ...placeholder.follow_ups, enabled: false })).toBe('Désactivées');
    expect(nudgesSummary(placeholder.follow_ups.nudges)).toBe('Désactivés');
    expect(nudgesSummary({ ...placeholder.follow_ups.nudges, enabled: true })).toBe(
      '3 rappels par jour au plus, 5 min après',
    );
  });

  it('writes minutes the way people say them', () => {
    expect(minutesLabel(45)).toBe('45 min');
    expect(minutesLabel(360)).toBe('6 h');
    expect(minutesLabel(90)).toBe('1 h 30');
    expect(minutesLabel(1445)).toBe('24 h 05');
  });

  it('tells a placeholder of the example from a real value', () => {
    expect(isPlaceholder('<à remplir>')).toBe(true);
    expect(isPlaceholder(" <à remplir : ce qu'elle refuse de faire> ")).toBe(true);
    expect(isPlaceholder('Chaton')).toBe(false);
    expect(isPlaceholder('<3 toi')).toBe(false);
  });

  it('lists the fields a draft changed, a list counting as one field', async () => {
    const persona = await example();
    expect(changedFields(persona, { ...persona })).toEqual([]);
    const changed = changedFields(persona, {
      ...persona,
      additional_info: 'Autre',
      details: { ...persona.details, hobbies: ['Danse', 'Lecture'] },
      strategies: { ...persona.strategies, kyc: { ...persona.strategies.kyc, max_messages: 80 } },
    });
    expect(changed).toEqual(['details.hobbies', 'additional_info', 'strategies.kyc.max_messages']);
    expect(hasChange(changed, 'strategies')).toBe(true);
    expect(hasChange(changed, 'strategies.kyc.max_messages')).toBe(true);
    expect(hasChange(changed, 'follow_ups')).toBe(false);
    expect(hasChange(changed, 'details.hob')).toBe(false);
  });

  it('finds languages as typed and keeps picks in the list order', () => {
    const languages = PERSONA_OPTIONS.languages;
    expect(matchOptions(languages, ' neer').map((o) => o.value)).toEqual(['dutch']);
    expect(matchOptions(languages, 'ESP').map((o) => o.value)).toEqual(['spanish']);
    expect(matchOptions(languages, '')).toHaveLength(languages.length);
    expect(togglePick(languages, ['italian'], 'french')).toEqual(['french', 'italian']);
    expect(togglePick(languages, ['french', 'italian'], 'french')).toEqual(['italian']);
  });

  it('tells the time in her zone, nothing for an unknown zone', () => {
    const at = new Date('2026-10-17T20:25:00Z');
    expect(localTime('Europe/Paris', at)).toBe('22 h 25');
    expect(localTime('Nowhere/Zone', at)).toBe('');
  });

  it('numbers the next version one patch above the highest taken', () => {
    expect(nextVersion(['0.0.0'])).toBe('0.0.1');
    expect(nextVersion(['0.1.2', '0.0.9', '0.1.10'])).toBe('0.1.11');
    expect(nextVersion(['1.0.0', '0.9.9'])).toBe('1.0.1');
  });
});
