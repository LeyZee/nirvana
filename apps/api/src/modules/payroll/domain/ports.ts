import type {
  BonusTierSet,
  CollectiveGoal,
  CommissionStatement,
  CommissionStatementId,
  DomainError,
  PayPeriod,
  PayPeriodClosing,
  PayPeriodWindow,
  PayrollSettings,
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
}
