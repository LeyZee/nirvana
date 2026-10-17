import { EventIdSchema, JOB_PAYLOADS, newId } from '@nirvana/contracts';
import {
  and,
  eq,
  schema,
  sql,
  withTenant,
  type Database,
  type Transaction as DbTransaction,
} from '@nirvana/db';

import type { Transaction, UnitOfWork } from '../../domain/ports';

import { toConversation, toDraft, toStoredEvent } from './rows';

const OPEN_DRAFT_STATUSES = ['pending', 'approved', 'edited'];

/** The repositories of one tenant transaction (`withTenant`: RLS scopes every statement to the creator). */
function bind(tx: DbTransaction, creatorId: string): Transaction {
  return {
    conversations: {
      async lockOrCreate(key) {
        await tx
          .insert(schema.conversations)
          .values({ ...key })
          .onConflictDoNothing({
            target: [schema.conversations.platformAccountId, schema.conversations.platformConversationId],
          });
        const [row] = await tx
          .select()
          .from(schema.conversations)
          .where(
            and(
              eq(schema.conversations.platformAccountId, key.platformAccountId),
              eq(schema.conversations.platformConversationId, key.platformConversationId),
            ),
          )
          .for('update');
        if (row === undefined) throw new Error('Conversation upsert returned no row');
        return toConversation(row);
      },
      async lock(id) {
        const [row] = await tx
          .select()
          .from(schema.conversations)
          .where(eq(schema.conversations.id, id))
          .for('update');
        return row === undefined ? null : toConversation(row);
      },
      async saveProjection(id, projection) {
        await tx
          .update(schema.conversations)
          .set({ ...projection, updatedAt: sql`now()` })
          .where(eq(schema.conversations.id, id));
      },
    },

    messages: {
      async insertIfNew(message) {
        const inserted = await tx
          .insert(schema.messages)
          .values({ ...message, creatorId })
          .onConflictDoNothing({
            target: [schema.messages.platformAccountId, schema.messages.platformMessageId],
          })
          .returning({ id: schema.messages.id });
        return inserted.length > 0;
      },
      async countForDraft(draftId) {
        const [row] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.messages)
          .where(eq(schema.messages.draftId, draftId));
        return row?.count ?? 0;
      },
    },

    drafts: {
      async lock(id) {
        const [row] = await tx.select().from(schema.drafts).where(eq(schema.drafts.id, id)).for('update');
        return row === undefined ? null : toDraft(row);
      },
      async openFor(conversationId) {
        const rows = await tx
          .select()
          .from(schema.drafts)
          .where(
            and(
              eq(schema.drafts.conversationId, conversationId),
              sql`${schema.drafts.status} in ${OPEN_DRAFT_STATUSES}`,
            ),
          )
          .orderBy(schema.drafts.createdAt)
          .for('update');
        return rows.map(toDraft);
      },
      async insert(draft) {
        await tx.insert(schema.drafts).values({ ...draft, creatorId });
      },
      async setStatus(id, status, decision) {
        await tx
          .update(schema.drafts)
          .set({
            status,
            ...(decision === undefined
              ? {}
              : {
                  decidedBy: decision.decidedBy,
                  decidedAt: decision.at,
                  ...(decision.finalBubbles === undefined
                    ? {}
                    : { finalBubbles: [...decision.finalBubbles] }),
                }),
          })
          .where(eq(schema.drafts.id, id));
      },
    },

    events: {
      async append(conversation, body, meta) {
        // The caller holds the conversation's row lock, so `max(seq) + 1` cannot race; the unique index
        // `(conversation_id, seq)` would reject it anyway.
        const [row] = await tx
          .insert(schema.conversationEvents)
          .values({
            id: newId(EventIdSchema),
            creatorId,
            conversationId: conversation.id,
            seq: sql`(select coalesce(max(seq), 0) + 1 from conversation_events where conversation_id = ${conversation.id})`,
            type: body.type,
            payload: body.payload,
            actor: meta.actor,
            correlationId: meta.correlationId,
            createdAt: meta.at,
          })
          .returning({ seq: schema.conversationEvents.seq });
        if (row === undefined) throw new Error('Event insert returned no row');
        return row.seq;
      },
      async publish(eventCreatorId, body, meta) {
        await tx.insert(schema.domainEvents).values({
          id: newId(EventIdSchema),
          creatorId: eventCreatorId,
          type: body.type,
          payload: body.payload,
          actor: meta.actor,
          correlationId: meta.correlationId,
          createdAt: meta.at,
        });
      },
      async list(conversationId) {
        const rows = await tx
          .select()
          .from(schema.conversationEvents)
          .where(eq(schema.conversationEvents.conversationId, conversationId))
          .orderBy(schema.conversationEvents.seq);
        return rows.map(toStoredEvent);
      },
    },

    jobs: {
      async enqueue(job, payload, options) {
        // Validated here too: a job is a boundary (CLAUDE.md rule 6), and a bad payload must fail the command.
        const parsed: unknown = JOB_PAYLOADS[job].parse(payload);
        await tx.execute(
          sql`select public.enqueue_job(
            task => ${job},
            payload => ${JSON.stringify(parsed)}::jsonb,
            queue_name => ${options.queueName ?? null},
            run_at => ${options.runAt?.toISOString() ?? null}::timestamptz,
            max_attempts => ${options.maxAttempts ?? null}::int,
            job_key => ${options.jobKey ?? null}
          )`,
        );
      },
    },

    gate: {
      async blockedReason(conversation) {
        // The latest switch of each scope decides; a global one has no creator and stays visible (RLS).
        const switches = await tx.execute<{ active: boolean }>(sql`
          select distinct on (scope, scope_id) active
          from kill_switches
          where scope = 'global'
             or (scope = 'creator' and scope_id = ${conversation.creatorId})
             or (scope = 'conversation' and scope_id = ${conversation.id})
          order by scope, scope_id, set_at desc`);
        if (switches.rows.some((row) => row.active)) return 'kill_switch';
        const [account] = await tx
          .select({ sessionState: schema.platformAccounts.sessionState })
          .from(schema.platformAccounts)
          .where(eq(schema.platformAccounts.id, conversation.platformAccountId));
        return account?.sessionState === 'expired' ? 'session_expired' : null;
      },
    },
  };
}

export function createDrizzleUnitOfWork(db: Database): UnitOfWork {
  return {
    inTenant: (creatorId, work) => withTenant(db, creatorId, (tx) => work(bind(tx, creatorId))),
  };
}
