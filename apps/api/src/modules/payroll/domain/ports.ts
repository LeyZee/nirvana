import type {
  Bonus,
  BonusId,
  BonusTierSet,
  CollectiveGoal,
  CommissionStatement,
  CommissionStatementId,
  CreateBonusBody,
  CreateBonusTierSetBody,
  CreateCollectiveGoalBody,
  CreatePenaltyBody,
  DomainError,
  ExchangeRate,
  ExchangeRates,
  ForeignCurrency,
  PayAdjustment,
  PayAdjustmentId,
  PayPeriod,
  PayPeriodClosing,
  PayPeriodWindow,
  PayrollSettings,
  Penalty,
  PenaltyId,
  TeamMemberId,
  TeamScope,
  UserId,
} from '@nirvana/contracts';

import type { PeriodPlan, PeriodSnapshot, ReportForPay } from './recalculation';

/** Who validates, for the policies (`withMember`) and the audit line. */
export interface Actor {
  readonly userId: UserId;
  readonly ip: string | null;
}

/** One creator's validated reports, as the member who validates reads them in her (ADR 0032). */
export interface CreatorReports {
  readonly creatorId: string;
  readonly reports: readonly ReportForPay[];
}

/** What the module's jobs say when something needs a look: a period they could not compute, a statement that drifted. */
export interface JobLogger {
  warn(object: object, message: string): void;
  error(object: object, message: string): void;
}

/** What a recalculation decided: a plan, or the business reason it could not compute the period (a missing rate). */
export type PeriodDecision = PeriodPlan | { readonly kind: 'blocked'; readonly error: DomainError };

interface RecomputedPeriod {
  readonly decision: PeriodDecision;
  readonly closed: boolean;
  readonly lastClosed: PayPeriod | null;
}

/** Where the hourly run starts: the team's last closing, and the earliest period a validated report waits in. */
export interface OpenPeriodFacts {
  readonly current: PayPeriod;
  readonly lastClosed: PayPeriod | null;
  readonly earliestUncounted: PayPeriod | null;
}

/** The jobs' store, on the admin connection: every method is one transaction. */
export interface PayrollJobStore {
  /**
   * Under the lock `payroll.close`: writes pay's period `period` when it is missing, reads what its statements are
   * made of, hands it to `decide`, and writes the drafts a plan gives.
   */
  recomputeUnscoped(
    period: PayPeriod,
    decide: (snapshot: PeriodSnapshot) => PeriodDecision,
  ): Promise<RecomputedPeriod>;
  openPeriodFactsUnscoped(now: Date): Promise<OpenPeriodFacts>;
}

/** The validation of a statement (ADR 0032): one transaction as the member who validates, under both locks. */
export interface PayrollValidationStore {
  /**
   * Closes the statement's period for the team first when it is open, then validates the statement on the closing
   * and writes its carry-over. Throws the module's errors, nothing is written then.
   */
  validate(
    actor: Actor,
    statementId: CommissionStatementId,
    revision: number,
  ): Promise<{ readonly period: PayPeriod }>;
  /** `payroll.recalculate` for `period`, in its own transaction: after a validation refused on a changed statement. */
  enqueueRecalculation(actor: Actor, period: PayPeriod): Promise<void>;
}

/** `CreatePayAdjustmentBodySchema` once parsed: the statement it corrects, `null` for none. */
interface AdjustmentToCreate {
  readonly id: PayAdjustmentId;
  readonly memberId: TeamMemberId;
  readonly amountMinor: number;
  readonly reason: string;
  readonly correctsStatementId: CommissionStatementId | null;
}

/** An entry as a create gives it back: `created` is `false` when the same one was recorded already (a retry). */
interface Recorded<T> {
  readonly value: T;
  readonly created: boolean;
}

/**
 * A member's bonuses, penalties and adjustments, and the payment of a validated statement (EQ-04, ADR 0032), each in
 * one transaction as the member who writes (`withMember`, the policies keep the four eyes). An entry takes the lock
 * (member, period) of its period and of every later one up to today's, and `payroll.close` first while no period is
 * closed yet. Throws the module's errors, nothing is written then.
 */
