import type {
  AutomaticMissing,
  ConversationId,
  CreatorId,
  HandoffCause,
  KillSwitchScope,
  TelegramTopic,
} from '@nirvana/contracts';

/**
 * What the module reads out of a `domain_events` row (ADR 0020 §3), narrowed to the facts a notification needs.
 * Nothing here can hold a fan's words: there is no free-text field coming from a fan.
 */

export type Signal =
  | {
      readonly kind: 'handoff';
      readonly conversationId: ConversationId | null;
      /** `null` for an event written before the cause existed (#54): it ranks as important. */
      readonly cause: HandoffCause | null;
    }
  | {
      readonly kind: 'takeover';
      readonly conversationId: ConversationId | null;
      readonly userId: string | null;
    }
  | {
      /** A person gave the conversation back to the agent: whatever needed a human was dealt with. */
      readonly kind: 'release';
      readonly conversationId: ConversationId | null;
      readonly userId: string | null;
    }
  | {
      readonly kind: 'budget';
      readonly threshold: 'alert' | 'reached';
      readonly spentMinor: number;
      readonly capMinor: number;
    }
  | { readonly kind: 'session_expired'; readonly platformAccountId: string }
  | { readonly kind: 'session_back'; readonly platformAccountId: string }
  | {
      readonly kind: 'kill_switch';
      readonly active: boolean;
      readonly scope: KillSwitchScope;
      readonly scopeId: string | null;
      /** Typed by someone of the agency in the CRM; escaped and cut when rendered. */
      readonly reason: string;
    }
  | {
      /** A message of the agent will never leave (last attempt, or refused): the conversation is in `error`. */
      readonly kind: 'send_failed';
      readonly conversationId: ConversationId | null;
    }
  | {
      /** Automatique closed on its own (ADR 0019): its conversations went back to the copilot. */
      readonly kind: 'automatic_closed';
      /** What the lock misses now, with the server's figures. */
      readonly missing: readonly AutomaticMissing[];
      readonly conversations: number;
    };

export interface ScannedEvent {
  /** `domain_events.id`: the source key of every delivery it produces. */
  readonly id: string;
  readonly creatorId: CreatorId | null;
  readonly createdAt: Date;
  readonly signal: Signal;
}

/** A new message for the topic's groups. */
export interface Notice {
  readonly kind: 'notice';
  readonly topic: TelegramTopic;
  /** Lets a later event close the message (a takeover, a recovery); null when nothing ever will. */
  readonly threadKey: string | null;
  readonly title: string;
  readonly body: string;
  readonly link: { readonly label: string; readonly path: string } | null;
}

/** A later event that closes earlier messages of the same thread, in each group that got them. */
export interface Closure {
  readonly kind: 'closure';
  readonly threadKey: string;
  /** `edit` rewrites the original message; `reply` answers it without a sound. */
  readonly mode: 'edit' | 'reply';
  readonly text: string;
  /** For an edit by a person: whose name to resolve (`userId`), shown as « Pris en main par … ». */
  readonly userId: string | null;
}

export type Outcome = Notice | Closure;
