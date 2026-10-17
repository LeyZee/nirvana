import {
  AuditEntryIdSchema,
  CreatorIdSchema,
  NewCreatorSchema,
  newId,
  type CreatorSummary,
} from '@nirvana/contracts';
import { inArray, schema, type Database } from '@nirvana/db';

import type { CreatorDirectory } from '../../domain/ports';

const toSummary = (row: { id: string; displayName: string; timezone: string }): CreatorSummary => ({
  id: CreatorIdSchema.parse(row.id),
  displayName: row.displayName,
  timezone: row.timezone,
});

export function createDrizzleCreatorDirectory(db: Database): CreatorDirectory {
  return {
    async list(ids) {
      if (ids !== 'all' && ids.length === 0) return [];
      const columns = {
        id: schema.creators.id,
        displayName: schema.creators.displayName,
        timezone: schema.creators.timezone,
      };
      const query = db.select(columns).from(schema.creators);
      const rows = await (ids === 'all' ? query : query.where(inArray(schema.creators.id, [...ids]))).orderBy(
        schema.creators.displayName,
      );
      return rows.map(toSummary);
    },

    async create(input) {
      const parsed = NewCreatorSchema.parse(input);
      const id = newId(CreatorIdSchema);
      await db.transaction(async (tx) => {
        await tx.insert(schema.creators).values({ id, ...parsed });
        await tx.insert(schema.auditLog).values({
          id: newId(AuditEntryIdSchema),
          userId: null,
          action: 'creator.create',
          entity: 'creator',
          entityId: id,
          details: { displayName: parsed.displayName, timezone: parsed.timezone },
        });
      });
      return { id, ...parsed };
    },
  };
}
