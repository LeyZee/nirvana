import { describe, expect, it } from 'vitest';

import { offerDecision, type OfferContext } from '../policy';

const NOW = new Date('2026-10-17T20:00:00Z');
const hoursAgo = (hours: number): Date => new Date(NOW.getTime() - hours * 3_600_000);
const base: OfferContext = {
  now: NOW,
  lastOfferAt: null,
  fanSexualizes: true,
  fanAsksForPaid: false,
  hasNoBudget: false,
  risks: [],
};

describe('offerDecision', () => {
  it('allows a first script to a fan who is getting hot', () => {
    expect(offerDecision(base)).toEqual({ allowed: true });
  });

  it('never opens the sale itself: he has to sexualize', () => {
    expect(offerDecision({ ...base, fanSexualizes: false })).toEqual({
      allowed: false,
      reason: 'not_sexualizing',
    });
  });

  it('waits ten hours between two scripts, then tries again if he sexualizes again', () => {
    expect(offerDecision({ ...base, lastOfferAt: hoursAgo(9.5) })).toEqual({
      allowed: false,
      reason: 'cooldown',
    });
    expect(offerDecision({ ...base, lastOfferAt: hoursAgo(10) })).toEqual({ allowed: true });
    expect(offerDecision({ ...base, lastOfferAt: hoursAgo(12), fanSexualizes: false })).toEqual({
      allowed: false,
      reason: 'not_sexualizing',
    });
  });

  it('reads the cooldown the creator set', () => {
    expect(offerDecision({ ...base, lastOfferAt: hoursAgo(6), limits: { cooldownHours: 5 } })).toEqual({
      allowed: true,
    });
  });

  it('never sells to a fan who said he has no money, or in a risk', () => {
    expect(offerDecision({ ...base, hasNoBudget: true })).toEqual({ allowed: false, reason: 'no_budget' });
    expect(offerDecision({ ...base, risks: ['money_trouble'] })).toEqual({ allowed: false, reason: 'risk' });
    expect(offerDecision({ ...base, risks: ['real_abuse'] })).toEqual({ allowed: false, reason: 'risk' });
    expect(offerDecision({ ...base, risks: ['meet_request'] })).toEqual({ allowed: true });
  });

  it('lifts the cooldown and the no-budget stop when he asks for paid content himself, never a risk', () => {
    const asks = { ...base, fanAsksForPaid: true, fanSexualizes: false };
    expect(offerDecision({ ...asks, lastOfferAt: hoursAgo(1) })).toEqual({ allowed: true });
    expect(offerDecision({ ...asks, hasNoBudget: true })).toEqual({ allowed: true });
    expect(offerDecision({ ...asks, risks: ['money_trouble'] })).toEqual({ allowed: false, reason: 'risk' });
  });
});
