import { DomainError, type PayPeriod } from '@nirvana/contracts';

/** Error codes of the module (api.md § Erreurs): the suffix gives the HTTP status. */

/** No usable rate for a currency the period was paid in: pay never guesses a rate (ADR 0023 § Paie). */
export class MissingExchangeRate extends DomainError {
  constructor(currency: string) {
    super('exchange_rate_missing_conflict', 'Aucun taux de change utilisable pour cette devise', {
      details: { currency },
    });
  }
}

/** A member to pay without a commission rate in force on the period's last day: pay never guesses a rate (EQ-01). */
export class CommissionRateMissing extends DomainError {
  constructor(memberId: string) {
    super('commission_rate_missing_conflict', 'Aucun taux de commission en vigueur pour ce membre', {
      details: { memberId },
    });
  }
}

export class CommissionStatementNotFound extends DomainError {
  constructor() {
    super('commission_statement_not_found', 'Relevé introuvable');
  }
}

/** One's own statement: four eyes, a member never validates it (ADR 0023 § Paie). */
export class PayrollOwnForbidden extends DomainError {
  constructor() {
    super('payroll_own_forbidden', 'Un membre ne valide jamais son propre relevé');
  }
}

/** A member who is not the owner nor an active manager. */
export class PayrollForbidden extends DomainError {
  constructor() {
    super('payroll_forbidden', 'Réservé au propriétaire et aux managers actifs');
  }
}

/** Validating what is not a draft. */
export class CommissionStatementStatusConflict extends DomainError {
  constructor() {
    super('commission_statement_status_conflict', 'Ce relevé n’est plus un brouillon');
  }
}

/**
 * Another revision, or other inputs, than the reader saw: they validate what they read, never a statement they did not
 * see. `period` is the statement's, for its recalculation once the transaction is undone.
 */
export class CommissionStatementChanged extends DomainError {
  constructor(readonly period: PayPeriod) {
    super('commission_statement_changed_conflict', 'Le relevé a changé depuis son affichage');
  }
}

/** A period that has not ended in the agency's zone. */
export class CommissionStatementOpen extends DomainError {
  constructor() {
    super('commission_statement_open_conflict', 'La quinzaine n’est pas terminée');
  }
}

/** An earlier statement of the member is still a draft, or pay has not written it yet: periods close in order. */
export class CommissionStatementOrder extends DomainError {
  constructor(details: { readonly statementId: string } | { readonly period: PayPeriod }) {
    super('commission_statement_order_conflict', 'Un relevé plus ancien de ce membre attend sa validation', {
      details,
    });
  }
}

/** An earlier period of the team gives statements that are not validated: periods close in order (ADR 0032). */
export class PayPeriodOrder extends DomainError {
  constructor(period: PayPeriod) {
    super('pay_period_order_conflict', 'Une quinzaine plus ancienne attend sa validation', {
      details: { period },
    });
  }
}

/** Reports of the period still wait for review: closing now would send them to the next period unseen (ADR 0032). */
export class PayPeriodReportsPending extends DomainError {
  constructor(count: number) {
    super('pay_period_reports_pending_conflict', 'Des rapports de la quinzaine attendent leur relecture', {
      details: { count },
    });
  }
}

/** The closing could not read reports it counts (a creator the validator does not see): it never leaves one out. */
export class PayPeriodReportsUnread extends DomainError {
  constructor(count: number) {
    super('pay_period_reports_unread_conflict', 'Des rapports de la quinzaine échappent à cette validation', {
      details: { count },
    });
  }
}
