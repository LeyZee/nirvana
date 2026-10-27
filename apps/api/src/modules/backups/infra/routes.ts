import {
  BackupStatusSchema,
  RecordRestoreTestBodySchema,
  RestoreTestSchema,
  type BackupStatus,
  type RestoreTest,
} from '@nirvana/contracts';
import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { z } from 'zod';

import type { RestoreTestActor } from '../domain/ports';

export interface BackupsRoutesOptions {
  /** `requireRole('owner')`: the state of the agency's backups is the owner's alone (ADR 0028 § 5). */
  readonly guard: preHandlerAsyncHookHandler;
  /** `requireRecentLogin`: entering a restore test, which opens the pay (EQ-17), needs a sign-in under 10 minutes. */
  readonly recentLogin: preHandlerAsyncHookHandler;
}

export interface BackupsRoutesApi {
  readonly status: () => Promise<BackupStatus>;
  readonly recordRestoreTest: (
    body: z.output<typeof RecordRestoreTestBodySchema>,
    actor: RestoreTestActor,
  ) => Promise<{ readonly created: boolean; readonly test: RestoreTest }>;
}

/**
 * `GET /v1/backups/status`: read only, no path or name of the bucket, no fingerprint of the exports.
 * `POST /v1/backups/restore-tests`: the owner enters the quarterly restore test (ADR 0028 § 6).
 */
export function createBackupsRoutes(
  api: BackupsRoutesApi,
  options: BackupsRoutesOptions,
): FastifyPluginAsyncZod {
  return (app) => {
    app.addHook('preHandler', options.guard);
    app.get('/backups/status', { schema: { response: { 200: BackupStatusSchema } } }, () => api.status());
    app.post(
      '/backups/restore-tests',
      {
        preHandler: options.recentLogin,
        schema: {
          body: RecordRestoreTestBodySchema,
          response: { 200: RestoreTestSchema, 201: RestoreTestSchema },
        },
      },
      async (request, reply) => {
        if (request.user === null) throw new Error('requireRole ran without a user');
        const { created, test } = await api.recordRestoreTest(request.body, {
          userId: request.user.id,
          ip: request.ip,
        });
        return reply.code(created ? 201 : 200).send(test);
      },
    );
    return Promise.resolve();
  };
}
