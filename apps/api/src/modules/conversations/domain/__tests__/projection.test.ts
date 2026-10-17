import { EventBodySchema } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import { applyEvent, INITIAL_PROJECTION, rebuildProjection } from '../projection';

const DRAFT = '0199f2a0-0000-7000-8000-0000000000d1';
const MESSAGE = '0199f2a0-0000-7000-8000-0000000000a1';
const at = (minute: number) => new Date(`2026-10-17T20:${String(minute).padStart(2, '0')}:00Z`);

const message = { messageId: MESSAGE, platformMessageId: 'p1', mediaIds: [] };
const inbound = EventBodySchema.parse({
  type: 'message_received',
  payload: { ...message, direction: 'inbound', author: 'fan' },
});
const sent = EventBodySchema.parse({
  type: 'message_sent',
  payload: { ...message, direction: 'outbound', author: 'ai' },
});

describe('conversation projection', () => {
  it('counts unread fan messages and resets them when an answer leaves', () => {
    const afterTwo = rebuildProjection([
      { body: inbound, at: at(1) },
      { body: inbound, at: at(2) },
    ]);
    expect(afterTwo).toMatchObject({ state: 'pending', unreadCount: 2, lastInboundAt: at(2) });
    expect(applyEvent(afterTwo, sent, at(3))).toMatchObject({ unreadCount: 0, lastOutboundAt: at(3) });
  });

  it('ignores an event the state machine refuses, so a journal always folds', () => {
    const approved = EventBodySchema.parse({
      type: 'draft_approved',
      payload: { draftId: DRAFT, status: 'approved' },
    });
    expect(applyEvent(INITIAL_PROJECTION, approved, at(1)).state).toBe('idle');
  });

  it('leaves `sending` for `error` on a final failure, whatever the attempt; an older event counts attempts', () => {
    const sending = { ...INITIAL_PROJECTION, state: 'sending' as const };
    const failed = (attempt: number, isFinal?: boolean) =>
      EventBodySchema.parse({
        type: 'send_failed',
        payload: {
          draftId: DRAFT,
          idempotencyKey: `${DRAFT}:0`,
          attempt,
          ...(isFinal === undefined ? {} : { isFinal }),
        },
      });
    expect(applyEvent(sending, failed(1, true), at(1)).state).toBe('error');
    expect(applyEvent(sending, failed(1, false), at(1)).state).toBe('sending');
    expect(applyEvent(sending, failed(3), at(1)).state).toBe('error');
    expect(applyEvent(sending, failed(1), at(1)).state).toBe('sending');
  });

  it('records a mode change', () => {
    const body = EventBodySchema.parse({ type: 'mode_changed', payload: { mode: 'auto' } });
    expect(applyEvent(INITIAL_PROJECTION, body, at(1)).mode).toBe('auto');
  });
});
