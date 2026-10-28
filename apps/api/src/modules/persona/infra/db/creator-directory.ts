import {
  AgentHoursSchema,
  AuditEntryIdSchema,
  canonicalTimezone,
  CreatorIdSchema,
  creatorNameKey,
  DEFAULT_AGENT_HOURS,
  JOB_MAX_ATTEMPTS,
  JOB_PAYLOADS,
  NewCreatorSchema,
  newId,
  nextReplyOpening,
  reopenJobKey,
  type CreatorSummary,
} from '@nirvana/contracts';
import { eq, inArray, schema, sql, type Database } from '@nirvana/db';

import { CreatorConflict, CreatorNameConflict } from '../../domain/errors';
import type { CreatorDirectory } from '../../domain/ports';

/** The unique index on her name (`creators_name_key_unique`) refused the row: another creator has this name. */
const isNameTaken = (error: unknown): boolean =>
  error instanceof Error &&
  [error, error.cause].some(
    (e) =>
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      e.code === '23505' &&
      'constraint' in e &&
      e.constraint === 'creators_name_key_unique',
  );

const toSummary = (row: { id: string; displayName: string; timezone: string }): CreatorSummary => ({
  id: CreatorIdSchema.parse(row.id),
  displayName: row.displayName,
  timezone: row.timezone,
});

export function createDrizzleCreatorDirectory(
  db: Database,
  now: () => Date = () => new Date(),
): CreatorDirectory {
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
      const { id: chosen, displayName, timezone } = NewCreatorSchema.parse(input);
      const parsed = { displayName, timezone: canonicalTimezone(timezone) };
      const id = chosen ?? newId(CreatorIdSchema);
      // The same form sent twice: the creator the first request made, without a second audit line. The same id with
      // other values is not a replay.
      const replayOf = (existing: { id: string; displayName: string; timezone: string }): CreatorSummary => {
        if (existing.displayName !== parsed.displayName || existing.timezone !== parsed.timezone) {
          throw new CreatorConflict();
        }
        return toSummary(existing);
      };
      const byId = async (tx: Pick<Database, 'select'>) => {
        const [existing] = await tx
          .select({
            id: schema.creators.id,
            displayName: schema.creators.displayName,
            timezone: schema.creators.timezone,
          })
          .from(schema.creators)
          .where(eq(schema.creators.id, id));
        return existing;
      };
      try {
        return await db.transaction(async (tx) => {
          const inserted = await tx
            .insert(schema.creators)
            .values({ id, ...parsed, nameKey: creatorNameKey(parsed.displayName) })
            .onConflictDoNothing({ target: schema.creators.id })
            .returning({ id: schema.creators.id });
          if (inserted.length === 0) {
            const existing = await byId(tx);
            if (existing === undefined) throw new Error('creator insert conflicted on an id it cannot read');
            return replayOf(existing);
          }
          await tx.insert(schema.auditLog).values({
            id: newId(AuditEntryIdSchema),
            userId: userId ?? null,
            action: 'creator.create',
            entity: 'creator',
            entityId: id,
            details: { displayName: parsed.displayName, timezone: parsed.timezone },
          });
          return { id, ...parsed };
        });
      } catch (error) {
        if (!isNameTaken(error)) throw error;
        // Her name is taken: by the creator this very form made a moment ago (two sends at once, the second checked
        // the name before the id), which is a replay, or by another creator.
        const existing = await byId(db);
        if (existing !== undefined) return replayOf(existing);
        throw new CreatorNameConflict();
      }
    },

    async agentHours(id) {
      const [row] = await db
        .select({ timezone: schema.creators.timezone, agentHours: schema.creators.agentHours })
        .from(schema.creators)
        .where(eq(schema.creators.id, id));
      if (row === undefined) return null;
      if (row.agentHours === null) {
        return { hours: DEFAULT_AGENT_HOURS, isDefault: true, invalidStored: false, timeZone: row.timezone };
      }
      const stored = AgentHoursSchema.safeParse(row.agentHours);
      return stored.success
        ? { hours: stored.data, isDefault: false, invalidStored: false, timeZone: row.timezone }
        : { hours: DEFAULT_AGENT_HOURS, isDefault: true, invalidStored: true, timeZone: row.timezone };
    },

    async setAgentHours(id, hours, userId) {
      const parsed = hours === null ? null : AgentHoursSchema.parse(hours);
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(schema.creators)
          .set({ agentHours: parsed })
          .where(eq(schema.creators.id, id))
          .returning({ timezone: schema.creators.timezone });
        const [creator] = updated;
        if (creator === undefined) return false;
        const auditId = newId(AuditEntryIdSchema);
        // The fans her old hours put off wait for her opening under the new ones, which may be now (`conversation.reopen`,
        // one per creator): never until an opening that no longer is. With nobody waiting, the job finds nothing.
        const opening = nextReplyOpening(parsed ?? DEFAULT_AGENT_HOURS, creator.timezone, now());
        const payload = JOB_PAYLOADS['conversation.reopen'].parse({
          creatorId: id,
          correlationId: `agent_hours:${auditId}`,
        });
        await tx.execute(
          sql`select public.enqueue_job(
            task => 'conversation.reopen',
            payload => ${JSON.stringify(payload)}::jsonb,
            run_at => ${opening.toISOString()}::timestamptz,
            max_attempts => ${JOB_MAX_ATTEMPTS['conversation.reopen']}::int,
            job_key => ${reopenJobKey(id)}
          )`,
        );
        await tx.insert(schema.auditLog).values({
          id: auditId,
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
