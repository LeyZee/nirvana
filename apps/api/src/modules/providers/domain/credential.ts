import type {
  AiProvider,
  ProviderConnectionState,
  ProviderErrorKind,
  ProviderFact,
  ProviderSettings,
  ProviderStatus,
  ProviderVoice,
} from '@nirvana/contracts';

import { profileOf } from './catalog';
import { describeLowCredit } from './messages';
import type { VerificationOutcome, VerifiedKey } from './verification';

/** A saved key with what its last verification found. The key itself never leaves the module. */
export interface StoredCredential {
  readonly provider: AiProvider;
  readonly key: string;
  readonly keyLabel: string | null;
  readonly summary: string;
  readonly facts: readonly ProviderFact[];
  readonly settings: ProviderSettings;
  readonly voices: readonly ProviderVoice[];
  readonly state: Exclude<ProviderConnectionState, 'not_connected'>;
  readonly verifiedAt: Date;
  readonly charactersLeft: number | null;
  readonly lastErrorKind: ProviderErrorKind | null;
}

export function credentialFromVerification(
  provider: AiProvider,
  key: string,
  verified: VerifiedKey,
  now: Date,
): StoredCredential {
  return {
    provider,
    key,
    keyLabel: verified.keyLabel,
    summary: verified.summary,
    facts: verified.facts,
    settings: verified.settings,
    voices: verified.voices,
    state: verified.isLowCredit ? 'low_credit' : 'connected',
    verifiedAt: now,
    charactersLeft: verified.charactersLeft,
    lastErrorKind: null,
  };
}

/**
 * Applies a periodic re-verification. A key that stopped working goes to `needs_reconnect`; an unreachable provider
 * changes nothing, since it says nothing about the key.
 */
export function applyReverification(
  stored: StoredCredential,
  outcome: VerificationOutcome,
  now: Date,
): StoredCredential {
  if (outcome.ok) {
    return {
      ...credentialFromVerification(stored.provider, stored.key, outcome, now),
      settings: stored.settings,
    };
  }
  if (outcome.kind === 'unreachable') return stored;
  return { ...stored, state: 'needs_reconnect', lastErrorKind: outcome.kind };
}

/** A real production call was refused (401/403): the service turns red at once, without waiting for the next check. */
export function markRefusedInProduction(stored: StoredCredential, kind: ProviderErrorKind): StoredCredential {
  return { ...stored, state: 'needs_reconnect', lastErrorKind: kind };
}

/** The line of the Services section. `null` means nothing is saved for this provider. */
export function toStatus(
  provider: AiProvider,
  stored: StoredCredential | null,
  source: 'dashboard' | 'environment' | null,
): ProviderStatus {
  const profile = profileOf(provider);
  if (stored === null) {
    return {
      provider,
      state: 'not_connected',
      source,
      keyLabel: null,
      verifiedAt: null,
      message:
        source === 'environment' ? 'Clé lue depuis l’environnement de développement' : profile.withoutIt,
      facts: [],
      settings: {},
      voices: [],
    };
  }
  const message =
    stored.state === 'needs_reconnect'
      ? profile.revoked
      : stored.state === 'low_credit' && stored.charactersLeft !== null
        ? describeLowCredit(stored.charactersLeft)
        : stored.summary;
  return {
    provider,
    state: stored.state,
    source,
    keyLabel: stored.keyLabel,
    verifiedAt: stored.verifiedAt.toISOString(),
    message,
    facts: [...stored.facts],
    settings: stored.settings,
    voices: [...stored.voices],
  };
}
