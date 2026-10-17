import Fastify, { type FastifyInstance } from 'fastify';

import type { Config } from './config';

/** Builds the HTTP server without listening, so tests can call it with `inject`. */
export function buildServer(config: Config): FastifyInstance {
  const server = Fastify({ logger: { level: config.LOG_LEVEL } });
  server.get('/health', () => ({ status: 'ok' }));
  return server;
}
