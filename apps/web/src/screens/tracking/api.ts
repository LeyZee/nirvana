import {
  ConversationSummarySchema,
  CreatorListSchema,
  pageOf,
  type ConversationSummary,
  type CreatorSummary,
} from '@nirvana/contracts';

const PageSchema = pageOf(ConversationSummarySchema);

/** The creators of the account. A server without the route yet (404) has none to show. */
export async function fetchCreators(): Promise<CreatorSummary[]> {
  const response = await fetch('/v1/creators', { credentials: 'include' });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`GET /v1/creators: ${String(response.status)}`);
  return CreatorListSchema.parse(await response.json()).creators;
}

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
