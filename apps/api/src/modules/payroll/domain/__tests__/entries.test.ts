import { DomainError, newId, PayPeriodSchema, TeamMemberIdSchema } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import {
  adjustmentPeriod,
  assertWritesPayOf,
  closedUpTo,
  isOpenFor,
  penaltyCancelledFrom,
  periodsChanged,
  periodsToLock,
  type MemberPayFacts,
} from '../entries';

import { P1, P2, P3 } from './fixtures';

const P0 = PayPeriodSchema.parse('2025-02-16');
const P4 = PayPeriodSchema.parse('2025-04-16');
const P5 = PayPeriodSchema.parse('2025-05-01');

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'not a domain error';
  }
  return 'no error';
};

const facts = (patch: Partial<MemberPayFacts>): MemberPayFacts => ({
  lastValidated: null,
  firstClosed: null,
  lastClosed: null,
  earliestOpenDraft: null,
  joinedOn: '2025-01-01',
  current: P5,
  ...patch,
});

describe('the periods open for a member (EQ-04, as pay_period_closed reads them)', () => {
  it('closes up to their last validated statement, and everything before the team’s first closing', () => {
    expect(closedUpTo({ lastValidated: null, firstClosed: null })).toBeNull();
    expect(closedUpTo({ lastValidated: null, firstClosed: P2 })).toBe(P1);
    expect(closedUpTo({ lastValidated: P3, firstClosed: P2 })).toBe(P3);
    expect(isOpenFor({ lastValidated: P2, firstClosed: P1 }, P2)).toBe(false);
    expect(isOpenFor({ lastValidated: P2, firstClosed: P1 }, P3)).toBe(true);
    expect(isOpenFor({ lastValidated: null, firstClosed: P2 }, P1)).toBe(false);
    expect(isOpenFor({ lastValidated: null, firstClosed: null }, P0)).toBe(true);
  });
});

describe('who writes a member’s pay (ADR 0023 § Paie)', () => {
  const theo = newId(TeamMemberIdSchema);
  const manager = newId(TeamMemberIdSchema);

  it('lets the owner or an active manager write it, never for themselves nor as a plain member', () => {
    const writes = (reader: Parameters<typeof assertWritesPayOf>[0]) =>
      codeOf(() => {
        assertWritesPayOf(reader, theo);
      });
    expect(writes({ scope: 'owner', memberId: null })).toBe('no error');
    expect(writes({ scope: 'agency', memberId: manager })).toBe('no error');
    expect(writes({ scope: 'agency', memberId: theo })).toBe('payroll_own_forbidden');
    expect(writes({ scope: 'self', memberId: manager })).toBe('payroll_forbidden');
  });
});

describe('the period an adjustment goes to', () => {
  it('goes to the member’s earliest open draft, or else the team’s first open period', () => {
    expect(
      adjustmentPeriod(facts({ lastValidated: P1, firstClosed: P1, lastClosed: P3, earliestOpenDraft: P2 })),
    ).toBe(P2);
    expect(adjustmentPeriod(facts({ lastValidated: P1, firstClosed: P1, lastClosed: P3 }))).toBe(P4);
    // A draft after the team's first open period: the earlier one is where their next statement is.
    expect(adjustmentPeriod(facts({ firstClosed: P1, lastClosed: P2, earliestOpenDraft: P4 }))).toBe(P3);
  });

  it('goes to today’s period before any closing, unless an open draft is earlier', () => {
    expect(adjustmentPeriod(facts({}))).toBe(P5);
    expect(adjustmentPeriod(facts({ earliestOpenDraft: P2 }))).toBe(P2);
  });

  it('never goes to a period closed for the member nor one before they joined', () => {
    expect(adjustmentPeriod(facts({ lastValidated: P3, firstClosed: P1, lastClosed: P2 }))).toBe(P4);
    expect(adjustmentPeriod(facts({ firstClosed: P1, lastClosed: P1, joinedOn: '2025-04-20' }))).toBe(P4);
  });
});

describe('where a penalty’s cancellation starts', () => {
  const penalty = { fromPeriod: P1, toPeriod: P4 };

  it('cancels it whole while nothing is closed for the member', () => {
    expect(penaltyCancelledFrom(penalty, { lastValidated: null, firstClosed: null })).toBe(P1);
    expect(penaltyCancelledFrom(penalty, { lastValidated: null, firstClosed: P1 })).toBe(P1);
  });

  it('keeps it in the periods already validated, from the member’s first open one on', () => {
    expect(penaltyCancelledFrom(penalty, { lastValidated: P2, firstClosed: P1 })).toBe(P3);
    expect(penaltyCancelledFrom(penalty, { lastValidated: null, firstClosed: P3 })).toBe(P3);
  });

  it('refuses when every period it covers is closed', () => {
    expect(codeOf(() => penaltyCancelledFrom(penalty, { lastValidated: P4, firstClosed: P1 }))).toBe(
      'penalty_cancel_conflict',
    );
  });
});

describe('what a write locks and computes again (ADR 0035)', () => {
  it('locks its period and every later one up to today’s, in order', () => {
    expect(periodsToLock(P2, P5)).toEqual([P2, P3, P4, P5]);
    expect(periodsToLock(P5, P5)).toEqual([P5]);
    // A period that has not started: nothing validates it or a later one now.
    expect(periodsToLock(P5, P2)).toEqual([P5]);
  });

  it('computes again the periods it changes, none after today’s', () => {
    expect(periodsChanged(P1, P3, P5)).toEqual([P1, P2, P3]);
    expect(periodsChanged(P3, P5, P4)).toEqual([P3, P4]);
    expect(periodsChanged(P5, P5, P4)).toEqual([]);
  });
});
