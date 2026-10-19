import {
  AuditEntryIdSchema,
  ConversationIdSchema,
  EventIdSchema,
  ExternalMediaSchema,
  JOB_MAX_ATTEMPTS,
  KillSwitchIdSchema,
  JOB_PAYLOADS,
  MessageAuthorSchema,
  MessageDirectionSchema,
  newId,
} from '@nirvana/contracts';
import {
  and,
  eq,
  schema,
  sql,
  withTenant,
  type Database,
  type Transaction as DbTransaction,
} from '@nirvana/db';
import { z } from 'zod';

import type { Transaction, UnitOfWork } from '../../domain/ports';

import { toConversation, toDraft, toStoredEvent } from './rows';

const OPEN_DRAFT_STATUSES = ['pending', 'approved', 'edited'];

const PlatformMediaSchema = z.array(ExternalMediaSchema);

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
      async idsInMode(mode) {
        const rows = await tx
          .select({ id: schema.conversations.id })
          .from(schema.conversations)
          .where(eq(schema.conversations.mode, mode))
          .orderBy(schema.conversations.id);
        return rows.map((row) => ConversationIdSchema.parse(row.id));
      },
    },

    messages: {
      async insertIfNew(message) {
        const inserted = await tx
          .insert(schema.messages)
          .values({ ...message, platformMedia: [...message.platformMedia], creatorId })
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
      async history(conversationId, limit) {
        const rows = await tx
          .select()
          .from(schema.messages)
          .where(eq(schema.messages.conversationId, conversationId))
          .orderBy(sql`${schema.messages.platformCreatedAt} desc, ${schema.messages.id} desc`)
          .limit(limit);
        return rows.reverse().map((row) => ({
          direction: MessageDirectionSchema.parse(row.direction),
          author: MessageAuthorSchema.parse(row.author),
          text: row.text,
          at: row.platformCreatedAt,
          priceMinor: row.priceMinor,
          isPaid: row.isPaid,
          // Written by ingestion only, through the contract's schema: read back through it too (a column is a boundary).
          media: PlatformMediaSchema.parse(row.platformMedia).map((media) => ({
            kind: media.kind,
            platformMediaId: media.ref.id,
            isLocked: media.isLocked,
          })),
        }));
      },
      async fanContext(fanId) {
        const facts = await tx
          .select({ key: schema.fanFacts.key, value: schema.fanFacts.value })
          .from(schema.fanFacts)
          .where(
            and(
              eq(schema.fanFacts.fanId, fanId),
              sql`${schema.fanFacts.supersededBy} is null`,
              sql`(${schema.fanFacts.expiresAt} is null or ${schema.fanFacts.expiresAt} > now())`,
            ),
          )
          .orderBy(schema.fanFacts.observedAt);
        const [totals] = await tx
          .select({
            spentMinor: sql<number>`coalesce(sum(${schema.messages.priceMinor}) filter (where ${schema.messages.isPaid}), 0)::int`,
            firstMessageAt: sql<string | null>`min(${schema.messages.platformCreatedAt})`,
          })
          .from(schema.messages)
          .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
          .where(eq(schema.conversations.fanId, fanId));
        const firstMessageAt = totals?.firstMessageAt ?? null;
        return {
          notes: facts.map((fact) => `${fact.key} : ${fact.value}`),
          spentMinor: totals?.spentMinor ?? 0,
          firstMessageAt: firstMessageAt === null ? null : new Date(firstMessageAt),
        };
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
      async insert({ bubbles, softViolations, voice, ...draft }) {
        await tx.insert(schema.drafts).values({
          ...draft,
          creatorId,
          bubbles: [...(bubbles ?? [])],
          guardTrace: { softViolations: [...(softViolations ?? [])] },
          ...(voice !== undefined && { promptHashes: { ...voice } }),
        });
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
            max_attempts => ${options.maxAttempts ?? JOB_MAX_ATTEMPTS[job]}::int,
            job_key => ${options.jobKey ?? null}
          )`,
        );
      },
    },

    switches: {
      async lockCreator() {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`agent_mode:${creatorId}`}, 0))`,
        );
      },
      async isOn() {
        const rows = await tx.execute<{ scope: string; active: boolean }>(sql`
          select distinct on (scope) scope, active
          from kill_switches
          where scope = 'global' or (scope = 'creator' and scope_id = ${creatorId})
          order by scope, set_at desc`);
        const on = (scope: string) => rows.rows.some((row) => row.scope === scope && row.active);
        return { global: on('global'), creator: on('creator') };
      },
      async setCreator(entry) {
        await tx.insert(schema.killSwitches).values({
          id: newId(KillSwitchIdSchema),
          scope: 'creator',
          scopeId: creatorId,
          creatorId,
          active: entry.active,
          reason: entry.reason,
          setBy: entry.setBy,
          setAt: sql`clock_timestamp()`,
        });
      },
    },

    audit: {
      async record(entry) {
        await tx.insert(schema.auditLog).values({
          id: newId(AuditEntryIdSchema),
          userId: entry.userId,
          action: entry.action,
          entity: entry.entity ?? 'conversation',
          entityId: entry.entityId,
          details: entry.details ?? {},
        });
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
