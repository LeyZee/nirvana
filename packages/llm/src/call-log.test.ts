import { describe, expect, it } from 'vitest';

import { createPersistentCallLog, type LlmCallRecord, type LlmCallStore } from './call-log';

const call = (at: string, costUsd: number): LlmCallRecord => ({
  at: new Date(at),
  role: 'voice',
  provider: 'xai',
  model: 'grok-4.7',
  promptHash: 'h',
  outcome: 'ok',
  latencyMs: 500,
  isFallback: false,
  costUsd,
  creatorId: 'creator-1',
});

function store(kept: LlmCallRecord[], failing = false): LlmCallStore {
  return {
    insert: (record) => {
      if (failing) return Promise.reject(new Error('database down'));
      kept.push(record);
      return Promise.resolve();
    },
    listSince: (from) => Promise.resolve(kept.filter((r) => r.at >= from)),
  };
}

describe('createPersistentCallLog', () => {
  it('starts from the calls of the day, so a restart forgets nothing of the cap', async () => {
    const kept = [call('2026-10-16T21:00:00Z', 9), call('2026-10-17T08:00:00Z', 3)];
    const log = await createPersistentCallLog(store(kept), {
      from: new Date('2026-10-16T22:00:00Z'),
      onError: () => undefined,
    });
    expect(log.since(new Date(0)).map((r) => r.costUsd)).toEqual([3]);
  });

  it('writes each call through to the store', async () => {
    const kept: LlmCallRecord[] = [];
    const log = await createPersistentCallLog(store(kept), { from: new Date(0), onError: () => undefined });
    log.append(call('2026-10-17T09:00:00Z', 1));
    await Promise.resolve();
    expect(kept).toHaveLength(1);
  });

  it('keeps counting a call the store could not write, and says so', async () => {
    const errors: unknown[] = [];
    const log = await createPersistentCallLog(store([], true), {
      from: new Date(0),
      onError: (error) => errors.push(error),
    });
    log.append(call('2026-10-17T09:00:00Z', 1));
    await new Promise((resolve) => setImmediate(resolve));
    expect(log.since(new Date(0))).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });
});
