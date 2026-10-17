import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { LlmRole, ProviderId } from './config';

export type CallOutcome =
  | 'ok'
  | 'invalid_output'
  | 'refused'
  | 'timeout'
  | 'rate_limited'
  | 'auth'
  | 'unavailable'
  | 'missing_key'
  | 'error';

/** One provider call. Never holds prompt or message content: only what supervision and costs need. */
export interface LlmCallRecord {
  readonly at: Date;
  readonly role: LlmRole;
  readonly provider: ProviderId;
  readonly model: string;
  readonly promptHash: string;
  readonly outcome: CallOutcome;
  readonly latencyMs: number;
  readonly isFallback: boolean;
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens?: number;
  readonly costUsd?: number;
  readonly errorMessage?: string;
}

/** Journal of calls; the llm_calls table implements it once the database exists (P0-03). */
export interface LlmCallLog {
  append(record: LlmCallRecord): void;
  since(from: Date): readonly LlmCallRecord[];
}

export function createInMemoryCallLog(capacity = 5_000): LlmCallLog {
  const records: LlmCallRecord[] = [];
  return {
    append(record) {
      records.push(record);
      if (records.length > capacity) records.splice(0, records.length - capacity);
    },
    since(from) {
      return records.filter((r) => r.at >= from);
    },
  };
}

/** Keeps the journal in memory and appends each record to a JSONL file (playground, under .scratch/). */
export function createJsonlCallLog(path: string): LlmCallLog {
  const memory = createInMemoryCallLog();
  mkdirSync(dirname(path), { recursive: true });
  return {
    append(record) {
      memory.append(record);
      appendFileSync(path, `${JSON.stringify(record)}\n`);
    },
    since: (from) => memory.since(from),
  };
}
