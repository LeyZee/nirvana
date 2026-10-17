/** Public entry point of the `telegram` module (ADR 0002, ADR 0020). Other modules import this file only. */
import type { TelegramBotId, TelegramChatId } from '@nirvana/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { TelegramApi } from './application/api';
import { flushChat, type FlushDeps } from './application/flush';
import { dispatchPolls, pollBot } from './application/poll';
import { scanEvents } from './application/scan';
import {
  addBot,
  listDeliveries,
  listen,
  morningDigest,
  nightCounts,
  overview,
  purge,
  removeBot,
  replaceToken,
  saveRoutes,
  sendTest,
} from './application/settings';
import type { BotsStore, Clock, DeliveriesStore, NotificationChannel } from './domain/ports';
import type { ScannedEvent } from './domain/signals';
import { createTelegramRoutes, type TelegramRoutesOptions } from './infra/routes';

export { SCANNED_EVENT_TYPES } from './domain/classify';

export interface TelegramDeps {
  readonly bots: BotsStore;
  readonly deliveries: DeliveriesStore;
  readonly channel: NotificationChannel;
  readonly clock?: Clock;
  /** WEB_ORIGIN: the links of the messages open the CRM. */
  readonly webOrigin: string;
  /** An urgent alert no group can receive (ADR 0020 §12): the caller logs it as an error. */
  readonly onUncovered?: (event: ScannedEvent) => void;
  /** Re-seals the tokens with the newest key at start (rotation); absent in tests. */
  readonly resealTokens?: () => Promise<number>;
}

/** The job handlers, one per `telegram.*` job (TELEGRAM_JOB_PAYLOADS); the worker wires them. */
interface TelegramJobs {
  scan(): Promise<number>;
  flushChat(chatId: TelegramChatId): Promise<void>;
  dispatchPolls(): Promise<number>;
  pollUpdates(botId: TelegramBotId, waitSeconds: number): Promise<void>;
  morningDigest(): Promise<number>;
  purge(): Promise<number>;
}

export interface TelegramModule extends TelegramApi {
  readonly name: 'telegram';
  readonly jobs: TelegramJobs;
  /** Re-seals tokens left on an older encryption key; call once at start-up. Returns how many were rewritten. */
  readonly start: () => Promise<number>;
  /** `/v1/settings/telegram`, behind the guards given here. */
  readonly routes: (options: TelegramRoutesOptions) => FastifyPluginAsyncZod;
}

export function createTelegramModule(deps: TelegramDeps): TelegramModule {
  const clock = deps.clock ?? { now: () => new Date() };
  const base: FlushDeps = { bots: deps.bots, deliveries: deps.deliveries, channel: deps.channel, clock };
  const api: TelegramApi = {
    overview: () => overview(base),
    addBot: (token) => addBot(base, token),
    replaceToken: (id, token) => replaceToken(base, id, token),
    removeBot: (id) => removeBot(base, id),
    listen: (id) => listen(base, id),
    saveRoutes: (version, routes) => saveRoutes(base, version, routes),
    sendTest: (chatId) => sendTest(base, chatId),
    listDeliveries: (topic, limit) => listDeliveries(base, topic, limit),
    nightCounts: (creatorId) => nightCounts(base, creatorId),
  };
  return {
    ...api,
    name: 'telegram',
    jobs: {
      scan: () =>
        scanEvents({
          ...base,
          webOrigin: deps.webOrigin,
          onUncovered: deps.onUncovered ?? (() => undefined),
        }),
      flushChat: (chatId) => flushChat(base, chatId),
      dispatchPolls: () => dispatchPolls(base),
      pollUpdates: (botId, waitSeconds) => pollBot(base, botId, waitSeconds),
      morningDigest: () => morningDigest(base),
      purge: () => purge(base),
    },
    start: () => deps.resealTokens?.() ?? Promise.resolve(0),
    routes: (options) => createTelegramRoutes(api, options),
  };
}
