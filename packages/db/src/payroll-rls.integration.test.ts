import {
  BonusIdSchema,
  BonusTierSetIdSchema,
  CarryOverIdSchema,
  CollectiveGoalIdSchema,
  CommissionStatementIdSchema,
  CreatorIdSchema,
  newId,
  PayAdjustmentIdSchema,
  PenaltyIdSchema,
  PlatformAccountIdSchema,
  TeamMemberIdSchema,
  UserIdSchema,
} from '@nirvana/contracts';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { withAdmin, withMember } from './client';
import * as s from './schema';
import { createTestDb, type TestDb } from './test/test-db';

/** The Postgres message behind a failed query (Drizzle wraps it as `cause`). */
async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    return cause instanceof Error ? cause.message : String(cause);
  }
  return 'no error';
}

const KEPT =
  /pay keeps its past|changes nothing else|takes its next revision|periods close in order|current revision|carry-over comes/u;
const RLS = /row-level security/u;
const HASH = 'a'.repeat(64);

/** Invented people and creators only (ADR 0010). */
describe('commission statements (EQ-04): who reads and writes, and a past that never changes', () => {
  let test: TestDb;
  const owner = newId(UserIdSchema);
  const manager = newId(UserIdSchema);
  const theo = newId(UserIdSchema);
  const lea = newId(UserIdSchema);
  const basile = newId(UserIdSchema);
  const iris = newId(UserIdSchema);
  const lou = newId(UserIdSchema);
  const memberOf = new Map<string, string>();
  const nora = { creatorId: newId(CreatorIdSchema), accountId: newId(PlatformAccountIdSchema) };

  const member = (userId: string): string => {
    const memberId = memberOf.get(userId);
    if (memberId === undefined) throw new Error('no member');
    return memberId;
  };

  const admin = <T>(fn: Parameters<typeof withAdmin<T>>[1]): Promise<T> => withAdmin(test.admin.db, fn);
  const as = <T>(userId: string, fn: Parameters<typeof withMember<T>>[2]): Promise<T> =>
    withMember(test.app.db, userId, fn);

  const periods = [
    '2026-08-16',
    '2026-09-01',
    '2026-09-16',
    '2026-10-01',
    '2026-10-16',
    '2026-11-01',
    '2026-11-16',
  ];

  /** A statement of `userId` for `period`, as the job writes it. */
  const statementRow = (
    userId: string,
    period: string,
    values: Partial<typeof s.commissionStatements.$inferInsert> = {},
  ) => ({
    id: newId(CommissionStatementIdSchema),
    memberId: member(userId),
    period,
    status: 'draft',
    revision: 1,
    engineVersion: 'nirvana-1',
    inputsHash: HASH,
    netMinor: 66_666,
    commissionMinor: 13_333,
    collectiveBonusMinor: 0,
    bonusesMinor: 0,
    penaltiesRequestedMinor: 0,
    penaltiesMinor: 0,
    carryOversInMinor: 0,
    adjustmentsMinor: 0,
    totalMinor: 13_333,
    carryOverOutMinor: 0,
    payableMinor: 13_333,
    teamNetMinor: 66_666,
    rules: {},
    counted: {},
    computedAt: new Date(),
    ...values,
  });

  const draft = async (
    userId: string,
    period: string,
    values: Partial<typeof s.commissionStatements.$inferInsert> = {},
  ) => {
    const row = statementRow(userId, period, values);
    await admin((tx) => tx.insert(s.commissionStatements).values(row));
    return row.id;
  };

  const validate = (
    by: string,
    id: string,
    values: Partial<typeof s.commissionStatements.$inferInsert> = {},
  ) =>
    as(by, (tx) =>
      tx
        .update(s.commissionStatements)
        .set({ status: 'validated', validatedAt: new Date(), validatedBy: by, ...values })
        .where(eq(s.commissionStatements.id, id))
        .returning({ id: s.commissionStatements.id }),
    );

  const pay = (by: string, id: string) =>
    as(by, (tx) =>
      tx
        .update(s.commissionStatements)
        .set({ status: 'paid', paidAt: new Date(), paidBy: by })
        .where(eq(s.commissionStatements.id, id))
        .returning({ id: s.commissionStatements.id }),
    );

  const readStatements = (by: string) =>
    as(by, (tx) => tx.select({ id: s.commissionStatements.id }).from(s.commissionStatements)).then((rows) =>
      rows.map((row) => row.id),
    );

  const bonusRow = (by: string, userId: string, period: string) => ({
    id: newId(BonusIdSchema),
    memberId: member(userId),
    period,
    amountMinor: 5_000,
    reason: 'Week-end tenu seul',
    createdBy: by,
  });

  const penaltyRow = (by: string, userId: string, fromPeriod: string, toPeriod: string) => ({
    id: newId(PenaltyIdSchema),
    memberId: member(userId),
    fromPeriod,
    toPeriod,
    kind: 'fixed',
    amountMinor: 2_000,
    reason: 'Shift manqué sans prévenir',
    createdBy: by,
  });

  const lineRow = (statementId: string, revision: number) => ({
    id: newId(CommissionStatementIdSchema),
    statementId,
    revision,
    platformAccountId: nora.accountId,
    currency: 'EUR',
    vatBps: 2_000,
    platformFeeBps: 2_000,
    rateMicros: 1_000_000,
    grossMinor: 100_000,
    grossEurMinor: 100_000,
    exclVatMinor: 83_333,
    netMinor: 66_666,
    commissionMinor: 13_333,
    shiftReportIds: [],
    lateReports: [],
  });

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    await admin(async (tx) => {
      await tx
        .insert(s.creators)
        .values({ id: nora.creatorId, displayName: 'Créatrice Nora', timezone: 'Europe/Paris' });
      await tx
        .insert(s.platformAccounts)
        .values({ id: nora.accountId, creatorId: nora.creatorId, platform: 'reveal', handle: 'handle-nora' });
      const people = [
        [owner, 'owner', null],
        [manager, 'operator', 'manager'],
        [theo, 'operator', 'chatter'],
        [lea, 'operator', 'chatter'],
        [basile, 'operator', 'chatter'],
        [iris, 'operator', 'chatter'],
        [lou, 'operator', 'chatter'],
      ] as const;
      for (const [userId, role, teamRole] of people) {
        await tx
          .insert(s.user)
          .values({ id: userId, name: `Compte ${role}`, email: `${userId}@example.test`, role });
        if (teamRole === null) continue;
        const memberId = newId(TeamMemberIdSchema);
        memberOf.set(userId, memberId);
        await tx.insert(s.teamMembers).values({
          id: memberId,
          userId,
          teamRole,
          firstName: 'Prénom',
          lastName: 'Inventé',
          displayName: `Membre ${teamRole}`,
          country: 'BJ',
          timeZone: 'Africa/Porto-Novo',
          joinedOn: '2026-08-01',
        });
      }
      for (const period of periods) {
        const startsAt = new Date(`${period}T00:00:00+02:00`);
        await tx.insert(s.payPeriods).values({
          period,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 15 * 86_400_000),
          timeZone: 'Europe/Paris',
        });
      }
    });
  });

  afterAll(async () => {
    await test.close();
  });

  describe('statements', () => {
    it('a member reads their own; a colleague none; the agency all', async () => {
      const id = await draft(basile, '2026-09-01');
      expect(await readStatements(basile)).toContain(id);
      expect(await readStatements(lea)).not.toContain(id);
      expect(await readStatements(manager)).toContain(id);
      expect(await readStatements(owner)).toContain(id);
      // The application never writes one: the job does.
      expect(
        await failure(
          as(owner, (tx) => tx.insert(s.commissionStatements).values(statementRow(lou, '2026-09-01'))),
        ),
      ).toMatch(/permission denied/u);
    });

    it('a recalculation takes the next revision and keeps the member and the period', async () => {
      const id = await draft(lou, '2026-09-01');
      const recalc = (values: Partial<typeof s.commissionStatements.$inferInsert>) =>
        admin((tx) => tx.update(s.commissionStatements).set(values).where(eq(s.commissionStatements.id, id)));
      await recalc({ revision: 2, totalMinor: 14_000, payableMinor: 14_000 });
      expect(await failure(recalc({ revision: 2, totalMinor: 15_000, payableMinor: 15_000 }))).toMatch(KEPT);
      expect(await failure(recalc({ revision: 3, period: '2026-09-16' }))).toMatch(KEPT);
    });

    it('the agency validates a draft, never its own, and changes nothing else then', async () => {
      const own = await draft(manager, '2026-09-01');
      expect(await validate(manager, own)).toEqual([]);
      const [theirs] = await admin((tx) =>
        tx
          .select({ id: s.commissionStatements.id })
          .from(s.commissionStatements)
          .where(sql`${s.commissionStatements.memberId} = ${member(basile)}`),
      );
      if (theirs === undefined) throw new Error('no statement');
      // The application changes no amount: the grants leave it the status and who validated or paid.
      expect(await failure(validate(manager, theirs.id, { totalMinor: 1, payableMinor: 1 }))).toMatch(
        /permission denied/u,
      );
      // And nobody does in validating, the job included.
      expect(
        await failure(
          admin((tx) =>
            tx
              .update(s.commissionStatements)
              .set({
                status: 'validated',
                validatedAt: new Date(),
                validatedBy: manager,
                totalMinor: 1,
                payableMinor: 1,
              })
              .where(eq(s.commissionStatements.id, theirs.id)),
          ),
        ),
      ).toMatch(KEPT);
      // A chatter validates nothing, not even a colleague's.
      expect(await validate(lea, theirs.id)).toEqual([]);
      expect(await validate(manager, theirs.id)).toEqual([{ id: theirs.id }]);
    });

    it('closes periods in order: an earlier draft of the member blocks a later validation', async () => {
      const first = await draft(iris, '2026-09-01');
      const later = await draft(iris, '2026-09-16');
      expect(await failure(validate(manager, later))).toMatch(KEPT);
      await validate(manager, first);
      expect(await validate(manager, later)).toEqual([{ id: later }]);
    });

    it('a validated statement changes only to paid, by the owner alone; then never, for nobody', async () => {
      const [statement] = await admin((tx) =>
        tx
          .select({ id: s.commissionStatements.id })
          .from(s.commissionStatements)
          .where(sql`${s.commissionStatements.memberId} = ${member(basile)}`),
      );
      if (statement === undefined) throw new Error('no statement');
      const id = statement.id;
      const change = (values: Partial<typeof s.commissionStatements.$inferInsert>) =>
        admin((tx) => tx.update(s.commissionStatements).set(values).where(eq(s.commissionStatements.id, id)));
      expect(await pay(manager, id)).toEqual([]);
      expect(await failure(change({ totalMinor: 1, payableMinor: 1 }))).toMatch(KEPT);
      expect(
        await failure(change({ status: 'draft', validatedAt: null, validatedBy: null, revision: 2 })),
      ).toMatch(KEPT);
      expect(await pay(owner, id)).toEqual([{ id }]);
      expect(await failure(change({ paidAt: new Date() }))).toMatch(KEPT);
      expect(
        await failure(
          admin((tx) => tx.delete(s.commissionStatements).where(eq(s.commissionStatements.id, id))),
        ),
      ).toMatch(KEPT);
      // No draft comes back for an earlier period of the member: it is closed too.
      expect(await failure(draft(basile, '2026-08-16'))).toMatch(KEPT);
    });

    it('lines belong to the current revision of a draft, and are added only', async () => {
      const id = await draft(lou, '2026-11-01');
      await admin((tx) => tx.insert(s.commissionStatementLines).values(lineRow(id, 1)));
      expect(
        await failure(admin((tx) => tx.insert(s.commissionStatementLines).values(lineRow(id, 2)))),
      ).toMatch(KEPT);
      expect(
        await failure(
          admin((tx) =>
            tx
              .update(s.commissionStatementLines)
              .set({ netMinor: 1 })
              .where(eq(s.commissionStatementLines.statementId, id)),
          ),
        ),
      ).toMatch(KEPT);
      const lines = (by: string) =>
        as(by, (tx) =>
          tx
            .select({ id: s.commissionStatementLines.id })
            .from(s.commissionStatementLines)
            .where(eq(s.commissionStatementLines.statementId, id)),
        );
      expect(await lines(lou)).toHaveLength(1);
      expect(await lines(theo)).toHaveLength(0);
      expect(await lines(manager)).toHaveLength(1);
    });
  });

  describe('bonuses, penalties and adjustments', () => {
    it('the agency writes them for others, never for itself; a chatter writes none', async () => {
      await as(manager, (tx) => tx.insert(s.bonuses).values(bonusRow(manager, lea, '2026-11-01')));
      expect(
        await failure(
          as(manager, (tx) => tx.insert(s.bonuses).values(bonusRow(manager, manager, '2026-11-01'))),
        ),
      ).toMatch(RLS);
      expect(
        await failure(as(theo, (tx) => tx.insert(s.bonuses).values(bonusRow(theo, lea, '2026-11-01')))),
      ).toMatch(RLS);
      expect(
        await failure(
          as(theo, (tx) => tx.insert(s.penalties).values(penaltyRow(theo, lea, '2026-11-01', '2026-11-01'))),
        ),
      ).toMatch(RLS);
    });

    it('nothing lands on a period the member closed', async () => {
      // Theo's period of October 1st is validated.
      await validate(manager, await draft(theo, '2026-10-01'));
      expect(
        await failure(
          as(manager, (tx) => tx.insert(s.bonuses).values(bonusRow(manager, theo, '2026-10-01'))),
        ),
      ).toMatch(KEPT);
      expect(
        await failure(
          as(manager, (tx) =>
            tx.insert(s.penalties).values(penaltyRow(manager, theo, '2026-10-01', '2026-11-01')),
          ),
        ),
      ).toMatch(KEPT);
      const adjustment = (period: string) => ({
        id: newId(PayAdjustmentIdSchema),
        memberId: member(theo),
        period,
        amountMinor: -4_000,
        reason: 'Remboursement après paiement',
        createdBy: manager,
      });
      expect(
        await failure(as(manager, (tx) => tx.insert(s.payAdjustments).values(adjustment('2026-10-01')))),
      ).toMatch(KEPT);
      await as(manager, (tx) => tx.insert(s.payAdjustments).values(adjustment('2026-10-16')));
      expect(await failure(admin((tx) => tx.update(s.payAdjustments).set({ amountMinor: 1 })))).toMatch(KEPT);
    });

    it('a bonus is cancelled once, while its period is open; never deleted', async () => {
      const row = bonusRow(manager, theo, '2026-10-16');
      await as(manager, (tx) => tx.insert(s.bonuses).values(row));
      const cancel = (by: string) =>
        as(by, (tx) =>
          tx
            .update(s.bonuses)
            .set({ cancelledAt: new Date(), cancelledBy: by })
            .where(eq(s.bonuses.id, row.id))
            .returning({ id: s.bonuses.id }),
        );
      expect(
        await failure(
          admin((tx) => tx.update(s.bonuses).set({ amountMinor: 1 }).where(eq(s.bonuses.id, row.id))),
        ),
      ).toMatch(KEPT);
      expect(await cancel(theo)).toEqual([]);
      expect(await cancel(owner)).toEqual([{ id: row.id }]);
      expect(await cancel(owner)).toEqual([]);
      expect(await failure(admin((tx) => tx.delete(s.bonuses).where(eq(s.bonuses.id, row.id))))).toMatch(
        KEPT,
      );
    });

    it('a penalty is cancelled from an open period on; the closed ones keep it', async () => {
      const row = penaltyRow(manager, lea, '2026-11-01', '2026-11-16');
      await as(manager, (tx) => tx.insert(s.penalties).values(row));
      const cancelFrom = (from: string) =>
        as(owner, (tx) =>
          tx
            .update(s.penalties)
            .set({ cancelledAt: new Date(), cancelledBy: owner, cancelledFrom: from })
            .where(eq(s.penalties.id, row.id))
            .returning({ id: s.penalties.id }),
        );
      // Out of its periods.
      expect(await failure(cancelFrom('2026-12-01'))).toMatch(/penalties_cancellation_check/u);
      // Lea's period of November 1st is validated: it keeps the penalty.
      await validate(manager, await draft(lea, '2026-11-01'));
      expect(await failure(cancelFrom('2026-11-01'))).toMatch(KEPT);
      expect(await cancelFrom('2026-11-16')).toEqual([{ id: row.id }]);
      // Once: a cancelled penalty is no longer the policy's to change.
      expect(await cancelFrom('2026-11-16')).toEqual([]);
    });
  });

  describe('carry-overs, tiers, goals, rates', () => {
    it('a carry-over comes from the member’s validated statement, to the next period, once', async () => {
      const [statement] = await admin((tx) =>
        tx
          .select({ id: s.commissionStatements.id })
          .from(s.commissionStatements)
          .where(
            sql`${s.commissionStatements.memberId} = ${member(lea)} and ${s.commissionStatements.period} = '2026-11-01'`,
          ),
      );
      if (statement === undefined) throw new Error('no statement');
      const carry = (toPeriod: string) => ({
        id: newId(CarryOverIdSchema),
        memberId: member(lea),
        fromPeriod: '2026-11-01',
        toPeriod,
        amountMinor: 1_000,
        statementId: statement.id,
      });
      expect(await failure(as(owner, (tx) => tx.insert(s.carryOvers).values(carry('2026-12-01'))))).toMatch(
        KEPT,
      );
      await as(owner, (tx) => tx.insert(s.carryOvers).values(carry('2026-11-16')));
      expect(await failure(as(owner, (tx) => tx.insert(s.carryOvers).values(carry('2026-11-16'))))).toMatch(
        /unique/u,
      );
      expect(await failure(admin((tx) => tx.update(s.carryOvers).set({ amountMinor: 2 })))).toMatch(KEPT);
    });

    it('the owner alone sets tiers and goals, never for a period already validated', async () => {
      const tiers = (fromPeriod: string) => ({
        id: newId(BonusTierSetIdSchema),
        fromPeriod,
        tiers: [{ thresholdMinor: 100_000, bonusMinor: 5_000, label: 'Bronze' }],
        createdBy: owner,
      });
      const goal = (period: string, by = owner) => ({
        id: newId(CollectiveGoalIdSchema),
        period,
        targetMinor: 1_000_000,
        tiers: [{ reachedBps: 10_000, bonusMinor: 3_000 }],
        createdBy: by,
      });
      expect(
        await failure(as(manager, (tx) => tx.insert(s.collectiveGoals).values(goal('2026-12-01', manager)))),
      ).toMatch(RLS);
      expect(
        await failure(as(owner, (tx) => tx.insert(s.bonusTierSets).values(tiers('2026-11-01')))),
      ).toMatch(KEPT);
      expect(
        await failure(as(owner, (tx) => tx.insert(s.collectiveGoals).values(goal('2026-11-01')))),
      ).toMatch(KEPT);
      await as(owner, (tx) => tx.insert(s.bonusTierSets).values(tiers('2026-11-16')));
      await as(owner, (tx) => tx.insert(s.collectiveGoals).values(goal('2026-11-16')));
      expect(await failure(admin((tx) => tx.update(s.collectiveGoals).set({ targetMinor: 1 })))).toMatch(
        KEPT,
      );
      expect(await as(theo, (tx) => tx.select().from(s.bonusTierSets))).toHaveLength(1);
    });

    it('rates are read by every member, written by the job alone, and never change', async () => {
      const rate = {
        currency: 'USD',
        day: '2026-10-31',
        rateMicros: 920_000,
        source: 'test',
        fetchedAt: new Date(),
      };
      expect(await failure(as(owner, (tx) => tx.insert(s.exchangeRates).values(rate)))).toMatch(
        /permission denied/u,
      );
      await admin((tx) => tx.insert(s.exchangeRates).values(rate));
      expect(await as(theo, (tx) => tx.select().from(s.exchangeRates))).toHaveLength(1);
      expect(await failure(admin((tx) => tx.update(s.exchangeRates).set({ rateMicros: 930_000 })))).toMatch(
        KEPT,
      );
      expect(
        await failure(
          admin((tx) => tx.insert(s.exchangeRates).values({ ...rate, currency: 'EUR', day: '2026-11-01' })),
        ),
      ).toMatch(/exchange_rates_currency_check/u);
    });
  });
});
