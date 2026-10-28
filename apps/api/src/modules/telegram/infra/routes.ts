import {
  DomainError,
  SaveTelegramRoutesBodySchema,
  SaveTelegramTokenBodySchema,
  TelegramBotIdSchema,
  TelegramBotSchema,
  TelegramChatIdSchema,
  TelegramDeliveriesSchema,
  TelegramOverviewSchema,
  TelegramRefusalSchema,
  TelegramRoutesSchema,
  TelegramTestResultSchema,
  TelegramTopicSchema,
} from '@nirvana/contracts';
import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { TelegramApi } from '../application/api';

export interface TelegramRoutesOptions {
  /** `requireRole('owner')`: bots and routing are agency settings. */
  readonly guard: preHandlerAsyncHookHandler;
  /** `requireRecentLogin` (ADR 0016): adding, replacing or removing a bot needs a sign-in under 10 minutes. */
  readonly recentLogin: preHandlerAsyncHookHandler;
}

const BotParamsSchema = z.object({ id: TelegramBotIdSchema });
const ChatParamsSchema = z.object({ id: TelegramChatIdSchema });

/** In the common error body (api.md § Erreurs), so a refusal reads like any other and never fails its own schema. */
const botNotFound = () => new DomainError('telegram_bot_not_found', 'Bot Telegram introuvable');
const chatNotFound = () => new DomainError('telegram_chat_not_found', 'Groupe Telegram introuvable');

/**
 * `/v1/settings/telegram` (task P3-07). No answer ever carries a token; the request body is redacted from the logs
 * (`*.body`, logger.ts).
 */
export function createTelegramRoutes(
  telegram: TelegramApi,
  options: TelegramRoutesOptions,
): FastifyPluginAsyncZod {
  return (app) => {
    app.addHook('preValidation', options.guard);

    app.get('/settings/telegram', { schema: { response: { 200: TelegramOverviewSchema } } }, () =>
      telegram.overview(),
    );

    app.post(
      '/settings/telegram/bots',
      {
        preHandler: options.recentLogin,
        schema: {
          body: SaveTelegramTokenBodySchema,
          response: { 201: TelegramBotSchema, 422: TelegramRefusalSchema },
        },
      },
      async (request, reply) => {
        const result = await telegram.addBot(request.body.token);
        return result.ok ? reply.code(201).send(result.value) : reply.code(422).send(result.error);
      },
    );

    app.put(
      '/settings/telegram/bots/:id/token',
      {
        preHandler: options.recentLogin,
        schema: {
          params: BotParamsSchema,
          body: SaveTelegramTokenBodySchema,
          response: { 200: TelegramBotSchema, 422: TelegramRefusalSchema },
        },
      },
      async (request, reply) => {
        const result = await telegram.replaceToken(request.params.id, request.body.token);
        if (result === null) throw botNotFound();
        return result.ok ? reply.send(result.value) : reply.code(422).send(result.error);
      },
    );

    app.post(
      '/settings/telegram/bots/:id/listen',
      { schema: { params: BotParamsSchema, response: { 202: z.null() } } },
      async (request, reply) => {
        if (!(await telegram.listen(request.params.id))) throw botNotFound();
        return reply.code(202).send(null);
      },
    );

    app.delete(
      '/settings/telegram/bots/:id',
      {
        preHandler: options.recentLogin,
        schema: { params: BotParamsSchema, response: { 204: z.null() } },
      },
      async (request, reply) => {
        if (!(await telegram.removeBot(request.params.id))) throw botNotFound();
        return reply.code(204).send(null);
      },
    );

    app.post(
      '/settings/telegram/chats/:id/test',
      {
        schema: {
          params: ChatParamsSchema,
          response: { 200: TelegramTestResultSchema, 422: TelegramRefusalSchema },
        },
      },
      async (request, reply) => {
        const result = await telegram.sendTest(request.params.id);
        if (result === null) throw chatNotFound();
        return result.ok ? reply.send(result.value) : reply.code(422).send(result.error);
      },
    );

    app.put(
      '/settings/telegram/routes',
      {
        schema: {
          body: SaveTelegramRoutesBodySchema,
          response: { 200: TelegramRoutesSchema, 409: TelegramRefusalSchema },
        },
      },
      async (request, reply) => {
        const result = await telegram.saveRoutes(request.body.version, request.body.routes);
        if (result.ok) return reply.send(result.value);
        if (result.error === 'unknown_chat') {
          throw new DomainError('telegram_chat_invalid', 'Un groupe choisi n’existe plus : recharge la page');
        }
        return reply.code(409).send(result.error);
      },
    );

    app.get(
      '/settings/telegram/deliveries',
      {
        schema: {
          querystring: z.object({
            topic: TelegramTopicSchema.optional(),
            limit: z.coerce.number().int().min(1).max(200).default(50),
          }),
          response: { 200: TelegramDeliveriesSchema },
        },
      },
      async (request) => ({
        deliveries: await telegram.listDeliveries(request.query.topic ?? null, request.query.limit),
      }),
    );

    return Promise.resolve();
  };
}
