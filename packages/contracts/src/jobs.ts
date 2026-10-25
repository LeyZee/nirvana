import { z } from 'zod';

import {
  ConversationIdSchema,
  CreatorIdSchema,
  DraftIdSchema,
  FanIdSchema,
  MediaAssetIdSchema,
  PlatformAccountIdSchema,
} from './ids';
import { TELEGRAM_JOB_PAYLOADS } from './telegram';

/**
 * Graphile Worker job names and payloads (ADR 0006). A job that touches a conversation runs on the serial queue
 * `conv:<conversationId>`; a poll runs on `account:<platformAccountId>`, one at a time per account.
 */

const conversationJob = z.object({
  creatorId: CreatorIdSchema,
  conversationId: ConversationIdSchema,
  correlationId: z.string().min(1),
});

export const JOB_NAMES = [
  'conversation.respond',
  'conversation.send',
  'conversation.follow_up',
  'conversation.record_facts',
  'connector.dispatch',
  'connector.poll',
  'connector.reconcile',
  'fans.refresh_summary',
  'fans.purge_facts',
  'media.describe',
  'providers.check_credentials',
  'telegram.scan',
  'telegram.flush_chat',
  'telegram.dispatch_polls',
  'telegram.poll_updates',
  'telegram.morning_digest',
  'telegram.purge',
] as const;
export const JobNameSchema = z.enum(JOB_NAMES);
export type JobName = z.infer<typeof JobNameSchema>;

export const JOB_PAYLOADS = {
  'conversation.respond': conversationJob,
  'conversation.send': conversationJob.extend({ draftId: DraftIdSchema }),
  'conversation.follow_up': conversationJob,
  /**
   * What she learnt about the fan becomes facts (P3-02): the facts the brief proposed for a draft a human approved,
   * or the note a chatter left on giving the conversation back. `at` fixes the note's slot, so a replay rewrites
   * nothing.
   */
  'conversation.record_facts': conversationJob.extend({
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('draft'), draftId: DraftIdSchema }),
      z.object({
        kind: z.literal('operator_note'),
        note: z.string().min(1).max(300),
        at: z.iso.datetime(),
      }),
    ]),
  }),
  'connector.dispatch': z.object({}),
  'connector.poll': z.object({
    creatorId: CreatorIdSchema,
    platformAccountId: PlatformAccountIdSchema,
    correlationId: z.string().min(1),
  }),
  'connector.reconcile': z.object({
    creatorId: CreatorIdSchema,
    platformAccountId: PlatformAccountIdSchema,
    correlationId: z.string().min(1),
  }),
  'fans.refresh_summary': conversationJob.extend({ fanId: FanIdSchema }),
  'fans.purge_facts': z.object({}),
  'media.describe': z.object({
    creatorId: CreatorIdSchema,
    mediaAssetId: MediaAssetIdSchema,
    correlationId: z.string().min(1),
  }),
  'providers.check_credentials': z.object({}),
  ...TELEGRAM_JOB_PAYLOADS,
} as const satisfies Record<JobName, z.ZodType>;

export type JobPayload<J extends JobName> = z.infer<(typeof JOB_PAYLOADS)[J]>;

/**
 * Attempts before Graphile gives a job up (it then stays in its table, counted by `/ready` as dead). Graphile's own
 * default is 25: a rerun of `respond` pays the LLM again, a broken payload would loop for a day. A cron job runs
 * once; the next tick is its retry.
 */
export const JOB_MAX_ATTEMPTS = {
  'conversation.respond': 3,
  'conversation.send': 3,
  'conversation.follow_up': 3,
  'conversation.record_facts': 3,
  'connector.dispatch': 1,
  'connector.poll': 3,
  'connector.reconcile': 3,
  'fans.refresh_summary': 3,
  'fans.purge_facts': 1,
  'media.describe': 3,
  'providers.check_credentials': 1,
  // The scan is also enqueued by the `domain_events` trigger (0006) with 25, and a flush by the module with 10:
  // a scan is idempotent (cursor) and a flush is Telegram's own pace, both cheap to retry.
  'telegram.scan': 25,
  'telegram.flush_chat': 10,
  'telegram.dispatch_polls': 1,
  'telegram.poll_updates': 1,
  'telegram.morning_digest': 1,
  'telegram.purge': 1,
} as const satisfies Record<JobName, number>;

/** Jobs debounced per conversation: a new one replaces the pending one (`jobKeyMode: 'replace'`). */
export const DEBOUNCED_JOBS = [
  'conversation.respond',
  'conversation.follow_up',
  'fans.refresh_summary',
] as const;

export function queueNameFor(conversationId: string): `conv:${string}` {
  return `conv:${conversationId}`;
}

export function accountQueueNameFor(platformAccountId: string): `account:${string}` {
  return `account:${platformAccountId}`;
}

export function jobKeyFor(job: JobName, conversationId: string): string {
  return `${job}:${conversationId}`;
}

/** Seconds between two answers owed when a stop is lifted: the fans who waited are answered one after the other. */
export const RESUME_SPACING_SECONDS = 15;

/**
 * When the answer owed to the fan at `index` (0 = the one who has waited longest) runs after a stop is lifted:
 * the first right away, then one every `RESUME_SPACING_SECONDS`, so that a long stop does not wake every model call
 * and every send at the same second.
 */
export function resumeRunAt(index: number, now: Date): Date {
  return new Date(now.getTime() + index * RESUME_SPACING_SECONDS * 1_000);
}
