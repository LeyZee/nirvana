import { describe, expect, it } from 'vitest';

import type { BackupOverduePayload, BackupRunsReader } from '../../domain/ports';
import type { BackupRun } from '../../domain/status';
import { checkBackups, readBackupStatus } from '../backups';

const now = new Date('2026-10-27T12:00:00Z');
const clock = { now: () => now };

function reader(
  lastSucceededAt: Date | null,
  latestRun: BackupRun | null = null,
  firstRunStartedAt: Date | null = lastSucceededAt,
): BackupRunsReader {
  return {
    lastSucceededAt: () => Promise.resolve(lastSucceededAt),
    latestRun: () => Promise.resolve(latestRun),
    firstRunStartedAt: () => Promise.resolve(firstRunStartedAt),
  };
}

function alerts() {
  const published: BackupOverduePayload[] = [];
  const days = new Set<string>();
  return {
    published,
    publishOverdue(payload: BackupOverduePayload) {
      if (days.has(payload.day)) return Promise.resolve(false);
      days.add(payload.day);
      published.push(payload);
      return Promise.resolve(true);
    },
  };
}

describe('backups', () => {
  it('gives the owner the state, the last success and the latest run, failed included', async () => {
    const failed: BackupRun = {
      status: 'failed',
      startedAt: new Date('2026-10-27T01:00:00Z'),
      finishedAt: new Date('2026-10-27T01:00:05Z'),
      sizeBytes: null,
      error: 'failed at step upload',
    };
    expect(await readBackupStatus({ runs: reader(new Date('2026-10-26T12:10:00Z'), failed), clock })).toEqual(
      {
        state: 'ok',
        lastSucceededAt: '2026-10-26T12:10:00.000Z',
        overdueAfterHours: 26,
        lastRun: {
          status: 'failed',
          startedAt: '2026-10-27T01:00:00.000Z',
          finishedAt: '2026-10-27T01:00:05.000Z',
          sizeBytes: null,
          error: 'failed at step upload',
        },
      },
    );
    expect(await readBackupStatus({ runs: reader(null), clock })).toMatchObject({
      state: 'never',
      lastRun: null,
    });
  });

  it('alerts once per Paris day while the export is overdue', async () => {
    const sink = alerts();
    const last = new Date('2026-10-26T01:00:00Z');
    const deps = { runs: reader(last), alerts: sink, clock };
    expect(await checkBackups(deps)).toBe('alerted');
    expect(await checkBackups(deps)).toBe('already_alerted');
    expect(sink.published).toEqual([{ lastSucceededAt: last, day: '2026-10-27' }]);
  });

  it('stays quiet when an export succeeded in time, or when the service never ran or just started', async () => {
    const sink = alerts();
    expect(await checkBackups({ runs: reader(new Date('2026-10-27T01:00:00Z')), alerts: sink, clock })).toBe(
      'ok',
    );
    expect(await checkBackups({ runs: reader(null), alerts: sink, clock })).toBe('ok');
    const justDeployed = reader(null, null, new Date('2026-10-27T09:00:00Z'));
    expect(await checkBackups({ runs: justDeployed, alerts: sink, clock })).toBe('ok');
    expect(sink.published).toEqual([]);
    const tryingForTwoDays = reader(null, null, new Date('2026-10-25T09:00:00Z'));
    expect(await checkBackups({ runs: tryingForTwoDays, alerts: sink, clock })).toBe('alerted');
    expect(sink.published).toEqual([{ lastSucceededAt: null, day: '2026-10-27' }]);
  });
});
