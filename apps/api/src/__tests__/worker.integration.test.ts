import { createDbClient } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';

import { createApp, type App } from '../composition-root';
import { createLogger } from '../logger';
import { checkReadiness } from '../readiness';
import { buildServer } from '../server';
import { startWorker, type WorkerHandle } from '../worker-runner';

import { testConfig } from './support/config';
import { LogSink } from './support/log-sink';

const EchoLineSchema = z.looseObject({ seq: z.number(), at: z.number() });

function echoes(sink: LogSink, msg: 'echo started' | 'echo finished'): z.infer<typeof EchoLineSchema>[] {
  return sink.withMessage(msg).map((line) => EchoLineSchema.parse(line));
}

describe('worker (Graphile, ADR 0006)', () => {
  let test: TestDb;
  let app: App;
  let worker: WorkerHandle;
  const sink = new LogSink();

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    const config = testConfig({
      LOG_LEVEL: 'info',
      DATABASE_URL: test.appUrl,
      DATABASE_ADMIN_URL: test.adminUrl,
    });
    const logger = createLogger(config, sink);
    app = await createApp(config, logger);
    worker = await startWorker(app, {
      logger,
      concurrency: 5,
      release: 'test',
      cronJobs: [],
      heartbeatIntervalMs: 500,
    });
  });

  afterAll(async () => {
    await worker.stop();
    await app.shutdown();
    await test.close();
  });

  it('runs the jobs of one conversation queue in order, never two at once', async () => {
    for (let seq = 0; seq < 10; seq += 1) {
      await app.jobs.enqueue(
        'demo.echo',
        { seq, delayMs: 40, correlationId: 'serial' },
        { queueName: 'conv:x' },
      );
    }
    await sink.waitFor('echo finished', 10);
    const started = echoes(sink, 'echo started');
    const finished = echoes(sink, 'echo finished');
    expect(started.map((line) => line.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (let index = 1; index < 10; index += 1) {
      // Disjoint: each job starts after the previous one finished, despite a concurrency of 5.
      expect(started[index]!.at).toBeGreaterThanOrEqual(finished[index - 1]!.at);
    }
  });

  it('keeps only the last of five jobs sharing a job key', async () => {
    const before = echoes(sink, 'echo finished').length;
    const runAt = new Date(Date.now() + 1_000);
    for (let seq = 100; seq < 105; seq += 1) {
      await app.jobs.enqueue(
        'demo.echo',
        { seq, correlationId: 'debounce' },
        { queueName: 'conv:y', jobKey: 'demo.echo:y', runAt },
      );
    }
    await sink.waitFor('echo finished', before + 1);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const debounced = echoes(sink, 'echo finished').filter((line) => line.seq >= 100);
    expect(debounced.map((line) => line.seq)).toEqual([104]);
  });

  it('carries the request id from the route to the job logs', async () => {
    const config = testConfig({ DATABASE_URL: test.appUrl, DATABASE_ADMIN_URL: test.adminUrl });
    const server = await buildServer({
      config,
      logger: createLogger(config),
      routes: app.routes,
      readiness: app.readiness,
    });
    const response = await server.inject({
      method: 'POST',
      url: '/v1/demo/echo',
      payload: { seq: 200, queue: 'corr' },
      headers: { 'x-request-id': 'req-corr-1' },
    });
    expect(response.statusCode).toBe(202);
    const lines = await sink.waitFor('echo finished', echoes(sink, 'echo finished').length + 1);
    expect(lines.at(-1)).toMatchObject({ seq: 200, correlationId: 'req-corr-1', task: 'demo.echo' });
    await server.close();
  });

  it('is ready with a fresh heartbeat, not ready once it is 90 s old or gone', async () => {
    expect(await app.readiness()).toEqual({
      isReady: true,
      checks: { database: true, migrations: true, worker: true },
    });

    await worker.stop();
    expect((await app.readiness()).checks.worker).toBe(false);

    const heartbeatAged = async (seconds: number): Promise<boolean> => {
      await test.admin.db.execute(sql`delete from worker_heartbeats`);
      await test.admin.db.execute(sql`
        insert into worker_heartbeats (worker_id, hostname, version, last_seen_at)
        values ('other', 'host', 'test', now() - make_interval(secs => ${seconds}))
      `);
      return (await app.readiness()).checks.worker;
    };
    expect(await heartbeatAged(30)).toBe(true);
    expect(await heartbeatAged(91)).toBe(false);
  });

  it('reports the database as down when it cannot be reached', async () => {
    const unreachable = createDbClient('postgres://nirvana_app:x@127.0.0.1:1/none', {
      connectionTimeoutMillis: 500,
    });
    unreachable.pool.on('error', () => undefined);
    const readiness = await checkReadiness(unreachable.db, unreachable.db);
    expect(readiness).toEqual({
      isReady: false,
      checks: { database: false, migrations: false, worker: false },
    });
    await unreachable.close();
  });
});
