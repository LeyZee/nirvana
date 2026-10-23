import {
  ConversationDetailSchema,
  ConversationEventViewSchema,
  ConversationSummarySchema,
  MessageViewSchema,
  pageOf,
  type ConversationDetail,
  type ConversationEventView,
  type ConversationSummary,
  type MessageView,
} from '@nirvana/contracts';

import { decisionError } from './reader-model';

const PageSchema = pageOf(ConversationSummarySchema);

/** The largest page `/v1/conversations` serves (api.md § Pagination). */
const LIMIT = 200;

export interface CreatorConversations {
  readonly items: readonly ConversationSummary[];
  /** More conversations exist past this page: the list says it shows the most recent ones only. */
  readonly hasMore: boolean;
}

/** The most recent conversations of one creator, as the API lists them (P0-05). */
export async function fetchConversations(creatorId: string): Promise<CreatorConversations> {
  const query = new URLSearchParams({ creatorId, limit: String(LIMIT) });
  const response = await fetch(`/v1/conversations?${query.toString()}`, { credentials: 'include' });
  if (!response.ok) throw new Error(`GET /v1/conversations: ${String(response.status)}`);
  const page = PageSchema.parse(await response.json());
  return { items: page.items, hasMore: page.nextCursor !== null };
}

const MessagesSchema = pageOf(MessageViewSchema);
const EventsSchema = pageOf(ConversationEventViewSchema);
/** The reader shows the latest part of a conversation; Reveal keeps the whole history. */
const READER_LIMIT = 100;

/** The conversation was not found for this creator (deleted, or another creator's): nothing to read again. */
export class ConversationGone extends Error {}

async function read<T>(path: string, query: URLSearchParams, parse: (body: unknown) => T): Promise<T> {
  const response = await fetch(`${path}?${query.toString()}`, { credentials: 'include' });
  if (response.status === 404) throw new ConversationGone(path);
  if (!response.ok) throw new Error(`GET ${path}: ${String(response.status)}`);
  return parse(await response.json());
}

export interface ConversationRead {
  readonly detail: ConversationDetail;
  /** Newest first, as the API pages them. */
  readonly messages: readonly MessageView[];
  /** Newest first. */
  readonly events: readonly ConversationEventView[];
  /** Older messages exist past this page. */
  readonly isPartial: boolean;
}

/** One conversation for the reader: its state and open drafts, its latest messages and what happened to it. */
export async function fetchConversation(
  creatorId: string,
  conversationId: string,
): Promise<ConversationRead> {
  const path = `/v1/conversations/${encodeURIComponent(conversationId)}`;
  const one = new URLSearchParams({ creatorId });
  const page = new URLSearchParams({ creatorId, limit: String(READER_LIMIT) });
  const [detail, messages, events] = await Promise.all([
    read(path, one, (body) => ConversationDetailSchema.parse(body)),
    read(`${path}/messages`, page, (body) => MessagesSchema.parse(body)),
    read(`${path}/events`, page, (body) => EventsSchema.parse(body)),
  ]);
  return {
    detail,
    messages: messages.items,
    events: events.items,
    isPartial: messages.nextCursor !== null,
  };
}

/** A decision went through, or why not (the draft and the conversation stay as they were). */
export type Decision = { readonly ok: true } | { readonly ok: false; readonly message: string };

async function command(
  creatorId: string,
  conversationId: string,
  action: string,
  body: Record<string, unknown> = {},
): Promise<Decision> {
  const query = new URLSearchParams({ creatorId });
  const path = `/v1/conversations/${encodeURIComponent(conversationId)}/${action}?${query.toString()}`;
  try {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.status === 204) return { ok: true };
    return { ok: false, message: decisionError(response.status, await response.json().catch(() => null)) };
  } catch {
    return { ok: false, message: decisionError(0, null) };
  }
}

/** Sends the draft as written, or with the bubbles a person retouched (the hard guards read them again). */
export function approveDraft(
  creatorId: string,
  conversationId: string,
  draftId: string,
  bubbles?: readonly string[],
): Promise<Decision> {
  return command(
    creatorId,
    conversationId,
    `drafts/${encodeURIComponent(draftId)}/approve`,
    bubbles === undefined ? {} : { bubbles },
  );
}

/** Nothing leaves; the reason, when given, feeds the evals. */
export function rejectDraft(
  creatorId: string,
  conversationId: string,
  draftId: string,
  reason?: string,
): Promise<Decision> {
  return command(
    creatorId,
    conversationId,
    `drafts/${encodeURIComponent(draftId)}/reject`,
    reason === undefined ? {} : { reason },
  );
}

/** A person answers in Reveal from now on: the agent writes nothing more in this conversation. */
export function takeOver(creatorId: string, conversationId: string): Promise<Decision> {
  return command(creatorId, conversationId, 'takeover');
}

/**
 * The agent answers again from the fan's next message. The note, when given, is what the chatter wants the agent to
 * remember about the fan: the server keeps it as a fact the agent reads (`ReleaseBodySchema`, 300 characters).
 */
export function giveBack(creatorId: string, conversationId: string, note?: string): Promise<Decision> {
  return command(creatorId, conversationId, 'release', note === undefined ? {} : { note });
}
