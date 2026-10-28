import { DomainError } from '@nirvana/contracts';

/** Error codes of the module (api.md § Erreurs): the suffix gives the HTTP status. */

/** No usable rate for a currency the period was paid in: pay never guesses a rate (ADR 0023 § Paie). */
export class MissingExchangeRate extends DomainError {
  constructor(currency: string) {
    super('exchange_rate_missing_conflict', 'Aucun taux de change utilisable pour cette devise', {
      details: { currency },
    });
  }
}
