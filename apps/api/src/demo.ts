import { setTimeout as sleep } from 'node:timers/promises';

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Task } from 'graphile-worker';
import { z } from 'zod';

import type { RequireRole } from './auth';
import { DemoEchoPayloadSchema, defineTask, type JobQueue } from './jobs';
import type { Logger } from './logger';

/**
 * P0-04 scaffolding, removed in P0-05 (docs/conventions/hygiene.md): a task that logs its start and end, and the
 * route that enqueues it, so that the serial queue, the debounce and the request → job correlation can be shown
 * on a real Postgres before any business job exists.
 */

export function createDemoEchoTask(logger: Logger): Task {
  return defineTask(
    'demo.echo',
    DemoEchoPayloadSchema,
    logger,
    async ({ seq, delayMs }, { logger: jobLogger }) => {
      jobLogger.info({ seq, at: Date.now() }, 'echo started');
      // Not cut short by a shutdown: a graceful stop lets the job finish (operations.md).
      await sleep(delayMs);
      jobLogger.info({ seq, at: Date.now() }, 'echo finished');
    },
  );
}

const EchoBodySchema = z.object({
  seq: z.number().int().min(0),
  delayMs: z.number().int().min(0).max(10_000).optional(),
  queue: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .default('demo'),
});

export function createDemoRoutes(jobs: JobQueue, requireRole: RequireRole): FastifyPluginAsyncZod {
  return (app) => {
    app.post(
      '/demo/echo',
      {
        preHandler: requireRole('owner', 'operator'),
        schema: {
          body: EchoBodySchema,
          response: { 202: z.object({ jobId: z.string() }) },
        },
      },
      async (request, reply) => {
        const { seq, delayMs, queue } = request.body;
        const job = await jobs.enqueue(
          'demo.echo',
          { seq, delayMs, correlationId: request.id },
          { queueName: `conv:${queue}` },
        );
        return reply.code(202).send(job);
      },
    );
    return Promise.resolve();
  };
}
