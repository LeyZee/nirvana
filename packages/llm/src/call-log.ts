import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { LlmRole, ProviderId } from './config';

export const CALL_OUTCOMES = [
  'ok',
  'invalid_output',
  'refused',
  'timeout',
  'rate_limited',
  'auth',
  'unavailable',
  'missing_key',
  'unknown_model',
  'unsupported_input',
  'prompt_leak',
  'error',
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

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
  /** Who paid for it: the real cost per creator, conversation and draft (llm_calls). */
  readonly creatorId?: string;
  readonly conversationId?: string;
  readonly draftId?: string;
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

/**
 * Where the journal is kept for good: the llm_calls table, written by the app. The gateway never waits on it:
 * the daily cap is read from memory, filled at start-up with the calls of the day so a restart forgets nothing.
 */
export interface LlmCallStore {
  insert(record: LlmCallRecord): Promise<void>;
  /** Every call since `from`, all creators and the playground together: the daily cap is one for the app. */
  listSince(from: Date): Promise<readonly LlmCallRecord[]>;
}

/** A journal that writes through to `store` and starts from the calls already made since `from`. */
export async function createPersistentCallLog(
  store: LlmCallStore,
  options: { readonly from: Date; readonly onError: (error: unknown, record: LlmCallRecord) => void },
): Promise<LlmCallLog> {
  const memory = createInMemoryCallLog(50_000);
  for (const record of await store.listSince(options.from)) memory.append(record);
  return {
    append(record) {
      memory.append(record);
      // A lost row costs a line of history, never the call: the cap still counts it in memory.
      store.insert(record).catch((error: unknown) => {
        options.onError(error, record);
      });
    },
    since: (from) => memory.since(from),
  };
}
