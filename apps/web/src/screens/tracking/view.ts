import type { ConversationMode, ConversationState, ConversationSummary } from '@nirvana/contracts';

/** The labels of `nv-status--<state>` (docs/design/README.md, « Pastilles d'état »). */
export const STATE_LABELS: Readonly<Record<ConversationState, string>> = {
  idle: 'Au calme',
  pending: 'En attente',
  drafting: 'Rédaction',
  awaiting_approval: 'À valider',
  sending: 'Envoi',
  human: 'Humain',
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
  /** Whose fan he is: shown only when the account sees several creators. */
  readonly creatorName: string;
}

/** Every creator's conversations in one list, the most recently changed first. */
export function mergeConversations(
  lists: readonly { readonly creatorName: string; readonly items: readonly ConversationSummary[] }[],
): Line[] {
  return lists
    .flatMap(({ creatorName, items }) => items.map((conversation) => ({ conversation, creatorName })))
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

/** The line under the fan's name: the mode, then when he last wrote (short enough for a phone). */
export function subline(conversation: ConversationSummary, now: Date): string {
  const ago = lastMessageAgo(conversation.lastInboundAt, now);
  const mode = MODE_LABELS[conversation.mode];
  return ago === null ? `${mode} · pas encore de message` : `${mode} · ${ago}`;
}
