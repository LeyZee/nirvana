import { sql } from 'drizzle-orm';
import { boolean, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, tenantPolicy, timestampTz } from './columns';
import { creators } from './tenancy';

/** Module `persona` (ADR 0010): each loaded version, validated by `PersonaSchema`; one active per creator. */
export const personaVersions = pgTable(
  'persona_versions',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    version: text('version').notNull(),
    sourcePath: text('source_path').notNull(),
    content: jsonb('content').notNull(),
    contentHash: text('content_hash').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    activatedAt: timestampTz('activated_at'),
    createdBy: text('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('persona_versions_creator_version_unique').on(t.creatorId, t.version),
    uniqueIndex('persona_versions_one_active')
      .on(t.creatorId)
      .where(sql`${t.isActive}`),
    tenantPolicy(t.creatorId),
  ],
);
