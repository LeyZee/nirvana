import {
  DomainError,
  err,
  ok,
  ProviderSettingsSchema,
  type AiProvider,
  type ProviderErrorKind,
  type ProviderRefusal,
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
    super('provider_invalid', `Service inconnu : ${provider}`);
  }
}

export class ProviderNotConnected extends DomainError {
  constructor(provider: AiProvider) {
    super('provider_key_not_found', `Aucune clé enregistrée pour ${provider}`);
  }
}

class VoiceNotOnAccount extends DomainError {
  constructor() {
    super('provider_voice_invalid', 'Cette voix n’existe pas sur le compte ElevenLabs');
  }
}

class ProviderBusy extends DomainError {
  constructor(provider: AiProvider) {
    super('provider_conflict', `La clé de ${provider} vient de changer, réessaie`);
  }
}

/** A status write that lost to a concurrent change is re-read and re-applied this many times at most. */
const UPDATE_ATTEMPTS = 3;

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
export type ConnectRefusal = ProviderRefusal;

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

/**
 * « Vérifier maintenant » and the 15-minute job. Only a real refusal turns the service red. The check takes
 * seconds: if the key was replaced or disconnected meanwhile, that change wins and the result is dropped.
 */
export async function reverifyProvider(deps: ConnectionsDeps, provider: AiProvider): Promise<ProviderStatus> {
  const stored = await deps.store.find(provider);
  if (stored === null) return statusOf(deps, provider, null);
  if (stored.key === null) return toStatus(provider, stored, 'dashboard');
  const outcome = await verifierFor(deps, provider).verify(stored.key, stored.settings);
  const next = applyReverification(stored, outcome, deps.clock.now());
  if (next === stored) return toStatus(provider, stored, 'dashboard');
  if (await deps.store.update(next)) {
    await changed(deps, provider);
    return toStatus(provider, next, 'dashboard');
  }
  const current = await deps.store.find(provider);
  return current === null ? statusOf(deps, provider, null) : toStatus(provider, current, 'dashboard');
}

export async function reverifyAll(deps: ConnectionsDeps): Promise<readonly ProviderStatus[]> {
  const saved = await deps.store.list();
  return Promise.all(saved.map((credential) => reverifyProvider(deps, credential.provider)));
}

/** How long a saved key the provider just accepted stays trusted against refusals reported for it. */
const CONFIRMED_KEY_TRUST_MS = 60_000;

export type RefusalReporter = (provider: AiProvider, kind: ProviderErrorKind) => Promise<void>;

/**
 * The gateway saw a 401 or 403 on a real call (point 2). The refusal may come from a key replaced since: another
 * process keeps the old one in memory up to its next reload (30 s), and a key changed because it leaked is exactly
 * the one the provider refuses. So the saved key is checked once with the provider before the line turns red:
 * - accepted: the refusal was the old key's, nothing changes (and that answer holds for a minute);
 * - refused: the line turns red now, with the provider's own reason;
 * - unreachable or rate-limited: nothing is concluded, the 15-minute check will tell.
 * One check at a time per service, however many refusals arrive meanwhile.
 */
export function createRefusalReporter(deps: ConnectionsDeps): RefusalReporter {
  const running = new Map<AiProvider, Promise<void>>();
  const trusted = new Map<AiProvider, { readonly revision: number; readonly until: number }>();

  async function confirm(provider: AiProvider): Promise<void> {
    const stored = await deps.store.find(provider);
    if (stored === null || stored.state === 'needs_reconnect') return;
    const key = stored.key;
    if (key === null) return;
    const trust = trusted.get(provider);
    const now = deps.clock.now().getTime();
    if (trust?.revision === stored.revision && trust.until > now) return;
    const outcome = await verifierFor(deps, provider).verify(key, stored.settings);
    if (outcome.ok) {
      trusted.set(provider, { revision: stored.revision, until: now + CONFIRMED_KEY_TRUST_MS });
      return;
    }
    if (outcome.kind === 'unreachable') return;
    if (await deps.store.update(markRefusedInProduction(stored, outcome.kind))) await changed(deps, provider);
  }

  return (provider) => {
    const pending = running.get(provider);
    if (pending !== undefined) return pending;
    const check = confirm(provider).finally(() => {
      running.delete(provider);
    });
    running.set(provider, check);
    return check;
  };
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
  for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt += 1) {
    const stored = await deps.store.find(provider);
    if (stored === null) throw new ProviderNotConnected(provider);
    const voice = settings.voice;
    if (voice !== undefined && !stored.voices.some((v) => v.id === voice.id)) throw new VoiceNotOnAccount();
    const next = { ...stored, settings: ProviderSettingsSchema.parse({ ...stored.settings, ...settings }) };
    if (await deps.store.update(next)) {
      await changed(deps, provider);
      return toStatus(provider, next, 'dashboard');
    }
  }
  throw new ProviderBusy(provider);
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
