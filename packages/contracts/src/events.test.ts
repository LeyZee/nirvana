import { describe, expect, it } from 'vitest';

import { ConversationEventSchema, DomainEventSchema, EVENT_PAYLOADS, EVENT_TYPES } from './events';
import { ConversationIdSchema, CreatorIdSchema, MessageIdSchema, newId } from './ids';

const envelope = () => ({
  id: newId(MessageIdSchema),
  actor: 'system' as const,
  correlationId: 'req-1',
  createdAt: '2026-10-17T19:00:00.000Z',
});

describe('events', () => {
  it('has one payload schema per event type of the closed list', () => {
    expect(Object.keys(EVENT_PAYLOADS).sort()).toEqual([...EVENT_TYPES].sort());
  });

  it('parses a conversation event and narrows its payload on the type', () => {
    const event = ConversationEventSchema.parse({
      ...envelope(),
      creatorId: newId(CreatorIdSchema),
      conversationId: newId(ConversationIdSchema),
      seq: 1,
      type: 'message_received',
      payload: {
        messageId: newId(MessageIdSchema),
        platformMessageId: 'rv-1',
        direction: 'inbound',
        author: 'fan',
        mediaIds: [],
      },
    });
    expect(event.type === 'message_received' && event.payload.author).toBe('fan');
  });

  it('refuses a payload that belongs to another type, and an unknown type', () => {
    const base = { ...envelope(), creatorId: null };
    expect(
      DomainEventSchema.safeParse({
        ...base,
        type: 'kill_switch_toggled',
        payload: { code: 'x', retryable: true },
      }).success,
    ).toBe(false);
    expect(DomainEventSchema.safeParse({ ...base, type: 'fan_fact_recorded', payload: {} }).success).toBe(
      false,
    );
  });

  it('accepts a human actor only with a user id', () => {
    const base = { ...envelope(), creatorId: null, type: 'error', payload: { code: 'x', retryable: false } };
    expect(DomainEventSchema.safeParse({ ...base, actor: `human:${newId(MessageIdSchema)}` }).success).toBe(
      true,
    );
    expect(DomainEventSchema.safeParse({ ...base, actor: 'human:charles' }).success).toBe(false);
  });
});
