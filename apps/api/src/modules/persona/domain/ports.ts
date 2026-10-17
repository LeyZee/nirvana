import type { CreatorId, CreatorSummary, NewCreator } from '@nirvana/contracts';

/** The creators table, the tenant root: no RLS of its own, read and written by the application role. */
export interface CreatorDirectory {
  /** Every creator when `ids` is `'all'` (an owner), the given ones otherwise; ordered by name. */
  list(ids: readonly CreatorId[] | 'all'): Promise<readonly CreatorSummary[]>;
  create(input: NewCreator): Promise<CreatorSummary>;
}
