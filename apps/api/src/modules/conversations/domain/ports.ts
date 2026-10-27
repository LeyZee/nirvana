import type {
  Actor,
  AgentHours,
  ConversationDetail,
  ConversationEventView,
  ConversationId,
  ConversationMode,
  ConversationState,
  ConversationSummary,
  CreatorId,
  Currency,
  DecidedDraft,
  DesireCurve,
  DesireSignal,
  DraftId,
  DraftStatus,
  EventBody,
  ExternalMedia,
  ExternalRef,
  FactCategory,
  FactKind,
  FanId,
  GuardCode,
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
  /** The media the platform listed on it; empty for what we send. */
  readonly platformMedia: readonly ExternalMedia[];
}

export interface Draft {
  readonly id: DraftId;
  readonly conversationId: ConversationId;
  readonly status: DraftStatus;
  readonly bubbles: readonly string[];
  readonly finalBubbles: readonly string[] | null;
  readonly createdAt: Date;
  /** What the brief learnt about the fan for this draft, written as facts once a human approves it (P3-02). */
  readonly facts: readonly DraftFact[];
}

/** A fact read in the fan's messages, kept with the draft until a human approves it (P3-02). */
export interface DraftFact {
  readonly category: FactCategory;
  readonly key: string;
  readonly value: string;
  readonly kind: FactKind;
  readonly confidence: number;
  /** The fan's message it was read in. */
  readonly sourceMessageId: MessageId | null;
  readonly observedAt: Date;
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
  /** The creator's conversations in this mode. */
  idsInMode(mode: ConversationMode): Promise<readonly ConversationId[]>;
  /** The creator's conversations in this state, the one whose fan wrote first at the head. */
  idsInState(state: ConversationState): Promise<readonly ConversationId[]>;
}

interface MessageRepository {
  /** `false` when the platform message is already known (unique per account): ingestion is idempotent. */
  insertIfNew(message: NewMessage): Promise<boolean>;
  /** Bubbles of this draft already on the platform; a retried send resumes after them. */
  countForDraft(draftId: DraftId): Promise<number>;
  /** The conversation's last `limit` messages, oldest first: what the engine reads. */
  history(conversationId: ConversationId, limit: number): Promise<readonly HistoryMessage[]>;
  /** What the fan bought and since when he writes, across the creator's conversations. */
  fanStats(fanId: FanId): Promise<FanStats>;
}

