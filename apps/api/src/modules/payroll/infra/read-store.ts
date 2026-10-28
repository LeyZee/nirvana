import {
  BonusSchema,
  BonusTierSchema,
  CarryOverSchema,
  CollectiveReachedSchema,
  CommissionStatementIdSchema,
  CommissionStatementRulesSchema,
  CommissionStatementStatusSchema,
  CurrencySchema,
  ExchangeRateSchema,
  LateReportSchema,
  PayAdjustmentSchema,
  PayEngineVersionSchema,
  PayPeriodClosingSchema,
  PayPeriodSchema,
  PayPeriodWindowSchema,
  PenaltySchema,
  PlatformAccountIdSchema,
  ShiftReportIdSchema,
  StatementPaymentSchema,
  TeamMemberIdSchema,
  UserIdSchema,
  type PayPeriod,
} from '@nirvana/contracts';
import { and, eq, inArray, schema, sql, withMember, type Database } from '@nirvana/db';
import { z } from 'zod';

import { PayrollForbidden } from '../domain/errors';
import type { PayrollReadStore, StoredStatement } from '../domain/ports';

import { bonusTierSetOfRow, collectiveGoalOfRow, exchangeRateOfRow, settingsOf } from './snapshot';

const {
  bonusTierSets,
  collectiveGoals,
  commissionStatementLines,
  commissionStatements,
  exchangeRates,
  payPeriodClosings,
  payPeriods,
  payrollSettings,
  teamMembers,
} = schema;

const iso = (at: Date | null): string | null => (at === null ? null : at.toISOString());

const CountedSchema = z.object({
  bonuses: z.array(BonusSchema),
  penalties: z.array(PenaltySchema),
  carryOversIn: z.array(CarryOverSchema),
  adjustments: z.array(PayAdjustmentSchema),
});

/**
 * Pay as its reader may see it (EQ-04), through `withMember`: the policies decide which statements come back (one's
 * own for a member, all of them for the owner and an active manager), never the code.
 */
