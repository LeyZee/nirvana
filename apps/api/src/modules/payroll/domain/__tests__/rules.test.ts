import { DomainError, PayPeriodSchema } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import { assertSetsTeamRules, draftPeriodsFrom, goalPeriods, rulesOpenFor, sameTiers } from '../rules';

import { P1, P2, P3 } from './fixtures';

const P4 = PayPeriodSchema.parse('2025-04-16');

const errorOf = (run: () => unknown): { code: string; message: string } | null => {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return { code: error.code, message: error.message };
    throw error;
  }
  return null;
};

describe('the team’s rules (EQ-04, ADR 0032)', () => {
  it('lets the owner alone set them, an active manager neither', () => {
    expect(
      errorOf(() => {
        assertSetsTeamRules({ scope: 'owner' });
      }),
    ).toBeNull();
    for (const scope of ['agency', 'self'] as const) {
      expect(
        errorOf(() => {
          assertSetsTeamRules({ scope });
        }),
      ).toEqual({
        code: 'payroll_forbidden',
        message: 'Réservé au propriétaire',
      });
    }
  });

  it('reaches only the periods after the team’s last closing', () => {
    expect(rulesOpenFor(null, P1)).toBe(true);
    expect(rulesOpenFor(P2, P3)).toBe(true);
    expect(rulesOpenFor(P2, P2)).toBe(false);
    expect(rulesOpenFor(P2, P1)).toBe(false);
  });

  it('calls the same tiers the same, whatever order jsonb gives their keys back in', () => {
    const bronze = { thresholdMinor: 100_000, bonusMinor: 5_000, label: 'Bronze' };
    const silver = { thresholdMinor: 200_000, bonusMinor: 12_000, label: 'Argent' };
    const read = [
      { label: 'Bronze', bonusMinor: 5_000, thresholdMinor: 100_000 },
      { bonusMinor: 12_000, label: 'Argent', thresholdMinor: 200_000 },
    ];
    expect(sameTiers(read, [bronze, silver])).toBe(true);
    expect(sameTiers([], [])).toBe(true);
    expect(sameTiers(read.slice(0, 1), [bronze, silver])).toBe(false);
    expect(sameTiers([bronze, silver], read.slice(0, 1))).toBe(false);
    expect(sameTiers([...read].reverse(), [bronze, silver])).toBe(false);
    expect(sameTiers(read, [bronze, { ...silver, bonusMinor: 12_001 }])).toBe(false);
    expect(sameTiers(read, [bronze, { ...silver, label: 'argent' }])).toBe(false);
    expect(sameTiers(read, [bronze, { ...silver, extra: 1 }])).toBe(false);
    const renamed = { thresholdMinor: 200_000, bonusMinor: 12_000, name: 'Argent' };
    expect(sameTiers(read, [bronze, renamed])).toBe(false);
  });

  it('recomputes each period holding a draft from the rule’s period on, once, in order', () => {
    expect(draftPeriodsFrom([P3, P1, P3, P4, P2], P2)).toEqual([P2, P3, P4]);
    expect(draftPeriodsFrom([P3, P1, P1], null)).toEqual([P1, P3]);
    expect(draftPeriodsFrom([P1], P2)).toEqual([]);
  });

  it('recomputes a goal’s period once it has begun, a draft or not', () => {
    expect(goalPeriods(P2, P2)).toEqual([P2]);
    expect(goalPeriods(P1, P3)).toEqual([P1]);
    expect(goalPeriods(P3, P2)).toEqual([]);
  });
});
