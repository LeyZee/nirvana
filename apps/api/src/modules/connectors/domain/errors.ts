import { DomainError, type ConnectorErrorCode } from '@nirvana/contracts';

export class PlatformAccountNotFound extends DomainError {
  constructor() {
    super('platform_account_not_found', 'Compte plateforme introuvable');
  }
}

/** No adapter for the account's platform yet (Reveal arrives with phase 1). */
export class ConnectorUnavailable extends DomainError {
  constructor() {
    super('connector_unavailable', 'Aucun connecteur pour cette plateforme');
  }
}

/** `SESSION_ENCRYPTION_KEYS` is not set: a session cannot be stored nor read. */
export class SessionVaultMissing extends DomainError {
  constructor() {
    super('session_vault_unavailable', 'Clé de chiffrement des sessions absente');
  }
}

export class DeviceUnauthenticated extends DomainError {
  constructor() {
    super('device_unauthenticated', 'Appareil non reconnu');
  }
}

/** A connector failure as the rest of the core sees it: `connector_rate_limited`, `connector_session_expired`… */
export class ConnectorFailed extends DomainError {
  constructor(code: ConnectorErrorCode, options: { readonly cause?: unknown }) {
    super(`connector_${code}`, 'La plateforme a refusé l’opération', options);
  }
}
