import { BackupStatusSchema, type BackupStatus } from '@nirvana/contracts';
import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export interface BackupsRoutesOptions {
  /** `requireRole('owner')`: the state of the agency's backups is the owner's alone (ADR 0028 § 5). */
  readonly guard: preHandlerAsyncHookHandler;
}

/** `GET /v1/backups/status`: read only, no path or name of the bucket, no fingerprint. */
export function createBackupsRoutes(
  readStatus: () => Promise<BackupStatus>,
  options: BackupsRoutesOptions,
): FastifyPluginAsyncZod {
  return (app) => {
    app.addHook('preHandler', options.guard);
    app.get('/backups/status', { schema: { response: { 200: BackupStatusSchema } } }, () => readStatus());
    return Promise.resolve();
  };
}
