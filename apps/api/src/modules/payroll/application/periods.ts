import {
  bonusTiersFor,
  collectiveGoalFor,
  mayValidateStatement,
  type CommissionStatement,
  type PayPeriod,
  type PayrollPeriod,
  type UserId,
} from '@nirvana/contracts';

import type { PayReader, PayrollReadStore, StoredStatement } from '../domain/ports';

/**
 * The team's net in a statement: the agency's figure, which a member reading their own statement sees only to follow
 * the period's collective goal (EQ-04, default until Charles decides otherwise); never a colleague's net.
 */
function teamOf({ statement, team }: StoredStatement, reader: PayReader): CommissionStatement['team'] {
  return reader.scope === 'self' && statement.rules.collectiveGoal === null ? null : team;
}

const toStatement = (stored: StoredStatement, reader: PayReader): CommissionStatement => ({
  ...stored.statement,
  team: teamOf(stored, reader),
  canValidate: mayValidateStatement(stored.statement, reader),
});

export interface PayrollReads {
  /** `GET /v1/payroll/periods/:period` (EQ-04): the period as its reader may see it. */
  period(userId: UserId, period: PayPeriod): Promise<PayrollPeriod>;
}

export function createPayrollReads(store: PayrollReadStore, now: () => Date): PayrollReads {
  return {
    async period(userId: UserId, period: PayPeriod): Promise<PayrollPeriod> {
      const view = await store.period(userId, period);
      return {
        period,
        window: view.window,
        ended: view.window !== null && new Date(view.window.endsAt).getTime() <= now().getTime(),
        closing: view.closing,
        statements: view.statements.map((statement) => toStatement(statement, view.reader)),
        bonusTiers: bonusTiersFor(view.bonusTierSets, period),
        collectiveGoal: collectiveGoalFor(view.collectiveGoals, period),
        settings: view.settings,
      };
    },
  };
}
