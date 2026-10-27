import { v7 } from 'uuid';
import { z } from 'zod';

/**
 * Application-generated UUID v7 identifiers (ADR 0011): sortable by time, branded so a `FanId` cannot be passed
 * where a `ConversationId` is expected. Platform identifiers stay opaque strings in `platform_<x>_id` fields.
 */
const uuid = z.uuid();

export const CreatorIdSchema = uuid.brand<'CreatorId'>();
export type CreatorId = z.infer<typeof CreatorIdSchema>;

export const PlatformAccountIdSchema = uuid.brand<'PlatformAccountId'>();
export type PlatformAccountId = z.infer<typeof PlatformAccountIdSchema>;

export const FanIdSchema = uuid.brand<'FanId'>();
export type FanId = z.infer<typeof FanIdSchema>;

export const ConversationIdSchema = uuid.brand<'ConversationId'>();
export type ConversationId = z.infer<typeof ConversationIdSchema>;

export const MessageIdSchema = uuid.brand<'MessageId'>();
export type MessageId = z.infer<typeof MessageIdSchema>;

export const DraftIdSchema = uuid.brand<'DraftId'>();
export type DraftId = z.infer<typeof DraftIdSchema>;

export const MediaAssetIdSchema = uuid.brand<'MediaAssetId'>();
export type MediaAssetId = z.infer<typeof MediaAssetIdSchema>;

export const PersonaVersionIdSchema = uuid.brand<'PersonaVersionId'>();
export type PersonaVersionId = z.infer<typeof PersonaVersionIdSchema>;

export const UserIdSchema = uuid.brand<'UserId'>();
export type UserId = z.infer<typeof UserIdSchema>;

/** A row of `conversation_events` or of the `domain_events` outbox. */
export const EventIdSchema = uuid.brand<'EventId'>();
export type EventId = z.infer<typeof EventIdSchema>;

export const AuditEntryIdSchema = uuid.brand<'AuditEntryId'>();
export type AuditEntryId = z.infer<typeof AuditEntryIdSchema>;

/** A row of `llm_calls`, the journal of every model call. */
export const LlmCallIdSchema = uuid.brand<'LlmCallId'>();
export type LlmCallId = z.infer<typeof LlmCallIdSchema>;

export const KillSwitchIdSchema = uuid.brand<'KillSwitchId'>();
export type KillSwitchId = z.infer<typeof KillSwitchIdSchema>;

/** A row of `blind_tests` (ADR 0019). */
export const BlindTestIdSchema = uuid.brand<'BlindTestId'>();
export type BlindTestId = z.infer<typeof BlindTestIdSchema>;

/** A fresh UUID v7 branded by the given schema: `newId(FanIdSchema)`. */
export function newId<S extends z.ZodType<string>>(schema: S): z.output<S> {
  return schema.parse(v7());
}

/** A member of the agency's team (ADR 0023), linked to one dashboard account (`user`). */
export const TeamMemberIdSchema = uuid.brand<'TeamMemberId'>();
export type TeamMemberId = z.infer<typeof TeamMemberIdSchema>;

export const TeamMemberNoteIdSchema = uuid.brand<'TeamMemberNoteId'>();
export type TeamMemberNoteId = z.infer<typeof TeamMemberNoteIdSchema>;

export const CommissionPresetIdSchema = uuid.brand<'CommissionPresetId'>();
export type CommissionPresetId = z.infer<typeof CommissionPresetIdSchema>;

export const CommissionRateIdSchema = uuid.brand<'CommissionRateId'>();
export type CommissionRateId = z.infer<typeof CommissionRateIdSchema>;
