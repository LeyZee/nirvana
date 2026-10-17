import type {
  Actor,
  ConversationDetail,
  ConversationEventView,
  ConversationId,
  ConversationSummary,
  CreatorId,
  Currency,
  DraftId,
  DraftStatus,
  EventBody,
  ExternalRef,
  FanId,
  HandoffCause,
  JobName,
  JobPayload,
  MessageAuthor,
  MessageDirection,
  MessageId,
  MessageView,
  OutboundMedia,
  PlatformAccountId,
  SendResult,
  UserId,
  VerifyResult,
} from '@nirvana/contracts';

import type { ConversationProjection } from './projection';

/** Ports of the `conversations` module (ADR 0002): what it needs, implemented in `infra/` or by other modules. */

export interface Clock {
  now(): Date;
}

interface ConversationKey {
  readonly id: ConversationId;
  readonly creatorId: CreatorId;
  readonly platformAccountId: PlatformAccountId;
  readonly fanId: FanId;
  readonly platformConversationId: string;
}

export type Conversation = ConversationKey & ConversationProjection;

interface NewMessage {
  readonly id: MessageId;
  readonly conversationId: ConversationId;
  readonly platformAccountId: PlatformAccountId;
  readonly platformMessageId: string;
  readonly direction: MessageDirection;
  readonly author: MessageAuthor;
  readonly text: string;
  readonly priceMinor: number | null;
  readonly currency: Currency | null;
  readonly isPaid: boolean;
  readonly platformCreatedAt: Date;
  readonly draftId: DraftId | null;
}

export interface Draft {
  readonly id: DraftId;
  readonly conversationId: ConversationId;
  readonly status: DraftStatus;
  readonly bubbles: readonly string[];
  readonly finalBubbles: readonly string[] | null;
  readonly createdAt: Date;
}

export interface DraftDecision {
  readonly decidedBy: string | null;
  readonly at: Date;
  readonly finalBubbles?: readonly string[];
}

interface ConversationRepository {
  /**
   * Returns the conversation locked for the rest of the transaction, creating it on first sight. The lock makes
   * the transaction the single writer of this conversation's journal.
   */
  lockOrCreate(key: ConversationKey): Promise<Conversation>;
  /** Locks an existing conversation, or `null`. */
  lock(id: ConversationId): Promise<Conversation | null>;
  saveProjection(id: ConversationId, projection: ConversationProjection): Promise<void>;
}

interface MessageRepository {
  /** `false` when the platform message is already known (unique per account): ingestion is idempotent. */
  insertIfNew(message: NewMessage): Promise<boolean>;
  /** Bubbles of this draft already on the platform; a retried send resumes after them. */
  countForDraft(draftId: DraftId): Promise<number>;
  /** The conversation's last `limit` messages, oldest first: what the engine reads. */
  history(conversationId: ConversationId, limit: number): Promise<readonly HistoryMessage[]>;
  /** What the fan's messages tell about them across the creator's conversations. */
  fanContext(fanId: FanId): Promise<FanContext>;
}

/** The voice prompt version and the model that wrote a draft: what the live rate is read by (ADR 0019). */
interface DraftVoice {
  readonly voicePrompt: string;
  readonly voiceModel: string;
}

interface DraftRepository {
  lock(id: DraftId): Promise<Draft | null>;
  /** Drafts not yet sent nor closed (`pending`, `approved`, `edited`), oldest first. */
  openFor(conversationId: ConversationId): Promise<readonly Draft[]>;
  insert(draft: {
    id: DraftId;
    conversationId: ConversationId;
    idempotencyKey: string;
    createdAt: Date;
    bubbles?: readonly string[];
    /** Soft guard findings the operator should see next to the draft. */
    softViolations?: readonly string[];
    /** The voice that wrote it, for the live rate (ADR 0019). */
    voice?: DraftVoice;
  }): Promise<void>;
  setStatus(id: DraftId, status: DraftStatus, decision?: DraftDecision): Promise<void>;
}

export interface EventMeta {
  readonly actor: Actor;
  readonly correlationId: string;
  readonly at: Date;
}

export interface StoredEvent {
  readonly seq: number;
  readonly body: EventBody;
  readonly actor: Actor;
  readonly at: Date;
}

interface EventWriter {
  /** Appends to the conversation's journal with the next `seq`; the caller holds the conversation's lock. */
  append(conversation: ConversationKey, body: EventBody, meta: EventMeta): Promise<number>;
  /** Writes the same event to the `domain_events` outbox, for the modules that react to it. */
  publish(creatorId: CreatorId, body: EventBody, meta: EventMeta): Promise<void>;
  /** The whole journal in `seq` order. */
  list(conversationId: ConversationId): Promise<readonly StoredEvent[]>;
}

interface JobOptions {
  readonly queueName?: string;
  readonly jobKey?: string;
  readonly runAt?: Date;
  readonly maxAttempts?: number;
}

