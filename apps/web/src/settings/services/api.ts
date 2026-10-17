import {
  ProviderOverviewSchema,
  ProviderRefusalSchema,
  ProviderStatusSchema,
  type AiProvider,
  type ProviderOverview,
  type ProviderRefusal,
  type ProviderSettings,
  type ProviderStatus,
} from '@nirvana/contracts';

/**
 * `/v1/settings/providers` (fiche P3-03). The key goes up once, in the body of `PUT …/key`; no answer ever brings
 * it back. Every answer is parsed with the contract: a shape the page does not expect is an error, not a guess.
 */

const BASE = '/v1/settings/providers';
const JSON_HEADERS = { 'content-type': 'application/json' };

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${BASE}${path}`, { credentials: 'include', ...init });
  if (!response.ok && response.status !== 422)
    throw new Error(`${init.method ?? 'GET'} ${path}: ${String(response.status)}`);
  return response;
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
