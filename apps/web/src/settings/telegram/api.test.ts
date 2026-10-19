import { CreatorIdSchema, REAUTHENTICATION_ERROR_CODE, TelegramBotIdSchema, newId } from '@nirvana/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReauthRequired } from '../services/api';

import { TelegramOff, addBot, fetchAlertKeywords, fetchOverview, removeBot, saveRoutes } from './api';

const bot = {
  id: newId(TelegramBotIdSchema),
  username: 'demo_alertes_bot',
  displayName: 'Démo Alertes',
  state: 'active',
  lastPolledAt: null,
  chats: [],
};

const calls: { url: string; init: RequestInit | undefined }[] = [];

function answer(status: number, body: unknown): void {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response(body === null ? null : JSON.stringify(body), { status }));
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Telegram API client', () => {
  it('sends the token once, in the body, and reads the bot or the refusal', async () => {
    answer(201, bot);
    expect(await addBot('1234567:FAKE')).toEqual({ ok: true, value: bot });
    expect(calls[0]?.url).toBe('/v1/settings/telegram/bots');
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ token: '1234567:FAKE' }));
    answer(422, { kind: 'token_refused', message: 'Telegram ne reconnaît pas ce jeton.' });
    expect(await addBot('1234567:FAKE')).toEqual({
      ok: false,
      refusal: { kind: 'token_refused', message: 'Telegram ne reconnaît pas ce jeton.' },
    });
  });

  it('reads a version conflict on the routes as a refusal', async () => {
    answer(409, { kind: 'routes_version_conflict', message: 'Quelqu’un a changé ces réglages.' });
    expect(await saveRoutes(2, [])).toMatchObject({
      ok: false,
      refusal: { kind: 'routes_version_conflict' },
    });
  });

  it('tells a server without Telegram from one that fails', async () => {
    answer(404, { error: 'Not Found' });
    await expect(fetchOverview()).rejects.toBeInstanceOf(TelegramOff);
    answer(500, null);
    await expect(fetchOverview()).rejects.not.toBeInstanceOf(TelegramOff);
  });

  it('never takes a refused removal for a success', async () => {
    answer(409, { kind: 'routes_version_conflict', message: 'x' });
    await expect(removeBot(bot.id)).rejects.toThrow('DELETE /bots: 409');
  });

  it('asks for the password when the sign-in is too old', async () => {
    answer(403, {
      error: { code: REAUTHENTICATION_ERROR_CODE, message: 'x', details: {}, requestId: 'r1' },
    });
    await expect(removeBot(bot.id)).rejects.toBeInstanceOf(ReauthRequired);
  });

  it('fails loudly on a shape it does not expect', async () => {
    answer(200, { bots: 'nope' });
    await expect(fetchOverview()).rejects.toThrow();
    answer(500, { error: 'boom' });
    await expect(fetchOverview()).rejects.toThrow('GET : 500');
  });

  it('reads the alert words of a creator, none before her first version', async () => {
    answer(200, { creatorId: newId(CreatorIdSchema), latest: null, versions: [] });
    expect(await fetchAlertKeywords(newId(CreatorIdSchema))).toEqual({ words: [], isActive: true });
  });
});
