import { z } from 'zod';

import {
  ConversationIdSchema,
  CreatorIdSchema,
  DraftIdSchema,
  FanIdSchema,
  MediaAssetIdSchema,
  PlatformAccountIdSchema,
} from './ids';

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
  'connector.dispatch',
  'connector.poll',
  'connector.reconcile',
  'fans.refresh_summary',
  'media.describe',
] as const;
export const JobNameSchema = z.enum(JOB_NAMES);
export type JobName = z.infer<typeof JobNameSchema>;

export const JOB_PAYLOADS = {
  'conversation.respond': conversationJob,
  'conversation.send': conversationJob.extend({ draftId: DraftIdSchema }),
  'conversation.follow_up': conversationJob,
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
  'media.describe': z.object({
    creatorId: CreatorIdSchema,
    mediaAssetId: MediaAssetIdSchema,
    correlationId: z.string().min(1),
  }),
} as const satisfies Record<JobName, z.ZodType>;

export type JobPayload<J extends JobName> = z.infer<(typeof JOB_PAYLOADS)[J]>;

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
