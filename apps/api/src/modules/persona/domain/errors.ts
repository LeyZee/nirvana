import { DomainError } from '@nirvana/contracts';

/** Error codes of the module (api.md § Erreurs): the suffix gives the HTTP status. */

/** Another version was stored since the edit started, or its version number is taken: nothing is stored (409). */
export class PersonaVersionConflict extends DomainError {
  constructor() {
    super(
      'persona_version_conflict',
      'Une autre version a été enregistrée entre-temps, ou ce numéro de version existe déjà',
    );
  }
}
