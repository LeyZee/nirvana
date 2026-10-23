import { EventIdSchema, FanFlagsSchema, newId, type EventPayload } from '@nirvana/contracts';
import { and, eq, schema, withTenant, type Database } from '@nirvana/db';

import { FanNotFound } from '../domain/errors';
import type { FlagStore } from '../domain/fan';

export function createDrizzleFlagStore(db: Database): FlagStore {
  return {
    read: (creatorId, fanId) =>
      withTenant(db, creatorId, async (tx) => {
        const [row] = await tx
          .select({ flags: schema.fans.flags })
          .from(schema.fans)
          .where(and(eq(schema.fans.id, fanId), eq(schema.fans.creatorId, creatorId)));
        if (row === undefined) throw new FanNotFound();
        // Written by this module only, through the contract: read back through it too (a column is a boundary).
        return FanFlagsSchema.parse(row.flags);
      }),
    change: (creatorId, fanId, change, event) =>
      withTenant(db, creatorId, async (tx) => {
        const [row] = await tx
          .select({ flags: schema.fans.flags })
          .from(schema.fans)
          .where(and(eq(schema.fans.id, fanId), eq(schema.fans.creatorId, creatorId)))
          .for('update');
        if (row === undefined) throw new FanNotFound();
        const before = FanFlagsSchema.parse(row.flags);
        const after = change(before);
        if (after === null) return before;
        await tx.update(schema.fans).set({ flags: after }).where(eq(schema.fans.id, fanId));
        const payload: EventPayload<'fan_flag_set'> = {
          fanId,
          flag: event.flag,
          flags: after,
          ...(event.reason !== undefined && { reason: event.reason }),
        };
        await tx.insert(schema.domainEvents).values({
          id: newId(EventIdSchema),
          creatorId,
          type: event.type,
          payload,
          actor: event.author,
          correlationId: event.correlationId,
        });
        return after;
      }),
  };
}
