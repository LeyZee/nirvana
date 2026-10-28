import {
  BonusSchema,
  BonusTierSetSchema,
  CarryOverSchema,
  CollectiveGoalSchema,
  CollectiveReachedSchema,
  CommissionStatementIdSchema,
  CommissionStatementStatusSchema,
  DEFAULT_MINIMUM_PAYOUT_MINOR,
  ExchangeRateSchema,
  PayAdjustmentSchema,
  payPeriodLastDay,
  PayPeriodSchema,
  PenaltySchema,
  ShiftReportIdSchema,
  TeamMemberIdSchema,
  type Bonus,
  type PayAdjustment,
  type PayPeriod,
  type Penalty,
  type ShiftReportId,
} from '@nirvana/contracts';
import { eq, schema, sql, type Transaction } from '@nirvana/db';
import { z } from 'zod';

import type { CreatorReports } from '../domain/ports';
import type { MemberForPay, PeriodSnapshot, ReportForPay } from '../domain/recalculation';

const {
  bonusTierSets,
  bonuses,
  carryOvers,
  collectiveGoals,
  commissionStatements,
  exchangeRates,
  payAdjustments,
  payPeriodClosings,
  payPeriodReports,
  payrollSettings,
  penalties,
} = schema;

/**
 * What pay reads of the other modules, in its own transaction (given by the composition root from their `index.ts`):
 * the planning's validated reports, on every creator for the job (admin connection) or creator by creator as the
 * validating member reads them, the reports still waiting for review, the agency's zone, the team's members and rates,
 * and the creators that exist.
 */
export interface PayInputReads {
  readonly validatedReportsUnscoped: (tx: Transaction, upTo: PayPeriod) => Promise<readonly ReportForPay[]>;
  readonly validatedReportsScoped: (
    tx: Transaction,
    creatorIds: readonly string[],
    upTo: PayPeriod,
  ) => Promise<readonly CreatorReports[]>;
  readonly reportsAwaitingReviewScoped: (
    tx: Transaction,
    creatorIds: readonly string[],
    after: PayPeriod | null,
    upTo: PayPeriod,
  ) => Promise<number>;
  readonly agencyTimeZone: (tx: Transaction) => Promise<string>;
  readonly members: (tx: Transaction, day: string) => Promise<readonly MemberForPay[]>;
  readonly creatorIds: () => Promise<readonly string[]>;
}

const iso = (at: Date): string => at.toISOString();

const cancellationOf = (row: { cancelledAt: Date | null; cancelledBy: string | null }) =>
  row.cancelledAt === null ? null : { cancelledAt: iso(row.cancelledAt), cancelledBy: row.cancelledBy };

export const bonusOfRow = (row: typeof bonuses.$inferSelect): Bonus =>
  BonusSchema.parse({ ...row, createdAt: iso(row.createdAt), cancellation: cancellationOf(row) });

export const penaltyOfRow = (row: typeof penalties.$inferSelect): Penalty =>
  PenaltySchema.parse({
    ...row,
    amount:
      row.kind === 'fixed'
        ? { kind: 'fixed', amountMinor: row.amountMinor }
        : { kind: 'percent', bps: row.bps },
    createdAt: iso(row.createdAt),
    cancellation:
      row.cancelledAt === null
        ? null
        : {
            cancelledAt: iso(row.cancelledAt),
            cancelledBy: row.cancelledBy,
            cancelledFrom: row.cancelledFrom,
          },
  });

export const adjustmentOfRow = (row: typeof payAdjustments.$inferSelect): PayAdjustment =>
  PayAdjustmentSchema.parse({ ...row, createdAt: iso(row.createdAt) });

/** The registry's period of each report among `ids` a closing counted. */
export async function registeredAmong(
  tx: Transaction,
  ids: readonly ShiftReportId[],
): Promise<Map<ShiftReportId, PayPeriod>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ id: payPeriodReports.shiftReportId, period: payPeriodReports.period })
    .from(payPeriodReports)
    .where(sql`${payPeriodReports.shiftReportId} = any(${sql.param([...ids])}::uuid[])`);
  return new Map(rows.map((row) => [ShiftReportIdSchema.parse(row.id), PayPeriodSchema.parse(row.period)]));
}

