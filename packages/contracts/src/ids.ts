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

/** A single-use link to choose a password, for a member's first access or a reset (EQ-10). */
export const InvitationLinkIdSchema = uuid.brand<'InvitationLinkId'>();
export type InvitationLinkId = z.infer<typeof InvitationLinkIdSchema>;

/** A member's shift on one account of a creator (EQ-02). */
export const ShiftIdSchema = uuid.brand<'ShiftId'>();
export type ShiftId = z.infer<typeof ShiftIdSchema>;

/** A weekly shift that makes the shifts of the weeks ahead (EQ-02). */
export const ShiftTemplateIdSchema = uuid.brand<'ShiftTemplateId'>();
export type ShiftTemplateId = z.infer<typeof ShiftTemplateIdSchema>;

/** A member's request to be away for whole days, decided by the agency (EQ-02, ADR 0031). */
export const LeaveRequestIdSchema = uuid.brand<'LeaveRequestId'>();
export type LeaveRequestId = z.infer<typeof LeaveRequestIdSchema>;

/** A chatter's offer to give or exchange a shift with a colleague, who accepts or declines it (EQ-02, ADR 0031). */
export const ShiftSwapRequestIdSchema = uuid.brand<'ShiftSwapRequestId'>();
export type ShiftSwapRequestId = z.infer<typeof ShiftSwapRequestIdSchema>;

/** A chatter's end-of-shift report, or a correction of one once validated (EQ-03, ADR 0023). */
export const ShiftReportIdSchema = uuid.brand<'ShiftReportId'>();
export type ShiftReportId = z.infer<typeof ShiftReportIdSchema>;

/** The pay rules of a platform account from a pay period on: currency, VAT, platform fee, earnings source (EQ-03). */
export const AccountPayRulesIdSchema = uuid.brand<'AccountPayRulesId'>();
export type AccountPayRulesId = z.infer<typeof AccountPayRulesIdSchema>;
