import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { ageOn, PERSONA_OPTIONS, PersonaSchema, type Persona } from './persona';

const personaFile = (path: string): unknown =>
  parse(readFileSync(fileURLToPath(new URL(`../../../personas/${path}`, import.meta.url)), 'utf8'));

const demo = (): Persona => PersonaSchema.parse(personaFile('demo/v0.1.0.yaml'));

/** Applies a change to a fresh copy of the demo persona and validates the result. */
const withChange = (change: (p: Persona) => void) => {
  const p = structuredClone(demo());
  change(p);
  return PersonaSchema.safeParse(p);
};

const issuePaths = (result: ReturnType<typeof withChange>) =>
  result.success ? [] : result.error.issues.map((i) => i.path.join('.'));

describe('PersonaSchema', () => {
  it('accepts the placeholder and the fictional demo persona', () => {
    expect(PersonaSchema.safeParse(personaFile('messalina/v0.0.0.yaml')).success).toBe(true);
    expect(demo().details.first_name).toBe('Elena');
  });

  it('reads a persona with or without the deprecated gender', () => {
    const { gender, ...details } = demo().details;
    expect(gender).toBe('female');
    expect(PersonaSchema.safeParse({ ...demo(), details }).success).toBe(true);
  });

  it('rejects unknown keys, so a typo never passes silently', () => {
    const result = PersonaSchema.safeParse({ ...demo(), stlye: {} });
    expect(result.success).toBe(false);
  });

  it('only takes values from the choice lists', () => {
    expect(issuePaths(withChange((p) => Object.assign(p.details, { eyes: 'violet' })))).toEqual([
      'details.eyes',
    ]);
    expect(issuePaths(withChange((p) => Object.assign(p.details, { bra: { band: 77, cup: 'C' } })))).toEqual([
      'details.bra.band',
    ]);
    expect(issuePaths(withChange((p) => Object.assign(p.details, { languages: [] })))).toEqual([
      'details.languages',
    ]);
    expect(
      issuePaths(withChange((p) => Object.assign(p.details, { languages: ['french', 'french'] }))),
    ).toEqual(['details.languages']);
  });

  it('keeps each number inside its OnlyChat bounds', () => {
    expect(issuePaths(withChange((p) => (p.details.height_cm = 139)))).toEqual(['details.height_cm']);
    expect(issuePaths(withChange((p) => (p.strategies.sexualization.initiate_after_hours = 169)))).toEqual([
      'strategies.sexualization.initiate_after_hours',
    ]);
    expect(issuePaths(withChange((p) => (p.strategies.kyc.min_hours_before_following = -1)))).toEqual([
      'strategies.kyc.min_hours_before_following',
    ]);
    expect(issuePaths(withChange((p) => (p.strategies.script_launch.cooldown_hours = 25)))).toEqual([
      'strategies.script_launch.cooldown_hours',
    ]);
    expect(issuePaths(withChange((p) => (p.behavior.response_delay_minutes = 1.5)))).toEqual([
      'behavior.response_delay_minutes',
    ]);
  });

  it('asks for instructions exactly when a strategy is custom', () => {
    expect(issuePaths(withChange((p) => (p.strategies.post_offer.style = 'custom')))).toEqual([
      'strategies.post_offer.instructions',
    ]);
    expect(issuePaths(withChange((p) => (p.strategies.kyc.instructions = null)))).toEqual([
      'strategies.kyc.instructions',
    ]);
    expect(issuePaths(withChange((p) => (p.follow_ups.type = 'custom')))).toEqual(['follow_ups.text']);
  });

  it('wants follow-up delays strictly increasing', () => {
    expect(issuePaths(withChange((p) => (p.follow_ups.delays_hours = [24, 12])))).toEqual([
      'follow_ups.delays_hours',
    ]);
    expect(withChange((p) => (p.follow_ups.delays_hours = [])).success).toBe(true);
  });

  it('has no price negotiation setting: the price is never negotiated', () => {
    expect(
      PersonaSchema.safeParse({ ...demo(), strategies: { ...demo().strategies, negotiation: {} } }).success,
    ).toBe(false);
  });

  it('refuses duplicate entries whatever their case', () => {
    expect(issuePaths(withChange((p) => p.notifications.alert_keywords.push('bot')))).toEqual([
      'notifications.alert_keywords',
    ]);
    expect(issuePaths(withChange((p) => p.details.hobbies.push('  ')))).toEqual(['details.hobbies.5']);
  });

  it('caps additional info at 6 000 characters, like OnlyChat', () => {
    expect(withChange((p) => (p.additional_info = 'a'.repeat(6000))).success).toBe(true);
    expect(issuePaths(withChange((p) => (p.additional_info = 'a'.repeat(6001))))).toEqual([
      'additional_info',
    ]);
  });

  it('refuses a creator under 18 on the date of the version', () => {
    expect(issuePaths(withChange((p) => (p.details.date_of_birth = '2008-10-18')))).toEqual([
      'details.date_of_birth',
    ]);
    expect(withChange((p) => (p.details.date_of_birth = '2008-10-17')).success).toBe(true);
  });

  it('refuses an unknown time zone', () => {
    expect(issuePaths(withChange((p) => (p.details.timezone = 'Europe/Atlantis')))).toEqual([
      'details.timezone',
    ]);
    expect(issuePaths(withChange((p) => (p.details.timezone = 'UTC')))).toEqual(['details.timezone']);
  });
});

describe('ageOn', () => {
  it('counts whole years, the birthday itself included', () => {
    expect(ageOn('2001-04-12', '2026-04-11')).toBe(24);
    expect(ageOn('2001-04-12', '2026-04-12')).toBe(25);
    expect(ageOn('2000-02-29', '2026-02-28')).toBe(25);
    expect(ageOn('2000-02-29', '2026-03-01')).toBe(26);
  });

  it('refuses anything but an ISO date', () => {
    expect(() => ageOn('12/04/2001', '2026-10-17')).toThrow(RangeError);
  });
});

describe('PERSONA_OPTIONS', () => {
  it('labels every value of every list in French, once', () => {
    for (const list of Object.values(PERSONA_OPTIONS)) {
      const values = list.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
      expect(list.every((o) => o.label.length > 0)).toBe(true);
    }
    expect(PERSONA_OPTIONS.band.map((o) => o.value)).toEqual([65, 70, 75, 80, 85, 90, 95, 100, 105]);
  });
});
