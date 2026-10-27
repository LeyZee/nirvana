import { and, eq, schema, sql } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { testConfig } from '../../../__tests__/support/config';
import { signIn } from '../../../__tests__/support/sign-in';
import { createOwner } from '../../../auth';
import { createApp, type App } from '../../../composition-root';
import { createLogger } from '../../../logger';
import { buildServer, type Server } from '../../../server';
import { startBackupsModule } from '../index';

const OWNER = { email: 'owner@example.test', name: 'Owner', password: 'correct horse battery' };
const OPERATOR = { email: 'operator@example.test', name: 'Operator', password: 'staple battery horse' };
const HOUR_MS = 3_600_000;

/** The state of the daily export (ADR 0028 § 5, OPS-02) through the real app and the real tables. */
describe('/v1/backups/status and the 26-hour check', () => {
  let test: TestDb;
  let app: App;
  let server: Server;

  const succeeded = (finishedAt: Date, sha: string) => ({
    startedAt: new Date(finishedAt.getTime() - 60_000),
    finishedAt,
    status: 'succeeded' as const,
    objectKey: `backups/nirvana-${sha.slice(0, 8)}.tar.age`,
    sizeBytes: 4096,
    sha256: sha.repeat(64 / sha.length),
    pgDumpVersion: '16.15',
    rowCounts: { creators: 1, domain_events: 12 },
  });

  /** `domain_events` is append-only: each test reads the alerts of its own day. */
  const overdueEvents = (day: string) =>
    test.admin.db
      .select({ creatorId: schema.domainEvents.creatorId, payload: schema.domainEvents.payload })
      .from(schema.domainEvents)
      .where(and(eq(schema.domainEvents.type, 'backup_overdue'), sql`payload->>'day' = ${day}`));
  const today = () =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    const config = testConfig({ DATABASE_URL: test.appUrl, DATABASE_ADMIN_URL: test.adminUrl });
    app = await createApp(config, createLogger(config));
    server = await buildServer({
      config,
      logger: createLogger(config),
      routes: app.routes,
      readiness: app.readiness,
    });
    await createOwner(app.auth, app.db.db, OWNER);
    const { userId } = await createOwner(app.auth, app.db.db, OPERATOR);
    await test.admin.db.update(schema.user).set({ role: 'operator' }).where(eq(schema.user.id, userId));
  });

  beforeEach(async () => {
    await test.admin.db.execute(sql`delete from backup_runs`);
  });

  afterAll(async () => {
    await server.close();
    await app.shutdown();
    await test.close();
  });

  it('is the owner’s alone', async () => {
    expect((await server.inject({ method: 'GET', url: '/v1/backups/status' })).statusCode).toBe(401);
    const cookie = await signIn(server, OPERATOR.email, OPERATOR.password);
    const operator = await server.inject({ method: 'GET', url: '/v1/backups/status', headers: { cookie } });
    expect(operator.statusCode).toBe(403);
  });

  it('shows the last success and the latest run, without the file’s name or fingerprint', async () => {
    const cookie = await signIn(server, OWNER.email, OWNER.password);
    const status = () => server.inject({ method: 'GET', url: '/v1/backups/status', headers: { cookie } });
    expect((await status()).json()).toEqual({
      state: 'never',
      lastSucceededAt: null,
      overdueAfterHours: 26,
      lastRun: null,
    });

    const finishedAt = new Date(Date.now() - 3 * HOUR_MS);
    await test.admin.db.insert(schema.backupRuns).values(succeeded(finishedAt, 'a'));
    await test.admin.db.insert(schema.backupRuns).values({
      startedAt: new Date(Date.now() - HOUR_MS),
      finishedAt: new Date(Date.now() - HOUR_MS + 5_000),
      status: 'failed',
      error: 'failed at step upload',
    });
    const response = await status();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      state: 'ok',
      lastSucceededAt: finishedAt.toISOString(),
      lastRun: { status: 'failed', error: 'failed at step upload', sizeBytes: null },
    });
    expect(response.body).not.toContain('backups/nirvana-');
    expect(response.body).not.toContain('aaaa');
  });

  it('publishes backup_overdue once for the day, with no creator, when the last success is past 26 hours', async () => {
    const finishedAt = new Date(Date.now() - 30 * HOUR_MS);
    await test.admin.db.insert(schema.backupRuns).values(succeeded(finishedAt, 'b'));
    expect(await app.modules.backups.jobs.check()).toBe('alerted');
    expect(await app.modules.backups.jobs.check()).toBe('already_alerted');
    const events = await overdueEvents(today());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      creatorId: null,
      payload: { lastSucceededAt: finishedAt.toISOString() },
    });
  });

  it('says nothing without any export outside production, and alerts in production', async () => {
    expect(await app.modules.backups.jobs.check()).toBe('ok');
    const day = new Date('2031-01-15T09:00:00Z');
    const production = startBackupsModule({
      db: app.db.db,
      adminDb: app.adminDb.db,
      expectsExports: true,
      clock: { now: () => day },
    });
    expect(await production.jobs.check()).toBe('alerted');
    expect(await overdueEvents('2031-01-15')).toEqual([
      { creatorId: null, payload: { lastSucceededAt: null, day: '2031-01-15' } },
    ]);
  });

  it('refuses a row the service wrote with negative row counts, instead of reading it as a success', async () => {
    await test.admin.db.insert(schema.backupRuns).values({
      ...succeeded(new Date(Date.now() - HOUR_MS), 'c'),
      rowCounts: { creators: -1 },
    });
    await expect(app.modules.backups.status()).rejects.toThrow();
  });
});
