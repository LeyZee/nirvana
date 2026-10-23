import { describe, expect, it } from 'vitest';

import { ageLine, centsOf, flagError, flagsSummary, isBlocking, switchDetail } from './flags-model';

describe('the fan’s limits', () => {
  it('folds to one line, and says when there is none', () => {
    expect(flagsSummary({})).toBe('Aucune');
    expect(
      flagsSummary({
        salesFrozen: { reason: 'operator', since: '2026-10-23T10:00:00.000Z' },
        fragile: true,
        spendingLimitMinor: 5000,
      }),
    ).toBe('Ventes gelées · fan fragile · plafond de 50\u00a0€');
  });

  it('is amber only when it stops the agent from writing or selling', () => {
    expect(isBlocking({ fragile: true, noExplicit: true, spendingLimitMinor: 0 })).toBe(false);
    expect(isBlocking({ doNotContact: true })).toBe(true);
    expect(isBlocking({ salesFrozen: { reason: 'distress', since: '2026-10-23T10:00:00.000Z' } })).toBe(true);
  });

  it('says since when and why sales stopped', () => {
    const flags = { salesFrozen: { reason: 'money_trouble' as const, since: '2026-10-23T10:00:00.000Z' } };
    expect(switchDetail(flags, 'salesFrozen')).toBe('Depuis le 23 octobre : il a dit manquer d’argent.');
    expect(switchDetail(flags, 'fragile')).toBeNull();
  });

  it('says whether his age is confirmed', () => {
    expect(ageLine({})).toBe('Pas encore confirmé : rien d’explicite tant qu’il ne l’est pas.');
    expect(ageLine({ ageConfirmedAt: '2026-10-21T10:00:00.000Z' })).toBe('Majeur, confirmé le 21 octobre.');
  });

  it('reads a ceiling typed in euros as cents, and refuses what is not an amount', () => {
    expect(centsOf('50')).toBe(5000);
    expect(centsOf('49,90 €')).toBe(4990);
    expect(centsOf(' 12.5 ')).toBe(1250);
    expect(centsOf('')).toBeNull();
    expect(centsOf('-5')).toBeNull();
    expect(centsOf('12,345')).toBeNull();
    expect(centsOf('cinquante')).toBeNull();
  });

  it('says why a change was refused', () => {
    expect(flagError(404)).toBe('Ce fan n’existe plus.');
    expect(flagError(403)).toBe('Seuls le propriétaire et les chatteurs changent les limites d’un fan.');
    expect(flagError(0)).toBe('Le serveur ne répond pas : rien n’a changé. Réessaie dans un instant.');
  });
});