export async function closingsSpan(
  tx: Transaction,
): Promise<{ first: PayPeriod | null; last: PayPeriod | null }> {
  const [span] = await tx
    .select({
      first: sql<string | null>`min(${payPeriodClosings.period})::text`,
      last: sql<string | null>`max(${payPeriodClosings.period})::text`,
    })
    .from(payPeriodClosings);
  return {
    first: span?.first == null ? null : PayPeriodSchema.parse(span.first),
    last: span?.last == null ? null : PayPeriodSchema.parse(span.last),
  };
}

/**
 * Everything `period`'s statements are made of, in the caller's transaction, with the validated reports made for it or
 * an earlier one that the caller read (`reports`): the job on every creator, a validation creator by creator.
 */
export async function readSnapshot(
  tx: Transaction,
  reads: PayInputReads,
  period: PayPeriod,
  reports: readonly ReportForPay[],
): Promise<PeriodSnapshot> {
  const lastDay = payPeriodLastDay(period);
  const [closing] = await tx.select().from(payPeriodClosings).where(eq(payPeriodClosings.period, period));
  const span = await closingsSpan(tx);
  const registered = await registeredAmong(
    tx,
    reports.map((report) => report.id),
  );

  const bonusRows = await tx.select().from(bonuses).where(eq(bonuses.period, period));
  const penaltyRows = await tx
    .select()
    .from(penalties)
    .where(sql`${penalties.fromPeriod} <= ${period} and ${penalties.toPeriod} >= ${period}`);
  const carryRows = await tx.select().from(carryOvers).where(eq(carryOvers.toPeriod, period));
  const adjustmentRows = await tx.select().from(payAdjustments).where(eq(payAdjustments.period, period));
  const tierRows = await tx
    .select()
    .from(bonusTierSets)
    .where(sql`${bonusTierSets.fromPeriod} <= ${period}`);
  const goalRows = await tx.select().from(collectiveGoals).where(eq(collectiveGoals.period, period));
  const [settings] = await tx.select().from(payrollSettings);
  const rateRows = await tx
    .selectDistinctOn([exchangeRates.currency])
    .from(exchangeRates)
    .where(sql`${exchangeRates.day} <= ${lastDay}::date`)
    .orderBy(exchangeRates.currency, sql`${exchangeRates.day} desc`);
  const statementRows = await tx
    .select({
      id: commissionStatements.id,
      memberId: commissionStatements.memberId,
      status: commissionStatements.status,
      revision: commissionStatements.revision,
      inputsHash: commissionStatements.inputsHash,
    })
    .from(commissionStatements)
    .where(eq(commissionStatements.period, period));

  return {
    period,
    closing:
      closing === undefined
        ? null
        : {
            teamNetMinor: closing.teamNetMinor,
            collective: CollectiveReachedSchema.nullable().parse(closing.collective),
            exchangeRates: z.array(ExchangeRateSchema).parse(closing.exchangeRates),
          },
    firstClosed: span.first,
    lastClosed: span.last,
    reports,
    registered,
    members: await reads.members(tx, lastDay),
    bonuses: bonusRows.map(bonusOfRow),
    penalties: penaltyRows.map(penaltyOfRow),
    carryOvers: carryRows.map((row) => CarryOverSchema.parse({ ...row, createdAt: iso(row.createdAt) })),
    adjustments: adjustmentRows.map(adjustmentOfRow),
    bonusTierSets: tierRows.map((row) => BonusTierSetSchema.parse({ ...row, createdAt: iso(row.createdAt) })),
    collectiveGoals: goalRows.map((row) =>
      CollectiveGoalSchema.parse({ ...row, createdAt: iso(row.createdAt) }),
    ),
    minimumPayoutMinor: settings?.minimumPayoutMinor ?? DEFAULT_MINIMUM_PAYOUT_MINOR,
    latestRates: rateRows.map((row) => ExchangeRateSchema.parse({ ...row, fetchedAt: iso(row.fetchedAt) })),
    statements: statementRows.map((row) => ({
      id: CommissionStatementIdSchema.parse(row.id),
      memberId: TeamMemberIdSchema.parse(row.memberId),
      status: CommissionStatementStatusSchema.parse(row.status),
      revision: row.revision,
      inputsHash: row.inputsHash,
    })),
  };
}
