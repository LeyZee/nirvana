import { describe, expect, it } from 'vitest';

import { maySulk, offerableScripts, offerDecision, type OfferContext } from '../policy';

const NOW = new Date('2026-10-17T20:00:00Z');
const hoursAgo = (hours: number): Date => new Date(NOW.getTime() - hours * 3_600_000);
const base: OfferContext = {
  now: NOW,
  lastOfferAt: null,
  fanSexualizes: true,
  fanAsksForPaid: false,
  hasNoBudget: false,
  risks: [],
  flags: { ageConfirmedAt: '2026-10-01T10:00:00Z' },
  limits: { cooldownHours: 10 },
};

describe('offerDecision', () => {
  it('reads his limits before anything, even when he asks for paid content', () => {
    const asks = { ...base, fanAsksForPaid: true };
    expect(offerDecision({ ...asks, flags: { ...base.flags, doNotContact: true } })).toEqual({
      allowed: false,
      reason: 'do_not_contact',
    });
    expect(
      offerDecision({
        ...asks,
        flags: { ...base.flags, salesFrozen: { reason: 'spending_limit', since: '2026-10-10T10:00:00Z' } },
      }),
    ).toEqual({ allowed: false, reason: 'sales_frozen' });
    expect(offerDecision({ ...asks, flags: {} })).toEqual({ allowed: false, reason: 'age_unconfirmed' });
  });

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

describe('offerable scripts', () => {
  it('never offers again a script he refused, even days later', () => {
    const scripts = [{ id: 'douche' }, { id: 'lingerie' }, { id: 'reveil' }];
    expect(offerableScripts(scripts, new Set(['lingerie'])).map((s) => s.id)).toEqual(['douche', 'reveil']);
    expect(offerableScripts(scripts, new Set())).toHaveLength(3);
  });
});

describe('maySulk', () => {
  it('never sulks with sales frozen, a fragile fan or one not to write to', () => {
    expect(maySulk({})).toBe(true);
    expect(maySulk({ fragile: true })).toBe(false);
    expect(maySulk({ doNotContact: true })).toBe(false);
    expect(maySulk({ salesFrozen: { reason: 'distress', since: '2026-10-10T10:00:00Z' } })).toBe(false);
  });
});
