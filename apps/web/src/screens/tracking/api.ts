import {
  ConversationSummarySchema,
  CreatorIdSchema,
  pageOf,
  type ConversationSummary,
} from '@nirvana/contracts';
import { z } from 'zod';

const PageSchema = pageOf(ConversationSummarySchema);

/**
 * `GET /v1/creators` (fil Bilan, after P0-07b): the creators the signed-in user can see, an owner all of them.
 * Local until its schema lands in `@nirvana/contracts`; then this one goes.
 */
const CreatorsSchema = z.object({
  creators: z.array(z.object({ id: CreatorIdSchema, displayName: z.string(), timezone: z.string() })),
});
export type Creator = z.infer<typeof CreatorsSchema>['creators'][number];

/** The creators of the account. A server without the route yet (404) has none to show. */
export async function fetchCreators(): Promise<Creator[]> {
  const response = await fetch('/v1/creators', { credentials: 'include' });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`GET /v1/creators: ${String(response.status)}`);
  return CreatorsSchema.parse(await response.json()).creators;
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
