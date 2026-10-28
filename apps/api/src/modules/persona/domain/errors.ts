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

/** No version of hers has this id (404). */
export class PersonaVersionNotFound extends DomainError {
  constructor() {
    super('persona_version_not_found', 'Version de persona introuvable');
  }
}

/**
 * A sample reply a hard guard of her answers would block (P5-01): nothing is stored (422). `details.faults` gives
 * each one's place and guard code, never its text.
 */
export class PersonaSampleReplyUnprocessable extends DomainError {
  constructor(faults: readonly { readonly index: number; readonly code: string }[]) {
    super(
      'persona_sample_reply_unprocessable',
      'Une réponse type contient ce que l’agent n’a jamais le droit d’écrire : corrige-la avant d’enregistrer',
      { details: { faults: faults.map(({ index, code }) => ({ index, code })) } },
    );
  }
}
