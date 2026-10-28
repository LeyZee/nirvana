import {
  CommissionStatementIdSchema,
  newId,
  PayPeriodSchema,
  TeamMemberIdSchema,
  UserIdSchema,
  type CommissionStatementRules,
} from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import type { PayReader, PeriodView, StoredStatement } from '../../domain/ports';
import { createPayrollReads } from '../periods';

/** Invented members only (ADR 0010). */
const P1 = PayPeriodSchema.parse('2025-03-01');
const THEO = newId(TeamMemberIdSchema);
const window = {
  period: P1,
  startsAt: '2025-02-28T23:00:00.000Z',
  endsAt: '2025-03-15T23:00:00.000Z',
  timeZone: 'Europe/Paris',
};
const rules = (goal: boolean): CommissionStatementRules => ({
  commissionRateBps: 2_000,
  teamShareBps: null,
  bonusTiers: [],
  collectiveGoal: goal ? { targetMinor: 100_000, tiers: [{ reachedBps: 10_000, bonusMinor: 3_000 }] } : null,
  minimumPayoutMinor: 1_500,
  exchangeRates: [],
  final: false,
});

const stored = (goal: boolean): StoredStatement => ({
  statement: {
    id: newId(CommissionStatementIdSchema),
    memberId: THEO,
    window,
    status: 'draft',
    revision: 1,
    engineVersion: 'nirvana-1',
    inputsHash: 'a'.repeat(64),
    lines: [],
    netMinor: 8_000,
    commissionMinor: 1_600,
    teamShare: null,
    tierBonus: null,
    collectiveBonusMinor: 0,
    bonuses: [],
    penalties: [],
    carryOversIn: [],
    adjustments: [],
    bonusesMinor: 0,
    penaltiesRequestedMinor: 0,
    penaltiesMinor: 0,
    carryOversInMinor: 0,
    adjustmentsMinor: 0,
    totalMinor: 1_600,
    carryOverOutMinor: 0,
    payableMinor: 1_600,
    rules: rules(goal),
    computedAt: '2025-03-16T10:00:00.000Z',
    validatedAt: null,
    validatedBy: null,
    paidAt: null,
    paidBy: null,
  },
  team: { netMinor: 50_000, collective: goal ? { reachedBps: 5_000, tier: null } : null },
});

const read = (reader: PayReader, goal: boolean, at = '2025-03-20T00:00:00Z') =>
  createPayrollReads(
    {
      period: (): Promise<PeriodView> =>
        Promise.resolve({
          reader,
          window,
          closing: null,
          statements: [stored(goal)],
          bonusTierSets: [],
          collectiveGoals: [],
          settings: { minimumPayoutMinor: 1_500 },
        }),
    },
    () => new Date(at),
  ).period(newId(UserIdSchema), P1);

describe('a period as its reader sees it (EQ-04)', () => {
  it('shows the team’s net to the agency, and to a member only to follow the period’s collective goal', async () => {
    const agency = { scope: 'agency' as const, memberId: newId(TeamMemberIdSchema) };
    const own = { scope: 'self' as const, memberId: THEO };
    expect((await read(agency, false)).statements[0]?.team).toEqual({ netMinor: 50_000, collective: null });
    expect((await read(own, false)).statements[0]?.team).toBeNull();
    expect((await read(own, true)).statements[0]?.team?.netMinor).toBe(50_000);
  });

  it('lets the agency validate a draft, never its own member, and says whether the period has ended', async () => {
    const own = await read({ scope: 'self', memberId: THEO }, false);
    const agency = await read({ scope: 'owner', memberId: null }, false);
    expect(own.statements[0]?.canValidate).toBe(false);
    expect(agency.statements[0]?.canValidate).toBe(true);
    expect(agency.ended).toBe(true);
    expect((await read({ scope: 'owner', memberId: null }, false, '2025-03-10T00:00:00Z')).ended).toBe(false);
  });
});