/** Enqueues inside the current transaction (outbox, ADR 0006): a rollback drops the job with the state. */
interface JobEnqueuer {
  enqueue<J extends JobName>(job: J, payload: JobPayload<J>, options: JobOptions): Promise<void>;
}

/** Reasons the bot must not answer now (message-flow.md §6), read fresh by each job. */
export type BlockedReason = 'kill_switch' | 'session_expired';

interface RespondGate {
  blockedReason(conversation: ConversationKey): Promise<BlockedReason | null>;
}

/** Everything a command touches, bound to one tenant transaction. */
export interface Transaction {
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
  readonly drafts: DraftRepository;
  readonly events: EventWriter;
  readonly jobs: JobEnqueuer;
  readonly gate: RespondGate;
  readonly audit: AuditTrail;
}

/** Who did what from the dashboard (`audit_log`, security.md), in the same transaction as the act. */
interface AuditTrail {
  record(entry: {
    userId: UserId;
    action: string;
    entityId: string;
    details?: Record<string, unknown>;
  }): Promise<void>;
}

export interface UnitOfWork {
  /** Runs `work` in one transaction scoped to the creator (`withTenant`, RLS). */
  inTenant<T>(creatorId: CreatorId, work: (tx: Transaction) => Promise<T>): Promise<T>;
}

/** The fan as `conversations` needs it; implemented by the `fans` module. */
export interface FanDirectory {
  upsertFanByPlatformId(sighting: {
    creatorId: CreatorId;
    platformAccountId: PlatformAccountId;
    platformFanId: string;
    displayName: string;
    seenAt: Date;
  }): Promise<{ readonly id: FanId }>;
}

/**
 * Sending, implemented by the `connectors` module (P0-06): `conversations` does not depend on `connectors`
 * (dependency inversion, modules.md).
 */
export interface OutboundSender {
  sendText(conversation: ConversationKey, text: string, idempotencyKey: string): Promise<SendResult>;
  sendMedia(conversation: ConversationKey, media: OutboundMedia, idempotencyKey: string): Promise<SendResult>;
  /** After a send whose outcome is unknown, whether the message reached the platform. */
  verifySent(
    conversation: ConversationKey,
    idempotencyKey: string,
    ref: ExternalRef | null,
  ): Promise<VerifyResult>;
}

/** One message as the engine reads it. */
interface HistoryMessage {
  readonly direction: MessageDirection;
  readonly author: MessageAuthor;
  readonly text: string;
  readonly at: Date;
  readonly priceMinor: number | null;
  readonly isPaid: boolean;
}

interface FanContext {
  /** Confirmed facts about the fan, current ones only (`fan_facts`), as « key : value ». */
  readonly notes: readonly string[];
  /** Paid messages (PPV bought), in minor units. */
  readonly spentMinor: number;
  readonly firstMessageAt: Date | null;
}

export interface ComposeInput {
  readonly creatorId: CreatorId;
  readonly conversationId: ConversationId;
  readonly fanId: FanId;
  /** Ties the LLM calls to the draft (real cost per draft in `llm_calls`). */
  readonly draftId: DraftId;
  readonly correlationId: string;
  readonly now: Date;
  /** The last 40 messages, oldest first. */
  readonly history: readonly HistoryMessage[];
  readonly fan: FanContext;
}

/** Why the engine wrote no draft. The first three hand the conversation to the chatters. */
export type HoldReason = 'guard_blocked' | 'handoff' | 'budget_reached' | 'llm_unavailable' | 'no_reply';

export type ComposeResult =
  | {
      readonly kind: 'draft';
      readonly bubbles: readonly string[];
      readonly softViolations: readonly string[];
      readonly costUsd: number;
      readonly voice?: DraftVoice;
    }
  | {
      readonly kind: 'held';
      readonly reason: HoldReason;
      /** Why a human must answer, when the engine knows (vision, conversation checks); `other` otherwise. */
      readonly cause?: HandoffCause;
      readonly detail: readonly string[];
      readonly costUsd: number;
    };

/**
 * The engine behind `conversation.respond`, implemented by the agent's adapter and injected by the composition
 * root. It resolves the persona from `creatorId` itself. Called outside any transaction: it may take seconds.
 */
export interface DraftComposer {
  compose(input: ComposeInput): Promise<ComposeResult>;
}

/** What a job handler logs through; the composition root passes the job's own logger. */
export interface JobLogger {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface PageRequest {
  readonly limit: number;
  readonly cursor?: string | undefined;
}

/** Read side of the dashboard (no lock, no event): implemented in `infra/db`. */
export interface ConversationReader {
  list(creatorId: CreatorId, page: PageRequest): Promise<Page<ConversationSummary>>;
  get(creatorId: CreatorId, id: ConversationId): Promise<ConversationDetail | null>;
  messages(creatorId: CreatorId, id: ConversationId, page: PageRequest): Promise<Page<MessageView>>;
  events(creatorId: CreatorId, id: ConversationId, page: PageRequest): Promise<Page<ConversationEventView>>;
}
