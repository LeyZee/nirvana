import Fastify, { type FastifyInstance } from 'fastify';

import type { CompositionRoot } from './composition-root.js';

/** Builds the HTTP server. Routes call module entry points only; they hold no business logic (ADR 0004). */
export function buildServer({ config }: CompositionRoot): FastifyInstance {
  const server = Fastify({ logger: config.NODE_ENV === 'test' ? false : { level: config.LOG_LEVEL } });
  server.get('/health', () => ({ status: 'ok' }));
  return server;
}
