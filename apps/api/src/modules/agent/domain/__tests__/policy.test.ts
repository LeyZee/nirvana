import { describe, expect, it } from 'vitest';

import { offerDecision, type OfferContext, type PastOffer } from '../policy';

const NOW = new Date('2026-10-17T20:00:00Z'); // 22:00 in Paris
const at = (iso: string): Date => new Date(iso);
const base: OfferContext = { now: NOW, timeZone: 'Europe/Paris', offers: [], hasNoBudget: false, risks: [] };
const offer = (iso: string, outcome: PastOffer['outcome']): PastOffer => ({ at: at(iso), outcome });

describe('offerDecision', () => {
  it('allows a first offer to a warm fan', () => {
    expect(offerDecision(base)).toEqual({ allowed: true });
  });

  it('never sells to a fan who said he has no money, or in a risk', () => {
    expect(offerDecision({ ...base, hasNoBudget: true })).toEqual({ allowed: false, reason: 'no_budget' });
    expect(offerDecision({ ...base, risks: ['money_trouble'] })).toEqual({ allowed: false, reason: 'risk' });
    expect(offerDecision({ ...base, risks: ['real_abuse'] })).toEqual({ allowed: false, reason: 'risk' });
    expect(offerDecision({ ...base, risks: ['meet_request'] })).toEqual({ allowed: true });
  });

  it('stops for the day after a refusal, and starts again the next day', () => {
    const refused = [offer('2026-10-17T19:00:00Z', 'refused')];
    expect(offerDecision({ ...base, offers: refused })).toEqual({ allowed: false, reason: 'refused_today' });
    expect(offerDecision({ ...base, offers: refused, now: at('2026-10-18T09:00:00Z') })).toEqual({
      allowed: true,
    });
  });

  it('counts the day on her clock: 23:30 and 00:30 in Paris are two days', () => {
    const late = [offer('2026-10-17T21:30:00Z', 'refused')]; // 23:30 in Paris
    expect(offerDecision({ ...base, offers: late, now: at('2026-10-17T22:30:00Z') })).toEqual({
      allowed: true,
    });
  });

  it('makes three offers a day at most, purchases included', () => {
    const three = [
      offer('2026-10-17T18:00:00Z', 'purchased'),
      offer('2026-10-17T18:30:00Z', 'purchased'),
      offer('2026-10-17T19:00:00Z', 'pending'),
    ];
    expect(offerDecision({ ...base, offers: three })).toEqual({ allowed: false, reason: 'daily_limit' });
    expect(offerDecision({ ...base, offers: three.slice(0, 2) })).toEqual({ allowed: true });
  });

  it('stops after five offers without a purchase, and a purchase starts the count again', () => {
    const days = ['10', '11', '12', '13', '14'].map((d) => offer(`2026-10-${d}T19:00:00Z`, 'pending'));
    expect(offerDecision({ ...base, offers: days })).toEqual({
      allowed: false,
      reason: 'too_many_without_purchase',
    });
    const bought = [
      ...days.slice(0, 4),
      offer('2026-10-15T19:00:00Z', 'purchased'),
      offer('2026-10-16T19:00:00Z', 'pending'),
    ];
    expect(offerDecision({ ...base, offers: bought })).toEqual({ allowed: true });
  });

  it('reads the limits it is given', () => {
    const one = [offer('2026-10-17T18:00:00Z', 'purchased')];
    expect(offerDecision({ ...base, offers: one, limits: { maxPerDay: 1, maxWithoutPurchase: 5 } })).toEqual({
      allowed: false,
      reason: 'daily_limit',
    });
  });
});
