import { pgTable, text } from 'drizzle-orm/pg-core';

import { timestampTz } from './columns';

/** Written every 30 s by each worker, read by `/ready`. Out of RLS. */
export const workerHeartbeats = pgTable('worker_heartbeats', {
  workerId: text('worker_id').primaryKey(),
  hostname: text('hostname').notNull(),
  version: text('version').notNull(),
  lastSeenAt: timestampTz('last_seen_at').notNull().defaultNow(),
});
