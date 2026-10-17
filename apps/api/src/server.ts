import { randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { DomainError, type ApiError } from '@nirvana/contracts';
import Fastify, {
  LogController,
  type FastifyError,
  type FastifyInstance,
  type FastifyRequest,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type FastifyPluginAsyncZod,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import type { Config } from './config';
import type { Logger } from './logger';
import type { Readiness } from './readiness';

export interface ServerDeps {
  readonly config: Config;
  readonly logger: Logger;
  /** Every module's routes, mounted under `/v1` (api.md). */
  readonly routes: readonly FastifyPluginAsyncZod[];
  readonly readiness: () => Promise<Readiness>;
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const BODY_LIMIT_BYTES = 1_048_576;

/** Reuses the caller's `x-request-id` when it is sane (it ends up in logs), otherwise a fresh one. */
function requestIdFor(request: { headers: Record<string, string | string[] | undefined> }): string {
  const header = request.headers['x-request-id'];
  return typeof header === 'string' && REQUEST_ID.test(header) ? header : randomUUID();
}

/** api.md § Erreurs: the status follows the code's suffix. */
export function statusForCode(code: string): number {
  if (code.endsWith('_not_found')) return 404;
  if (code.endsWith('_invalid')) return 400;
  if (code.endsWith('_forbidden')) return 403;
  if (code.endsWith('_conflict')) return 409;
  if (code.endsWith('_limited')) return 429;
  return 500;
}

function errorBody(
  request: FastifyRequest,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): ApiError {
  return { error: { code, message, details, requestId: request.id } };
}

export type Server = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  Logger,
  ZodTypeProvider
>;

/** Builds the HTTP server without listening, so tests can call it with `inject`. */
export async function buildServer(deps: ServerDeps): Promise<Server> {
  const { config } = deps;
  const server = Fastify({
    loggerInstance: deps.logger,
    genReqId: requestIdFor,
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    bodyLimit: BODY_LIMIT_BYTES,
  }).withTypeProvider<ZodTypeProvider>();

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  server.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await server.register(helmet);
  await server.register(cors, { origin: [config.WEB_ORIGIN], credentials: true });
  await server.register(rateLimit, {
    max: config.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    // The plugin throws a 429; the error handler below gives it the common body, `Retry-After` stays.
  });

  server.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const fields = error.validation.map((issue) => ({
        path: issue.instancePath,
        message: issue.message ?? 'invalide',
      }));
      return reply.code(400).send(errorBody(request, 'request_invalid', 'Requête invalide', { fields }));
    }
    if (error instanceof DomainError) {
      const status = statusForCode(error.code);
      if (status === 500) {
        request.log.error({ err: error }, 'unmapped domain error');
        return reply.code(500).send(errorBody(request, 'internal_error', 'Erreur interne'));
      }
      return reply.code(status).send(errorBody(request, error.code, error.message));
    }
    if (error.statusCode === 429) {
      return reply
        .code(429)
        .send(errorBody(request, 'rate_limited', 'Trop de requêtes, réessaie dans un instant'));
    }
    if (error.statusCode === 413) {
      return reply
        .code(413)
        .send(errorBody(request, 'payload_too_large', 'Corps de requête trop volumineux'));
    }
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      // Malformed JSON, unsupported media type and the like: the client's fault, nothing internal to hide.
      return reply.code(400).send(errorBody(request, 'request_invalid', 'Requête invalide'));
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send(errorBody(request, 'internal_error', 'Erreur interne'));
  });

  server.setNotFoundHandler((request, reply) =>
    reply.code(404).send(errorBody(request, 'route_not_found', 'Route introuvable')),
  );

  // Outside `/v1` (api.md): liveness and readiness, for Coolify and the uptime check.
  server.get('/health', { config: { rateLimit: false } }, () => ({ status: 'ok' }));
  server.get('/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    const readiness = await deps.readiness();
    return reply
      .code(readiness.isReady ? 200 : 503)
      .send({ status: readiness.isReady ? 'ready' : 'not_ready', checks: readiness.checks });
  });

  await server.register(
    async (v1) => {
      for (const routes of deps.routes) await v1.register(routes);
    },
    { prefix: '/v1' },
  );

  return server;
}
