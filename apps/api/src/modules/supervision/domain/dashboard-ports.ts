import type { CreatorId, HandoffCause } from '@nirvana/contracts';

import type { DecidedDraft } from './automatic';

/** The voice version whose live rate opens Automatique: the configured prompt and model (ADR 0019). */
export interface VoiceVersion {
  readonly voicePrompt: string;
  readonly voiceModel: string;
}

/** A conversation waiting for a human: handed over, or with a draft unread for more than 10 minutes. */
export interface WaitingConversation {
  readonly conversationId: string;
  readonly fanId: string;
  readonly fanName: string;
  readonly kind: HandoffCause | 'awaiting_approval';
  readonly since: Date;
}

interface TopFan {
  readonly id: string;
  readonly name: string;
  readonly firstSeenAt: Date;
  readonly spentMinor: number;
  readonly byAgentMinor: number;
  readonly notes: readonly string[];
  readonly alert: HandoffCause | undefined;
}

/** What the database knows, read in one tenant transaction; the domain turns it into the Dashboard. */
export interface DashboardFacts {
  readonly creator: { readonly name: string; readonly timezone: string };
  /** The latest row of each kill switch scope that stops her: the global one, and hers. */
  readonly switches: { readonly global: boolean; readonly creator: boolean };
  readonly autoConversations: number;
  /** Decided drafts of the active voice version, newest first (at most 200), now and three weeks ago. */
  readonly decided: readonly DecidedDraft[];
  readonly decidedThreeWeeksAgo: readonly DecidedDraft[];
  readonly reveal: {
    readonly connected: boolean;
    readonly lastReadAt: Date | null;
    readonly conversations: number;
  };
  readonly voice: { readonly medianWriteMs: number | null; readonly outageHoursLast7d: number };
  readonly replies: {
    readonly medianReplyMinutes: number | null;
    readonly fansWaitingOver10Min: number;
    readonly conversationsOpen: number;
  };
  readonly handoffsToday: readonly { readonly cause: HandoffCause; readonly count: number }[];
  readonly waiting: readonly WaitingConversation[];
  readonly fans: readonly TopFan[];
}

export interface DashboardWindow {
  readonly now: Date;
  /** Midnight of her day, in her time zone. */
  readonly dayStart: Date;
  readonly periodStart: Date;
  readonly voice: VoiceVersion;
}

export interface DashboardReader {
  /** Undefined when the creator does not exist. */
  read(
    creatorId: CreatorId,
    window: (timezone: string) => DashboardWindow,
  ): Promise<{ readonly facts: DashboardFacts; readonly window: DashboardWindow } | undefined>;
}

/** What the Dashboard shows of the Telegram alerts (module telegram, wired by the composition root). */
export interface TelegramReading {
  /** Urgent and important alerts of her night (20 h to 8 h in her time zone), or of the last one by day. */
  readonly alertsTonight: number;
  readonly urgentReachable: boolean;
}

export interface TelegramView {
  read(creatorId: CreatorId): Promise<TelegramReading>;
}
