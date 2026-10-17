import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createApp, type App } from '../composition-root';
import type { Config } from '../config';
import { createLogger } from '../logger';

import { testConfig } from './support/config';
import { LogSink } from './support/log-sink';

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TSX = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));

describe('graceful shutdown (operations.md)', () => {
  let test: TestDb;
  let app: App;
  let config: Config;

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    config = testConfig({ DATABASE_URL: test.appUrl, DATABASE_ADMIN_URL: test.adminUrl });
    app = await createApp(config, createLogger(config));
  });

  afterAll(async () => {
    await app.shutdown();
    await test.close();
  });

  it('lets the running job finish on SIGTERM, then exits with code 0', async () => {
    const child = spawn(TSX, ['src/worker.ts'], {
      cwd: API_ROOT,
      env: {
        PATH: process.env['PATH'],
        LOG_LEVEL: 'info',
        DATABASE_URL: test.appUrl,
        DATABASE_ADMIN_URL: test.adminUrl,
        WEB_ORIGIN: config.WEB_ORIGIN,
        AUTH_SECRET: config.AUTH_SECRET,
        AUTH_BASE_URL: config.AUTH_BASE_URL,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = new LogSink();
    child.stdout.on('data', (chunk: Buffer) => {
      output.collect(chunk.toString());
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    const exited = new Promise<number | null>((resolve) =>
      child.once('exit', (code) => {
        resolve(code);
      }),
    );

    await output.waitFor('worker started', 1, 20_000).catch((error: unknown) => {
      throw new Error(`worker did not start: ${stderr}`, { cause: error });
    });
    await app.jobs.enqueue(
      'demo.echo',
      { seq: 1, delayMs: 1_500, correlationId: 'sigterm' },
      { queueName: 'conv:z' },
    );
    await output.waitFor('echo started');
    child.kill('SIGTERM');

    expect(await exited, stderr).toBe(0);
    const messages = output.lines.map((line) => line.msg);
    expect(messages).toContain('echo finished');
    expect(messages.indexOf('echo finished')).toBeLessThan(messages.indexOf('shutdown complete'));
  });
});
