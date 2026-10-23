import { DomainError } from '@nirvana/contracts';

/** Error codes of the module (api.md § Erreurs): the suffix gives the HTTP status. */
export class FanNotFound extends DomainError {
  constructor() {
    super('fan_not_found', 'Fan introuvable');
  }
}
