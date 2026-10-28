import {
  BonusSchema,
  BonusTierSchema,
  BonusTierSetSchema,
  CarryOverSchema,
  CollectiveGoalSchema,
  CollectiveTierSchema,
  CommissionStatementIdSchema,
  CommissionStatementStatusSchema,
  DEFAULT_MINIMUM_PAYOUT_MINOR,
  ExchangeRateSchema,
  newId,
  nextPayPeriod,
  PayAdjustmentSchema,
  payPeriodAt,
  payPeriodLastDay,
  PayPeriodSchema,
  PenaltySchema,
  previousPayPeriod,
  ShiftReportIdSchema,
  TeamMemberIdSchema,
  type PayPeriod,
  type ShiftReportId,
} from '@nirvana/contracts';
import {
  and,
  eq,
  lockPayrollClose,
  schema,
  sql,
  withAdmin,
  type Database,
  type Transaction,
} from '@nirvana/db';
import { z } from 'zod';

import type { OpenPeriodFacts, PayrollJobStore } from '../domain/ports';
import type {
  CollectiveReached,
  MemberForPay,
  PeriodSnapshot,
  ReportForPay,
  StatementContent,
  StatementDraft,
} from '../domain/recalculation';

const {
  bonusTierSets,
  bonuses,
  carryOvers,
  collectiveGoals,
  commissionStatementLines,
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
 * the planning's validated reports and agency zone, the team's members and rates.
 */
export interface PayInputReads {
  readonly validatedReportsUnscoped: (tx: Transaction, upTo: PayPeriod) => Promise<readonly ReportForPay[]>;
  readonly agencyTimeZone: (tx: Transaction) => Promise<string>;
  readonly membersUnscoped: (tx: Transaction, day: string) => Promise<readonly MemberForPay[]>;
}

export const CollectiveReachedSchema = z
  .object({ reachedBps: z.number().int().min(0), tier: CollectiveTierSchema.nullable() })
  .nullable();

const iso = (at: Date): string => at.toISOString();

const cancellationOf = (row: { cancelledAt: Date | null; cancelledBy: string | null }) =>
  row.cancelledAt === null ? null : { cancelledAt: iso(row.cancelledAt), cancelledBy: row.cancelledBy };

/**
 * Pay's period `period` as it is first needed: from the end of the period before when it is written, else midnight in
 * the agency's zone, to the start of the one after when it is written, else the next midnight there. Written once,
 * never moved (`pay_periods` is added only): nothing falls between two periods nor in both.
 */
async function writeWindow(tx: Transaction, period: PayPeriod, timeZone: string): Promise<void> {
  const before = previousPayPeriod(period);
  const after = nextPayPeriod(period);
  await tx.execute(sql`
    insert into pay_periods (period, starts_at, ends_at, time_zone)
    select ${period}::date,
      coalesce((select ends_at from pay_periods where period = ${before}::date),
        ${period}::date::timestamp at time zone ${timeZone}),
      coalesce((select starts_at from pay_periods where period = ${after}::date),
        ${after}::date::timestamp at time zone ${timeZone}),
      ${timeZone}
    on conflict (period) do nothing`);
}

/** The registry's period of each report among `ids` a closing counted. */
async function registeredAmong(
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

async function closingsSpan(tx: Transaction): Promise<{ first: PayPeriod | null; last: PayPeriod | null }> {
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

async function readSnapshot(
  tx: Transaction,
  reads: PayInputReads,
  period: PayPeriod,
): Promise<PeriodSnapshot> {
  const lastDay = payPeriodLastDay(period);
  const [closing] = await tx.select().from(payPeriodClosings).where(eq(payPeriodClosings.period, period));
  const span = await closingsSpan(tx);
  const reports = await reads.validatedReportsUnscoped(tx, period);
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
            collective: CollectiveReachedSchema.parse(closing.collective),
            exchangeRates: z.array(ExchangeRateSchema).parse(closing.exchangeRates),
          },
    firstClosed: span.first,
    lastClosed: span.last,
    reports,
    registered,
    members: await reads.membersUnscoped(tx, lastDay),
    bonuses: bonusRows.map((row) =>
      BonusSchema.parse({ ...row, createdAt: iso(row.createdAt), cancellation: cancellationOf(row) }),
    ),
    penalties: penaltyRows.map((row) =>
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
      }),
    ),
    carryOvers: carryRows.map((row) => CarryOverSchema.parse({ ...row, createdAt: iso(row.createdAt) })),
    adjustments: adjustmentRows.map((row) =>
      PayAdjustmentSchema.parse({ ...row, createdAt: iso(row.createdAt) }),
    ),
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

/** A statement's columns from its content, as the engine and the recalculation gave it. */
function columnsOf(draft: StatementDraft, computedAt: Date) {
  const { content } = draft;
  return {
    engineVersion: content.engineVersion,
    inputsHash: draft.inputsHash,
    netMinor: content.netMinor,
    commissionMinor: content.commissionMinor,
    teamShareBaseMinor: content.teamShare?.baseNetMinor ?? null,
    teamShareBps: content.teamShare?.bps ?? null,
    teamShareMinor: content.teamShare?.amountMinor ?? null,
    tierBonus: content.tierBonus === null ? null : BonusTierSchema.parse(content.tierBonus),
    collectiveBonusMinor: content.collectiveBonusMinor,
    bonusesMinor: content.bonusesMinor,
    penaltiesRequestedMinor: content.penaltiesRequestedMinor,
    penaltiesMinor: content.penaltiesMinor,
    carryOversInMinor: content.carryOversInMinor,
    adjustmentsMinor: content.adjustmentsMinor,
    totalMinor: content.totalMinor,
    carryOverOutMinor: content.carryOverOutMinor,
    payableMinor: content.payableMinor,
    teamNetMinor: content.teamNetMinor,
    collective: content.collective satisfies CollectiveReached,
    rules: content.rules,
    counted: content.counted,
    computedAt,
  };
}

async function writeLines(
  tx: Transaction,
  statementId: string,
  revision: number,
  content: StatementContent,
): Promise<void> {
  if (content.lines.length === 0) return;
  await tx.insert(commissionStatementLines).values(
    content.lines.map((line) => ({
      id: newId(z.uuid()),
      statementId,
      revision,
      platformAccountId: line.platformAccountId,
      currency: line.currency,
      vatBps: line.vatBps,
      platformFeeBps: line.platformFeeBps,
      rateMicros: line.rateMicros,
      grossMinor: line.grossMinor,
      grossEurMinor: line.grossEurMinor,
      exclVatMinor: line.exclVatMinor,
      netMinor: line.netMinor,
      commissionMinor: line.commissionMinor,
      shiftReportIds: [...line.shiftReportIds],
      lateReports: line.lateReports,
    })),
  );
}

/**
 * The jobs' store (EQ-04, ADR 0032), on the admin connection: pay's job reads every creator's reports, a read bounded
 * to it (ADR 0023 § Paie). Each recalculation holds `payroll.close`, so that a validation never sees half a period.
 */
export function createDrizzlePayrollJobStore(
  adminDb: Database,
  reads: PayInputReads,
  now: () => Date,
): PayrollJobStore {
  return {
    recomputeUnscoped: (period, decide) =>
      withAdmin(adminDb, async (tx) => {
        await lockPayrollClose(tx);
        await writeWindow(tx, period, await reads.agencyTimeZone(tx));
        const snapshot = await readSnapshot(tx, reads, period);
        const decision = decide(snapshot);
        if (decision.kind === 'write') {
          const computedAt = now();
          for (const draft of decision.inserts) {
            const id = newId(CommissionStatementIdSchema);
            await tx.insert(commissionStatements).values({
              id,
              memberId: draft.content.memberId,
              period,
              status: 'draft',
              revision: 1,
              ...columnsOf(draft, computedAt),
            });
            await writeLines(tx, id, 1, draft.content);
          }
          for (const draft of decision.updates) {
            const written = await tx
              .update(commissionStatements)
              .set({ revision: draft.revision, ...columnsOf(draft, computedAt) })
              .where(
                and(
                  eq(commissionStatements.id, draft.statementId),
                  eq(commissionStatements.status, 'draft'),
                  eq(commissionStatements.revision, draft.revision - 1),
                ),
              )
              .returning({ id: commissionStatements.id });
            if (written.length !== 1)
              throw new Error(`Statement ${draft.statementId} changed under the lock`);
            await writeLines(tx, draft.statementId, draft.revision, draft.content);
          }
        }
        return { decision, closed: snapshot.closing !== null, lastClosed: snapshot.lastClosed };
      }),

    openPeriodFactsUnscoped: (at) =>
      withAdmin(adminDb, async (tx): Promise<OpenPeriodFacts> => {
        const current = payPeriodAt(at, await reads.agencyTimeZone(tx));
        const { last } = await closingsSpan(tx);
        const reports = await reads.validatedReportsUnscoped(tx, current);
        const registered = await registeredAmong(
          tx,
          reports.map((report) => report.id),
        );
        const waiting = reports
          .filter((report) => !registered.has(report.id))
          .map((report) => report.period)
          .sort();
        return { current, lastClosed: last, earliestUncounted: waiting[0] ?? null };
      }),
  };
}
