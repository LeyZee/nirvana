import { ConversationSummarySchema, pageOf, type ConversationSummary } from '@nirvana/contracts';

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