export interface PayrollEntryStore {
  createBonus(actor: Actor, body: CreateBonusBody): Promise<Recorded<Bonus>>;
  cancelBonus(actor: Actor, id: BonusId): Promise<Bonus>;
  createPenalty(actor: Actor, body: CreatePenaltyBody): Promise<Recorded<Penalty>>;
  cancelPenalty(actor: Actor, id: PenaltyId): Promise<Penalty>;
  /** The server chooses the period, the member's first open one (`adjustmentPeriod`). */
  createAdjustment(actor: Actor, body: AdjustmentToCreate): Promise<Recorded<PayAdjustment>>;
  /** `validated` → `paid`, by the owner only, at the revision shown. */
  pay(
    actor: Actor,
    statementId: CommissionStatementId,
    revision: number,
  ): Promise<{ readonly period: PayPeriod }>;
}

/**
 * The team's rules (EQ-04, ADR 0032), set by the owner alone, each in one transaction as the owner (`withMember`)
 * under `payroll.close`: individual tiers and a collective goal for a period no statement is validated for yet, and
 * the minimum payout. Throws the module's errors, nothing is written then.
 */
export interface PayrollRuleStore {
  createBonusTierSet(actor: Actor, body: CreateBonusTierSetBody): Promise<Recorded<BonusTierSet>>;
  createCollectiveGoal(actor: Actor, body: CreateCollectiveGoalBody): Promise<Recorded<CollectiveGoal>>;
  /** The minimum as it stands once set; the same value again writes nothing. */
  setSettings(actor: Actor, settings: PayrollSettings): Promise<PayrollSettings>;
}

/** A rate as the ECB writes it (ADR 0033): units of `currency` for one euro, in decimal text, on `day`. */
export interface EcbRate {
  readonly day: string;
  readonly currency: ForeignCurrency;
  readonly perEuro: string;
}

/**
 * The ECB's last 90 days of the currencies pay uses, read and validated; throws when it cannot be reached, answers too
 * much or out of format.
 */
export interface RateSource {
  history(): Promise<readonly EcbRate[]>;
}

/** `exchange_rates`, written by the job only (admin connection), added only: a day once written never changes. */
export interface PayrollRateStore {
  /** Writes each rate whose (currency, day) is not written yet; gives how many, and those written with another value. */
  addUnscoped(
    rates: readonly ExchangeRate[],
  ): Promise<{ readonly written: number; readonly differing: readonly ExchangeRate[] }>;
  /** The ECB day of the newest rate written, for each currency that has one. */
  latestDaysUnscoped(): Promise<ReadonlyMap<ForeignCurrency, string>>;
}

/** A currency without a rate for too long (`exchange_rate_overdue`, ADR 0033). */
export interface OverdueRate {
  readonly currency: ForeignCurrency;
  readonly lastRateDay: string;
  /** The ECB day of the check: one alert per day and currency. */
  readonly day: string;
}

/** The `domain_events` outbox, for the system alerts of pay (admin connection, no creator). */
export interface PayrollRateAlerts {
  /** Publishes `exchange_rate_overdue`, unless that currency already has one that day. True when it published. */
  publishOverdue(alert: OverdueRate): Promise<boolean>;
}

/** Who reads pay: their scope (`withMember`) and their own member, `null` for the owner. */
export interface PayReader {
  readonly scope: TeamScope;
  readonly memberId: TeamMemberId | null;
}

/** A statement as written, its current revision's lines with it, and the team's figures it was computed with. */
export interface StoredStatement {
  readonly statement: Omit<CommissionStatement, 'canValidate' | 'team'>;
  readonly team: NonNullable<CommissionStatement['team']>;
}

/** A period as its reader may see it, through the policies (`withMember`). */
export interface PeriodView {
  readonly reader: PayReader;
  readonly window: PayPeriodWindow | null;
  /** The team's first closed period, `null` before any closing. */
  readonly firstClosed: PayPeriod | null;
  readonly closing: PayPeriodClosing | null;
  readonly statements: readonly StoredStatement[];
  readonly bonusTierSets: readonly BonusTierSet[];
  readonly collectiveGoals: readonly CollectiveGoal[];
  readonly settings: PayrollSettings;
}

export interface PayrollReadStore {
  period(userId: UserId, period: PayPeriod): Promise<PeriodView>;
  settings(userId: UserId): Promise<PayrollSettings>;
  /** The latest rate of each currency the job read. */
  exchangeRates(userId: UserId): Promise<ExchangeRates>;
}
