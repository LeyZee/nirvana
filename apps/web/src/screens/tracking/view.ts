import type { ConversationMode, ConversationState, ConversationSummary } from '@nirvana/contracts';

import { DESIRE_BAND_LABELS } from '@/agent/desire';

/** The labels of `nv-status--<state>` (docs/design/README.md, « Pastilles d'état »). */
export const STATE_LABELS: Readonly<Record<ConversationState, string>> = {
  idle: 'Rien à faire',
  pending: 'Message reçu',
  drafting: 'L’agent écrit',
  awaiting_approval: 'À valider',
  sending: 'Envoi en cours',
  human: 'Un humain répond',
  paused: 'En pause',
  error: 'Erreur',
};

const MODE_LABELS: Readonly<Record<ConversationMode, string>> = {
  copilot: 'Copilote',
  auto: 'Automatique',
};

/** The design system's class for a state: its values use `_`, the classes `-`. */
export const statusClass = (state: ConversationState): string => `nv-status--${state.replaceAll('_', '-')}`;

export interface Line {
  readonly conversation: ConversationSummary;
  /** Whose conversation it is: every read and decision names the creator. */
  readonly creatorId: string;
  /** Whose fan he is: shown only when the account sees several creators. */
  readonly creatorName: string;
}

/** Every creator's conversations in one list, the most recently changed first. */
export function mergeConversations(
  lists: readonly {
    readonly creatorId: string;
    readonly creatorName: string;
    readonly items: readonly ConversationSummary[];
  }[],
): Line[] {
  return lists
    .flatMap(({ creatorId, creatorName, items }) =>
      items.map((conversation) => ({ conversation, creatorId, creatorName })),
    )
    .sort((a, b) => Date.parse(b.conversation.updatedAt) - Date.parse(a.conversation.updatedAt));
}

/** « il y a 5 min », « il y a 3 h », « il y a 2 j » ; nothing for a conversation he never wrote in. */
export function lastMessageAgo(iso: string | null, now: Date): string | null {
  if (iso === null) return null;
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${String(hours)} h`;
  return `il y a ${String(Math.floor(hours / 24))} j`;
}

/** The mode every line shares, said once above the list; null when they differ and each line says its own. */
export function sharedMode(lines: readonly Line[]): ConversationMode | null {
  const modes = new Set(lines.map((l) => l.conversation.mode));
  const [only] = modes;
  return modes.size === 1 && only !== undefined ? only : null;
}

/** What the mode means for the person reading, in one sentence. */
export const MODE_MEANINGS: Readonly<Record<ConversationMode, string>> = {
  copilot: 'En copilote : chaque réponse de l’agent attend ton accord.',
  auto: 'En automatique : l’agent répond seul.',
};

/**
 * The line under the fan's name: when he last wrote, after the mode when the lines do not share one, then the band of
 * his desire score in a word once he has one (P3-12). Never its number, never a colour: the list is no heat map. The
 * band comes apart, so that a narrow line cuts what comes before it and never the band itself.
 */
export function subline(
  conversation: ConversationSummary,
  now: Date,
  withMode: boolean,
): { readonly text: string; readonly band: string | null } {
  const ago = lastMessageAgo(conversation.lastInboundAt, now);
  const wrote = ago === null ? 'N’a pas encore écrit' : `A écrit ${ago}`;
  const text = withMode
    ? `${MODE_LABELS[conversation.mode]} · ${wrote.charAt(0).toLowerCase()}${wrote.slice(1)}`
    : wrote;
  return { text, band: conversation.desire === null ? null : DESIRE_BAND_LABELS[conversation.desire.band] };
}

/** How « Toutes les conversations » is ordered: the most recent first unless the reader asks for the hottest. */
export const LIST_ORDERS = ['recent', 'hot'] as const;
export type ListOrder = (typeof LIST_ORDERS)[number];

export const LIST_ORDER_LABELS: Readonly<Record<ListOrder, string>> = {
  recent: 'Récents',
  hot: 'Chauds d’abord',
};

/**
 * The hottest first, then the most recent; a conversation without a score yet comes last. The lines arrive most
 * recent first and the sort is stable, so equal scores keep that order.
 */
export function orderLines<T extends { readonly conversation: ConversationSummary }>(
  lines: readonly T[],
  order: ListOrder,
): T[] {
  if (order === 'recent') return [...lines];
  return lines.toSorted(
    (a, b) => (b.conversation.desire?.score ?? -1) - (a.conversation.desire?.score ?? -1),
  );
}

const ORDER_KEY = 'nirvana.suivi.order';

/** The order chosen on this device, like the appearance; storage can throw, and the list is then most recent first. */
export function readListOrder(): ListOrder {
  try {
    const stored = window.localStorage.getItem(ORDER_KEY);
    return LIST_ORDERS.find((order) => order === stored) ?? 'recent';
  } catch {
    return 'recent';
  }
}

export function storeListOrder(order: ListOrder): void {
  try {
    window.localStorage.setItem(ORDER_KEY, order);
  } catch {
    // Not remembered: the choice lasts the visit.
  }
}

/** `/suivi?conversation=<id>`: the conversation the reader opens (the link of a Telegram alert, a line of the list). */
export interface TrackingSearch {
  readonly conversation?: string;
}

/** Anything else in the address is ignored: a broken link opens the list, never an error. */
export function parseTrackingSearch(search: Record<string, unknown>): TrackingSearch {
  const { conversation } = search;
  return typeof conversation === 'string' && /^[0-9a-f-]{36}$/iu.test(conversation) ? { conversation } : {};
}

/**
 * One draft's bubbles as a person edits them: one bubble per line. `null` when the text is not a valid answer (no
 * bubble, more than 10, or one too long), so the button stays off instead of the server refusing it.
 */
export function bubblesFromText(text: string): string[] | null {
  const bubbles = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return bubbles.length === 0 || bubbles.length > 10 || bubbles.some((b) => b.length > 2_000)
    ? null
    : bubbles;
}
