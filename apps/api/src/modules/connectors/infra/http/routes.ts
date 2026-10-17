import { timingSafeEqual } from 'node:crypto';

import { ConnectorSessionBodySchema } from '@nirvana/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { ConnectorSessions } from '../../application/sessions';
import { DeviceUnauthenticated } from '../../domain/errors';

const DeviceHeadersSchema = z.looseObject({ 'x-extension-token': z.string().optional() });

/** Constant-time comparison; lengths differ → refused without comparing (the length is not the secret). */
function sameToken(given: string | undefined, expected: string | null): boolean {
  if (given === undefined || expected === null) return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * `POST /v1/connector/sessions`: the extension's « Sync » (connectors.md). Authenticated by the device token
 * (`x-extension-token`), not by a dashboard session, and exempt from the dashboard's Origin check: the extension
 * has its own origin. The body is never logged nor echoed.
 */
export function createConnectorRoutes(
  sessions: ConnectorSessions,
  deviceToken: string | null,
): FastifyPluginAsyncZod {
  return (app) => {
    app.post(
      '/connector/sessions',
      {
        config: { originCheck: false },
        schema: { headers: DeviceHeadersSchema, body: ConnectorSessionBodySchema },
      },
      async (request, reply) => {
        if (!sameToken(request.headers['x-extension-token'], deviceToken)) throw new DeviceUnauthenticated();
        await sessions.store({
          platformAccountId: request.body.platformAccountId,
          session: request.body.session,
          correlationId: request.id,
        });
        return reply.code(204).send();
      },
    );
    return Promise.resolve();
  };
}
