import { CurrencySchema, LlmRoleSchema } from '@nirvana/contracts';
import { char, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, enumCheck, enumText, id, tenantPolicy } from './columns';
import { conversations, drafts } from './conversations';
import { creators } from './tenancy';

/** Journal of LLM calls (packages/llm): metadata only, never the prompt or the answer. */
export const LLM_CALL_STATUSES = ['ok', 'error', 'refused', 'timeout'] as const;

export const llmCalls = pgTable(
  'llm_calls',
  {
    id: id(),
    creatorId: uuid('creator_id').references(() => creators.id),
    role: enumText('role').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    promptHash: text('prompt_hash').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    costMinor: integer('cost_minor'),
    currency: char('currency', { length: 3 }),
    latencyMs: integer('latency_ms').notNull(),
    status: enumText('status').notNull(),
    conversationId: uuid('conversation_id').references(() => conversations.id),
    draftId: uuid('draft_id').references(() => drafts.id),
    traceId: text('trace_id'),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck('llm_calls', t.role, LlmRoleSchema.options),
    enumCheck('llm_calls', t.status, LLM_CALL_STATUSES),
    enumCheck('llm_calls', t.currency, CurrencySchema.options),
    index('llm_calls_creator_created_idx').on(t.creatorId, t.createdAt),
    tenantPolicy(t.creatorId),
  ],
);
