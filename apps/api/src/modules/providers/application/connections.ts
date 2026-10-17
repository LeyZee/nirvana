import {
  DomainError,
  err,
  ok,
  ProviderSettingsSchema,
  type AiProvider,
  type ProviderErrorKind,
  type ProviderSettings,
  type ProviderStatus,
  type Result,
} from '@nirvana/contracts';

import { DASHBOARD_PROVIDERS } from '../domain/catalog';
import {
  applyReverification,
  credentialFromVerification,
  markRefusedInProduction,
  toStatus,
} from '../domain/credential';
import { checkKeyShape } from '../domain/key-shape';
import { describeRefusal } from '../domain/messages';
import type { Clock, CredentialStore } from '../domain/ports';
import type { ProviderVerifier } from '../domain/verification';

class ProviderNotSupported extends DomainError {
  constructor(provider: AiProvider) {
    super('provider_not_supported', `no verifier for provider ${provider}`);
  }
}

export class ProviderNotConnected extends DomainError {
  constructor(provider: AiProvider) {
    super('provider_not_connected', `provider ${provider} has no saved key`);
  }
}

export interface ConnectionsDeps {
  readonly store: CredentialStore;
  readonly verifiers: readonly ProviderVerifier[];
  readonly clock: Clock;
  /** Called after every change, so the in-memory key cache and the live stream follow at once. */
  readonly onChange?: (provider: AiProvider) => void | Promise<void>;
  /** Outside production only: whether the environment holds a key for this provider. */
  readonly hasEnvironmentKey?: (provider: AiProvider) => boolean;
}

/** A refusal as the sheet shows it, under the key field. */
export interface ConnectRefusal {
  readonly kind: ProviderErrorKind;
  readonly message: string;
}

function verifierFor(deps: ConnectionsDeps, provider: AiProvider): ProviderVerifier {
  const verifier = deps.verifiers.find((v) => v.provider === provider);
  if (verifier === undefined) throw new ProviderNotSupported(provider);
  return verifier;
}

async function changed(deps: ConnectionsDeps, provider: AiProvider): Promise<void> {
  await deps.onChange?.(provider);
}

/**
 * Connects or replaces a key. The key is saved only once the provider accepted it, so a refused replacement leaves
 * the key in place running (fiche P3-03, point 3).
 */
export async function connectProvider(
  deps: ConnectionsDeps,
  provider: AiProvider,
  rawKey: string,
): Promise<Result<ProviderStatus, ConnectRefusal>> {
  const verifier = verifierFor(deps, provider);
  const shape = checkKeyShape(provider, rawKey);
  if (!shape.ok) {
    const details = shape.error.kind === 'wrong_provider' ? { belongsTo: shape.error.belongsTo } : {};
    return err({ kind: shape.error.kind, message: describeRefusal(provider, shape.error.kind, details) });
  }
  const previous = await deps.store.find(provider);
  const settings = previous?.settings ?? {};
  const outcome = await verifier.verify(shape.value, settings);
  if (!outcome.ok) {
    const details = {
      ...(outcome.availableModels === undefined ? {} : { availableModels: outcome.availableModels }),
      ...(outcome.permission === undefined ? {} : { permission: outcome.permission }),
      ...(settings.visionModel === undefined ? {} : { visionModel: settings.visionModel }),
    };
    return err({ kind: outcome.kind, message: describeRefusal(provider, outcome.kind, details) });
  }
  const credential = credentialFromVerification(provider, shape.value, outcome, deps.clock.now());
  await deps.store.save(credential);
  await changed(deps, provider);
  return ok(toStatus(provider, credential, 'dashboard'));
}

/** « Vérifier maintenant » and the 15-minute job. Only a real refusal turns the service red. */
export async function reverifyProvider(deps: ConnectionsDeps, provider: AiProvider): Promise<ProviderStatus> {
  const stored = await deps.store.find(provider);
  if (stored === null) return statusOf(deps, provider, null);
  const outcome = await verifierFor(deps, provider).verify(stored.key, stored.settings);
  const next = applyReverification(stored, outcome, deps.clock.now());
  if (next !== stored) {
    await deps.store.save(next);
    await changed(deps, provider);
  }
  return toStatus(provider, next, 'dashboard');
}

export async function reverifyAll(deps: ConnectionsDeps): Promise<readonly ProviderStatus[]> {
  const saved = await deps.store.list();
  return Promise.all(saved.map((credential) => reverifyProvider(deps, credential.provider)));
}

/** The gateway saw a 401 or 403 on a real call: the line turns red now, not at the next check (point 2). */
export async function reportRefusedKey(
  deps: ConnectionsDeps,
  provider: AiProvider,
  kind: ProviderErrorKind,
): Promise<void> {
  const stored = await deps.store.find(provider);
  if (stored === null || stored.state === 'needs_reconnect') return;
  await deps.store.save(markRefusedInProduction(stored, kind));
  await changed(deps, provider);
}

export async function disconnectProvider(
  deps: ConnectionsDeps,
  provider: AiProvider,
): Promise<ProviderStatus> {
  await deps.store.remove(provider);
  await changed(deps, provider);
  return statusOf(deps, provider, null);
}

/** The voice picked after connecting ElevenLabs, or another Gemini model; never a key. */
export async function updateProviderSettings(
  deps: ConnectionsDeps,
  provider: AiProvider,
  settings: ProviderSettings,
): Promise<ProviderStatus> {
  const stored = await deps.store.find(provider);
  if (stored === null) throw new ProviderNotConnected(provider);
  const next = { ...stored, settings: ProviderSettingsSchema.parse({ ...stored.settings, ...settings }) };
  await deps.store.save(next);
  await changed(deps, provider);
  return toStatus(provider, next, 'dashboard');
}

function statusOf(deps: ConnectionsDeps, provider: AiProvider, stored: null): ProviderStatus {
  const source = deps.hasEnvironmentKey?.(provider) === true ? 'environment' : null;
  return toStatus(provider, stored, source);
}

/** The Services section, in reading order. */
export async function listProviderStatuses(deps: ConnectionsDeps): Promise<readonly ProviderStatus[]> {
  const saved = await deps.store.list();
  return DASHBOARD_PROVIDERS.map((provider) => {
    const stored = saved.find((c) => c.provider === provider) ?? null;
    return stored === null ? statusOf(deps, provider, null) : toStatus(provider, stored, 'dashboard');
  });
}
