import {
  ApiErrorSchema,
  ProviderOverviewSchema,
  REAUTHENTICATION_ERROR_CODE,
  ProviderRefusalSchema,
  ProviderStatusSchema,
  type AiProvider,
  type ProviderOverview,
  type ProviderRefusal,
  type ProviderSettings,
  type ProviderStatus,
} from '@nirvana/contracts';

import { fetchCurrentUser, signIn, type SignInResult } from '../../auth/session';

/**
 * `/v1/settings/providers` (fiche P3-03). The key goes up once, in the body of `PUT …/key`; no answer ever brings
 * it back. Every answer is parsed with the contract: a shape the page does not expect is an error, not a guess.
 */

const BASE = '/v1/settings/providers';
const JSON_HEADERS = { 'content-type': 'application/json' };

/**
 * Connecting, replacing or removing a key asks for a sign-in under 10 minutes (ADR 0016): the page asks for the
 * password (`confirmPassword`), then runs the action again.
 */
export class ReauthRequired extends Error {
  constructor() {
    super('Mot de passe à confirmer');
    this.name = 'ReauthRequired';
  }
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${BASE}${path}`, { credentials: 'include', ...init });
  if (response.status === 403) {
    const body = ApiErrorSchema.safeParse(await response.json().catch(() => null));
    if (body.success && body.data.error.code === REAUTHENTICATION_ERROR_CODE) throw new ReauthRequired();
  }
  if (!response.ok && response.status !== 422)
    throw new Error(`${init.method ?? 'GET'} ${path}: ${String(response.status)}`);
  return response;
}

/** Signs in again as the current user: a fresh session, so the key action can be retried. */
export async function confirmPassword(password: string): Promise<SignInResult> {
  const user = await fetchCurrentUser();
  if (user === null) return 'wrong_credentials';
  return signIn(user.email, password);
}

export async function fetchOverview(): Promise<ProviderOverview> {
  return ProviderOverviewSchema.parse(await (await call('')).json());
}

export type ConnectResult = { ok: true; status: ProviderStatus } | { ok: false; refusal: ProviderRefusal };

export async function connectKey(provider: AiProvider, key: string): Promise<ConnectResult> {
  const response = await call(`/${provider}/key`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ key }),
  });
  const body: unknown = await response.json();
  return response.status === 422
    ? { ok: false, refusal: ProviderRefusalSchema.parse(body) }
    : { ok: true, status: ProviderStatusSchema.parse(body) };
}

export async function verifyNow(provider: AiProvider): Promise<ProviderStatus> {
  return ProviderStatusSchema.parse(await (await call(`/${provider}/verify`, { method: 'POST' })).json());
}

export async function saveSettings(
  provider: AiProvider,
  settings: ProviderSettings,
): Promise<ProviderStatus> {
  const response = await call(`/${provider}/settings`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(settings),
  });
  return ProviderStatusSchema.parse(await response.json());
}

export async function disconnect(provider: AiProvider): Promise<ProviderStatus> {
  return ProviderStatusSchema.parse(await (await call(`/${provider}`, { method: 'DELETE' })).json());
}