/** The voice prompt version and the model that wrote a draft: what the live rate is read by (ADR 0019). */
export interface DraftVoice {
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
    /** Facts the brief proposed, confirmed when a human approves the draft (P3-02). */
    facts?: readonly DraftFact[];
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
  /**
   * With a key: `replace` (the default) moves a waiting job to this run; `unsafe_dedupe` leaves a job already there as
   * it is, time and payload, so that neither a debounce under way nor a wait she chose (`waitedFor`) is touched.
   */
  readonly jobKeyMode?: 'replace' | 'unsafe_dedupe';
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

/** The creator's kill switch and the global one (message-flow.md §6): the latest row of each scope decides. */
interface KillSwitches {
  /** Holds every other mode change of this creator until the transaction ends, so they apply in turn. */
  lockCreator(): Promise<void>;
  isOn(): Promise<{ readonly global: boolean; readonly creator: boolean }>;
  /** Stamped by the database clock once the lock is held, so the later change is always the latest row. */
  setCreator(entry: { active: boolean; reason: string; setBy: string }): Promise<void>;
}

/**
 * What opens Automatique (ADR 0019), for one voice version of the creator and the persona active for her now
 * (ADR 0022): the repository reads that persona itself, in the same statement.
 */
interface AutomaticEvidence {
  /** Her decided drafts of this version, newest first, at most `LIVE_WINDOW`: approved as is, edited or rejected. */
  decided(voice: DraftVoice): Promise<readonly DecidedDraft[]>;
  /** The rate of the latest blind test of this version, in tenths of a percent; null before the first. */
  latestBlindTest(voice: DraftVoice): Promise<number | null>;
  /** Stamped by the database clock; returns that date. */
  recordBlindTest(entry: { voice: DraftVoice; ratePerMille: number; recordedBy: Actor }): Promise<Date>;
}

/** Everything a command touches, bound to one tenant transaction. */
export interface Transaction {
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
  readonly drafts: DraftRepository;
  readonly events: EventWriter;
  readonly jobs: JobEnqueuer;
  readonly gate: RespondGate;
  readonly switches: KillSwitches;
  readonly automatic: AutomaticEvidence;
  readonly audit: AuditTrail;
}

/** Who did what from the dashboard (`audit_log`, security.md), in the same transaction as the act. */
interface AuditTrail {
  record(entry: {
    userId: UserId;
    action: string;
    /** `conversation` unless named. */
    entity?: 'conversation' | 'kill_switch' | 'creator';
    entityId: string;
    details?: Record<string, unknown>;
  }): Promise<void>;
}

export interface UnitOfWork {
  /** Runs `work` in one transaction scoped to the creator (`withTenant`, RLS). */
  inTenant<T>(creatorId: CreatorId, work: (tx: Transaction) => Promise<T>): Promise<T>;
}

/**
 * The hard guards of the agent's output (ADR 0012: never an AI, no meeting, no contact; her hard limits), read
 * again on the bubbles a chatter approves, rewritten or not (revue 09, G5). Implemented by the `agent` module.
 */
export interface BubbleGuard {
  check(
    bubbles: readonly string[],
    context: GuardReadContext,
  ): { readonly isBlocked: boolean; readonly codes: readonly GuardCode[] };
}

/**
 * What the guards read the approved bubbles against (P3-13): the conversation's last messages, oldest first, his and
 * hers, so that a bubble she already sent or a third closed question in a row shows. A draft never carries a media.
 */
export interface GuardReadContext {
  readonly history: readonly { readonly from: 'fan' | 'creator'; readonly text: string }[];
}

/**
 * Her hours (P3-14) and the clock they are read on (`creators.timezone`), implemented by `persona`: the defaults when
 * none is stored. `null` when she does not exist.
 */
export interface ReplyHours {
  of(creatorId: CreatorId): Promise<{ readonly hours: AgentHours; readonly timeZone: string } | null>;
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
  /** Writes what is new in these facts (append-only, the `fans` module decides); returns those written, none on a replay. */
  proposeFacts(
    creatorId: CreatorId,
    fanId: FanId,
    facts: readonly DraftFact[],
  ): Promise<readonly { readonly id: string; readonly category: FactCategory }[]>;
  /** Her active facts about this fan, as the engine reads them (sorted, 40 at most). */
  activeFacts(
    creatorId: CreatorId,
    fanId: FanId,
  ): Promise<readonly { readonly category: FactCategory; readonly key: string; readonly value: string }[]>;
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

/** A media of a message, as the platform listed it. */
interface HistoryMedia {
  readonly kind: ExternalMedia['kind'];
  readonly platformMediaId: string;
  readonly isLocked: boolean;
}

/** One message as the engine reads it. */
interface HistoryMessage {
  readonly id: MessageId;
  readonly direction: MessageDirection;
  readonly author: MessageAuthor;
  readonly text: string;
  readonly at: Date;
  readonly priceMinor: number | null;
  readonly isPaid: boolean;
  /** Its id on the platform: the connector reads a fresh link to its media there (a link expires). */
  readonly platformMessageId: string;
  /**
   * Every media the fan's message carries, screened or not: a message with a media is never answered on its text
   * alone (vision obligatoire). `kind` from the platform; locked when it sits behind a price.
   */
  readonly media: readonly HistoryMedia[];
}

interface FanStats {
  /** Paid messages (PPV bought), in minor units. */
  readonly spentMinor: number;
  readonly firstMessageAt: Date | null;
}

interface FanContext extends FanStats {
  /** Her active facts about the fan (`fans.activeFacts`), as « key : value ». */
  readonly notes: readonly string[];
}

/** A fact as the brief proposes it: its category is the model's word until `conversations` reads it (P3-02). */
export interface ProposedFact {
  readonly category: string;
  readonly key: string;
  readonly value: string;
  readonly kind: FactKind;
  readonly confidence: number;
}

export interface ComposeInput {
  readonly creatorId: CreatorId;
  readonly conversationId: ConversationId;
  readonly fanId: FanId;
  /** Ties the LLM calls to the draft (real cost per draft in `llm_calls`). */
  readonly draftId: DraftId;
  readonly correlationId: string;
  readonly now: Date;
  /** Where the conversation lives on the platform: the engine's vision fetches his media there. */
  readonly platformAccountId: PlatformAccountId;
  readonly platformConversationId: string;
  /** The last 40 messages, oldest first. */
  readonly history: readonly HistoryMessage[];
  readonly fan: FanContext;
  /**
   * Present for a follow-up (P3-10): he went silent after her answer, nothing of his is to be answered. The engine
   * decides whether one goes out (`held` with `no_reply` when not) and writes it like an answer, draft and guards.
   */
  readonly followUp?: FollowUpContext;
  /**
   * How many times she already waited on his last message (P3-11): 1 on the second pass after « attends, je
   * reviens », when she may no longer wait; absent otherwise.
   */
  readonly waited?: number;
  /**
   * The fan's desire score as last written (P3-12) and when it was computed: the engine lets it cool from then on.
   * Absent until he is first scored.
   */
  readonly desire?: { readonly score: number; readonly at: Date };
  /** Her hours (P3-14) as stored; absent, the defaults. They set her night and when a follow-up may go out. */
  readonly hours?: AgentHours;
}

/**
 * The desire score the engine computed with this result (P3-12), given only when it moved: `before` is the stored
 * score cooled down to now (`null` before the first), and differs from `score`. The band is `desireBandOf(score)`.
 */
interface ComposedDesire {
  readonly before: number | null;
  readonly score: number;
  /** The closed codes of the signals that moved it; a code may repeat (`suggestive_emoji` once per emoji). */
  readonly signals: readonly DesireSignal[];
  readonly weightsVersion: string;
}

/** Which follow-up this is, after which silence. */
export interface FollowUpContext {
  /** The index of the delay in `persona.follow_ups.delays_hours`, from 0. */
  readonly step: number;
  /** How many delays the persona has: the last step is `steps - 1`. */
  readonly steps: number;
  /** His last message: the silence the delays count from. */
  readonly silentSince: Date;
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
      /** What the brief read about the fan in his messages. */
      readonly factsProposed?: readonly ProposedFact[];
      readonly desire?: ComposedDesire;
    }
  | {
      readonly kind: 'held';
      readonly reason: HoldReason;
      /** Why a human must answer, when the engine knows (vision, conversation checks); `other` otherwise. */
      readonly cause?: HandoffCause;
      readonly detail: readonly string[];
      readonly costUsd: number;
      /**
       * With `no_reply`, not now but later. For a follow-up, her quiet hours: the same step is scheduled again at that
       * time, within `FOLLOW_UP_RETRY_MAX_HOURS`, otherwise it is cancelled. For an answer, she chose to wait
       * (« attends, je reviens », P3-11): the answer is tried once more at that time, within the bounds of
       * `deferredRespondAt`, otherwise nothing comes back.
       */
      readonly retryAt?: Date;
      readonly desire?: ComposedDesire;
    };

/**
 * The engine behind `conversation.respond`, implemented by the agent's adapter and injected by the composition
 * root. It resolves the persona from `creatorId` itself. Called outside any transaction: it may take seconds.
 */
export interface DraftComposer {
  compose(input: ComposeInput): Promise<ComposeResult>;
}

/**
 * The persona's follow-up delays (`persona.follow_ups`), implemented by the agent's adapter: hours after the fan's
 * last message, strictly increasing; empty when her follow-ups are off. Without this port nothing is scheduled.
 */
export interface FollowUpPlan {
  delaysHours(creatorId: CreatorId): Promise<readonly number[]>;
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
  /** Every conversation of the creator, or with `routedTo` only those routed to that account (ADR 0024). */
  list(creatorId: CreatorId, page: PageRequest, routedTo?: UserId): Promise<Page<ConversationSummary>>;
  /** Whether the conversation is routed to that account: the only way a member whose scope is `self` reaches it. */
  isRoutedTo(creatorId: CreatorId, id: ConversationId, userId: UserId): Promise<boolean>;
  get(creatorId: CreatorId, id: ConversationId): Promise<ConversationDetail | null>;
  messages(creatorId: CreatorId, id: ConversationId, page: PageRequest): Promise<Page<MessageView>>;
  events(creatorId: CreatorId, id: ConversationId, page: PageRequest): Promise<Page<ConversationEventView>>;
  /** Its `desire_scored` events as the reader's curve: the most recent `DESIRE_POINTS_MAX`, oldest first. */
  desireCurve(creatorId: CreatorId, id: ConversationId): Promise<DesireCurve>;
}
