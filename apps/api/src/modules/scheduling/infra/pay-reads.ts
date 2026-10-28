import {
  CurrencySchema,
  JOB_MAX_ATTEMPTS,
  PayPeriodSchema,
  PlatformAccountIdSchema,
  ShiftReportIdSchema,
  TeamMemberIdSchema,
  type Currency,
  type PayPeriod,
  type PlatformAccountId,
  type ShiftReportId,
  type TeamMemberId,
} from '@nirvana/contracts';
import { sql, type Transaction } from '@nirvana/db';
import { z } from 'zod';

/**
 * What pay reads of the planning (EQ-04, ADR 0023 § Paie), in pay's own transaction: the module owns the reports and
 * the accounts' rules, pay gets these functions through the module's `index.ts`, never the tables.
 */

/** A validated report as pay counts it: its amount, and the rules of its account for the period it was made in. */
export interface ValidatedReportForPay {
  readonly id: ShiftReportId;
  readonly memberId: TeamMemberId;
  readonly platformAccountId: PlatformAccountId;
  /** The period it was made for, which keeps its rules wherever pay counts it. */
  readonly period: PayPeriod;
  readonly amountMinor: number;
  readonly currency: Currency;
  readonly vatBps: number;
  readonly platformFeeBps: number;
}

const RowSchema = z.object({
  id: ShiftReportIdSchema,
  member_id: TeamMemberIdSchema,
  platform_account_id: PlatformAccountIdSchema,
  period: PayPeriodSchema,
  amount_minor: z.number().int(),
  currency: CurrencySchema,
  vat_bps: z.number().int().nullable(),
  platform_fee_bps: z.number().int().nullable(),
});

/**
 * Every validated report made for `upTo` or an earlier period, on every creator: pay's job runs on the admin
 * connection, a read bounded to that job (ADR 0023 § Paie). A report was validated only under its period's rules
 * (`assertDeclarable`), so a report without them is a broken database, never a case of pay.
 */
export async function validatedReportsUnscoped(
  tx: Transaction,
  upTo: PayPeriod,
): Promise<ValidatedReportForPay[]> {
  const result = await tx.execute(sql`
    select r.id, r.member_id, r.platform_account_id, r.period::text as period, r.amount_minor, r.currency,
      rules.vat_bps, rules.platform_fee_bps
    from shift_reports r
    left join lateral (
      select a.vat_bps, a.platform_fee_bps from account_pay_rules a
      where a.platform_account_id = r.platform_account_id and a.from_period <= r.period
      order by a.from_period desc limit 1
    ) rules on true
    where r.status = 'validated' and r.period <= ${upTo}
    order by r.id`);
  return result.rows.map((raw) => {
    const row = RowSchema.parse(raw);
    if (row.vat_bps === null || row.platform_fee_bps === null) {
      throw new Error(`Validated report ${row.id} has no pay rules for its period`);
    }
    return {
      id: row.id,
      memberId: row.member_id,
      platformAccountId: row.platform_account_id,
      period: row.period,
      amountMinor: row.amount_minor,
      currency: row.currency,
      vatBps: row.vat_bps,
      platformFeeBps: row.platform_fee_bps,
    };
  });
}

/**
 * The recalculation of `period`'s pay, once this transaction commits (EQ-04): one waiting job per period, replaced by
 * the next write, a few seconds later so that a batch of reports gives one run. Each write pushes the run back: a
 * series that never stopped would never run, and `payroll.recalculate_open` computes the period every hour anyway.
 */
export async function enqueuePayRecalculation(tx: Transaction, period: PayPeriod): Promise<void> {
  await tx.execute(
    sql`select public.enqueue_job(
      task => 'payroll.recalculate',
      payload => ${JSON.stringify({ period })}::jsonb,
      run_at => now() + interval '5 seconds',
      max_attempts => ${JOB_MAX_ATTEMPTS['payroll.recalculate']}::int,
      job_key => ${`payroll.recalculate:${period}`},
      job_key_mode => 'replace'
    )`,
  );
}