export function createDrizzlePayrollReadStore(db: Database): PayrollReadStore {
  return {
    period: (userId, period: PayPeriod) =>
      withMember(db, userId, async (tx, scope) => {
        const [own] = await tx
          .select({ id: teamMembers.id })
          .from(teamMembers)
          .where(eq(teamMembers.userId, userId));
        const [windowRow] = await tx.select().from(payPeriods).where(eq(payPeriods.period, period));
        const window =
          windowRow === undefined
            ? null
            : PayPeriodWindowSchema.parse({
                period: windowRow.period,
                startsAt: windowRow.startsAt.toISOString(),
                endsAt: windowRow.endsAt.toISOString(),
                timeZone: windowRow.timeZone,
              });
        const [closingRow] = await tx
          .select()
          .from(payPeriodClosings)
          .where(eq(payPeriodClosings.period, period));
        const [first] = await tx
          .select({ period: sql`min(${payPeriodClosings.period})::text` })
          .from(payPeriodClosings);
        const statementRows = await tx
          .select()
          .from(commissionStatements)
          .where(eq(commissionStatements.period, period))
          .orderBy(commissionStatements.memberId);
        const lineRows =
          statementRows.length === 0
            ? []
            : await tx
                .select()
                .from(commissionStatementLines)
                .innerJoin(
                  commissionStatements,
                  and(
                    eq(commissionStatements.id, commissionStatementLines.statementId),
                    eq(commissionStatements.revision, commissionStatementLines.revision),
                  ),
                )
                .where(
                  inArray(
                    commissionStatementLines.statementId,
                    statementRows.map((row) => row.id),
                  ),
                )
                .orderBy(
                  commissionStatementLines.platformAccountId,
                  commissionStatementLines.currency,
                  commissionStatementLines.vatBps,
                  commissionStatementLines.platformFeeBps,
                );
        const tierRows = await tx
          .select()
          .from(bonusTierSets)
          .where(sql`${bonusTierSets.fromPeriod} <= ${period}`);
        const goalRows = await tx.select().from(collectiveGoals).where(eq(collectiveGoals.period, period));
        const [settings] = await tx.select().from(payrollSettings);

        const statements: StoredStatement[] = statementRows.map((row) => {
          if (window === null) throw new Error(`Statement ${row.id} without its period`);
          const counted = CountedSchema.parse(row.counted);
          const teamShare =
            row.teamShareBps === null || row.teamShareMinor === null || row.teamShareBaseMinor === null
              ? null
              : {
                  baseNetMinor: row.teamShareBaseMinor,
                  bps: row.teamShareBps,
                  amountMinor: row.teamShareMinor,
                };
          return {
            statement: {
              id: CommissionStatementIdSchema.parse(row.id),
              memberId: TeamMemberIdSchema.parse(row.memberId),
              window,
              status: CommissionStatementStatusSchema.parse(row.status),
              revision: row.revision,
              engineVersion: PayEngineVersionSchema.parse(row.engineVersion),
              inputsHash: row.inputsHash,
              lines: lineRows
                .filter(({ commission_statement_lines: line }) => line.statementId === row.id)
                .map(({ commission_statement_lines: line }) => ({
                  platformAccountId: PlatformAccountIdSchema.parse(line.platformAccountId),
                  currency: CurrencySchema.parse(line.currency),
                  vatBps: line.vatBps,
                  platformFeeBps: line.platformFeeBps,
                  rateMicros: line.rateMicros,
                  grossMinor: line.grossMinor,
                  grossEurMinor: line.grossEurMinor,
                  exclVatMinor: line.exclVatMinor,
                  netMinor: line.netMinor,
                  commissionMinor: line.commissionMinor,
                  shiftReportIds: z.array(ShiftReportIdSchema).parse(line.shiftReportIds),
                  lateReports: z.array(LateReportSchema).parse(line.lateReports),
                })),
              netMinor: row.netMinor,
              commissionMinor: row.commissionMinor,
              teamShare,
              tierBonus: BonusTierSchema.nullable().parse(row.tierBonus),
              collectiveBonusMinor: row.collectiveBonusMinor,
              bonuses: counted.bonuses,
              penalties: counted.penalties,
              carryOversIn: counted.carryOversIn,
              adjustments: counted.adjustments,
              bonusesMinor: row.bonusesMinor,
              penaltiesRequestedMinor: row.penaltiesRequestedMinor,
              penaltiesMinor: row.penaltiesMinor,
              carryOversInMinor: row.carryOversInMinor,
              adjustmentsMinor: row.adjustmentsMinor,
              totalMinor: row.totalMinor,
              carryOverOutMinor: row.carryOverOutMinor,
              payableMinor: row.payableMinor,
              rules: CommissionStatementRulesSchema.parse(row.rules),
              computedAt: row.computedAt.toISOString(),
              validatedAt: iso(row.validatedAt),
              validatedBy: row.validatedBy === null ? null : UserIdSchema.parse(row.validatedBy),
              paidAt: iso(row.paidAt),
              paidBy: row.paidBy === null ? null : UserIdSchema.parse(row.paidBy),
              payment:
                row.paidOn === null
                  ? null
                  : StatementPaymentSchema.parse({
                      paidOn: row.paidOn,
                      method: row.paymentMethod,
                      reference: row.paymentReference,
                      sentMinor: row.sentMinor,
                    }),
            },
            team: {
              netMinor: row.teamNetMinor,
              collective: CollectiveReachedSchema.nullable().parse(row.collective),
            },
          };
        });

        return {
          reader: { scope, memberId: own === undefined ? null : TeamMemberIdSchema.parse(own.id) },
          window,
          firstClosed: PayPeriodSchema.nullable().parse(first?.period ?? null),
          closing:
            closingRow === undefined
              ? null
              : PayPeriodClosingSchema.parse({
                  period: closingRow.period,
                  exchangeRates: z.array(ExchangeRateSchema).parse(closingRow.exchangeRates),
                  closedBy: closingRow.closedBy,
                  closedAt: closingRow.closedAt.toISOString(),
                }),
          statements,
          bonusTierSets: tierRows.map(bonusTierSetOfRow),
          collectiveGoals: goalRows.map(collectiveGoalOfRow),
          settings: settingsOf(settings),
        };
      }),

    settings: (userId) =>
      withMember(db, userId, async (tx) => settingsOf((await tx.select().from(payrollSettings))[0])),

    // The agency's, closed by default: the owner and an active manager read it, anyone else is refused (a member, an
    // inactive manager, an account outside the team), who reads the rate their own lines were computed on.
    exchangeRates: (userId) =>
      withMember(db, userId, async (tx, scope) => {
        if (scope !== 'owner' && scope !== 'agency') throw new PayrollForbidden();
        const [usd] = await tx
          .select()
          .from(exchangeRates)
          .where(eq(exchangeRates.currency, 'USD'))
          .orderBy(sql`${exchangeRates.day} desc`)
          .limit(1);
        return { usd: usd === undefined ? null : exchangeRateOfRow(usd) };
      }),
  };
}
