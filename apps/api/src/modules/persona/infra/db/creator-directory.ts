import {
  AgentHoursSchema,
  AuditEntryIdSchema,
  CreatorIdSchema,
  DEFAULT_AGENT_HOURS,
  NewCreatorSchema,
  newId,
  type CreatorSummary,
} from '@nirvana/contracts';
import { eq, inArray, schema, type Database } from '@nirvana/db';

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

    async create(input, userId) {
      const parsed = NewCreatorSchema.parse(input);
      const id = newId(CreatorIdSchema);
      await db.transaction(async (tx) => {
        await tx.insert(schema.creators).values({ id, ...parsed });
        await tx.insert(schema.auditLog).values({
          id: newId(AuditEntryIdSchema),
          userId: userId ?? null,
          action: 'creator.create',
          entity: 'creator',
          entityId: id,
          details: { displayName: parsed.displayName, timezone: parsed.timezone },
        });
      });
      return { id, ...parsed };
    },

    async agentHours(id) {
      const [row] = await db
        .select({ timezone: schema.creators.timezone, agentHours: schema.creators.agentHours })
        .from(schema.creators)
        .where(eq(schema.creators.id, id));
      if (row === undefined) return null;
      const stored = row.agentHours === null ? null : AgentHoursSchema.safeParse(row.agentHours);
      return stored?.success === true
        ? { hours: stored.data, isDefault: false, timeZone: row.timezone }
        : { hours: DEFAULT_AGENT_HOURS, isDefault: true, timeZone: row.timezone };
    },

    async setAgentHours(id, hours, userId) {
      const parsed = hours === null ? null : AgentHoursSchema.parse(hours);
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(schema.creators)
          .set({ agentHours: parsed })
          .where(eq(schema.creators.id, id))
          .returning({ id: schema.creators.id });
        if (updated.length === 0) return false;
        await tx.insert(schema.auditLog).values({
          id: newId(AuditEntryIdSchema),
          userId,
          action: 'creator.agent_hours',
          entity: 'creator',
          entityId: id,
          details: { hours: parsed },
        });
        return true;
      });
    },
  };
}
