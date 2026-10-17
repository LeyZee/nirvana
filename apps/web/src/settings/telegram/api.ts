import {
  ApiErrorSchema,
  PersonaOverviewSchema,
  REAUTHENTICATION_ERROR_CODE,
  TelegramBotSchema,
  TelegramDeliveriesSchema,
  TelegramOverviewSchema,
  TelegramRefusalSchema,
  TelegramRoutesSchema,
  TelegramTestResultSchema,
  type CreatorId,
  type TelegramBot,
  type TelegramBotId,
  type TelegramChatId,
  type TelegramDelivery,
  type TelegramOverview,
  type TelegramRefusal,
  type TelegramRoute,
} from '@nirvana/contracts';

import { ReauthRequired } from '../services/api';

/**
 * `/v1/settings/telegram` (fiche P3-07). The bot token goes up once, in the body of `POST /bots` or
 * `PUT /bots/:id/token`; no answer ever brings it back. Every answer is parsed with the contract.
 */

const BASE = '/v1/settings/telegram';
const JSON_HEADERS = { 'content-type': 'application/json' };

export type Outcome<T> = { ok: true; value: T } | { ok: false; refusal: TelegramRefusal };

/** 422 and 409 carry a refusal with its French sentence; anything else that is not 2xx throws. */
async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${BASE}${path}`, { credentials: 'include', ...init });
  if (response.status === 403) {
    const body = ApiErrorSchema.safeParse(await response.json().catch(() => null));
    if (body.success && body.data.error.code === REAUTHENTICATION_ERROR_CODE) throw new ReauthRequired();
  }
  if (!response.ok && response.status !== 422 && response.status !== 409)
    throw new Error(`${init.method ?? 'GET'} ${path}: ${String(response.status)}`);
  return response;
}

async function outcome<T>(response: Response, parse: (body: unknown) => T): Promise<Outcome<T>> {
  const body: unknown = await response.json();
  return response.ok
    ? { ok: true, value: parse(body) }
    : { ok: false, refusal: TelegramRefusalSchema.parse(body) };
}

export async function fetchOverview(): Promise<TelegramOverview> {
  return TelegramOverviewSchema.parse(await (await call('')).json());
}

export async function addBot(token: string): Promise<Outcome<TelegramBot>> {
  const response = await call('/bots', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ token }),
  });
  return outcome(response, (body) => TelegramBotSchema.parse(body));
}

export async function replaceToken(id: TelegramBotId, token: string): Promise<Outcome<TelegramBot>> {
  const response = await call(`/bots/${id}/token`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ token }),
  });
  return outcome(response, (body) => TelegramBotSchema.parse(body));
}

export async function removeBot(id: TelegramBotId): Promise<void> {
  await call(`/bots/${id}`, { method: 'DELETE' });
}

/** Asks the server to watch the bot's updates closely while the sheet waits for a group. */
export async function listen(id: TelegramBotId): Promise<void> {
  await call(`/bots/${id}/listen`, { method: 'POST' });
}

export async function saveRoutes(
  version: number,
  routes: readonly TelegramRoute[],
): Promise<Outcome<{ routes: TelegramRoute[]; version: number }>> {
  const response = await call('/routes', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ version, routes }),
  });
  return outcome(response, (body) => TelegramRoutesSchema.parse(body));
}

export async function sendTest(chatId: TelegramChatId): Promise<Outcome<{ sentAt: string }>> {
  const response = await call(`/chats/${chatId}/test`, { method: 'POST' });
  return outcome(response, (body) => TelegramTestResultSchema.parse(body));
}

export async function fetchDeliveries(limit = 50): Promise<TelegramDelivery[]> {
  const response = await call(`/deliveries?limit=${String(limit)}`);
  return TelegramDeliveriesSchema.parse(await response.json()).deliveries;
}

/**
 * The alert words of a creator, from her newest persona version (`notifications.alert_keywords`). Edited on her
 * Persona page, never here: one place per piece of data.
 */
export async function fetchAlertKeywords(creatorId: CreatorId): Promise<string[]> {
  const response = await fetch(`/v1/creators/${encodeURIComponent(creatorId)}/persona`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`GET persona: ${String(response.status)}`);
  const { latest } = PersonaOverviewSchema.parse(await response.json());
  return latest?.persona.notifications.alert_keywords ?? [];
}
