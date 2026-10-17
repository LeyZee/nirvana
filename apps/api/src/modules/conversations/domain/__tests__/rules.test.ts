import { describe, expect, it } from 'vitest';

import { bubbleIdempotencyKey, canSend, debounceFor, DEFAULT_DEBOUNCE_SECONDS } from '../rules';

const AT = new Date('2026-10-17T20:00:00Z');
const later = (seconds: number) => new Date(AT.getTime() + seconds * 1_000);

describe('conversation rules', () => {
  it('waits 45 s by default and keeps a persona pace between 30 and 90 s', () => {
    expect(debounceFor()).toBe(DEFAULT_DEBOUNCE_SECONDS);
    expect(debounceFor({ debounceSeconds: 5 })).toBe(30);
    expect(debounceFor({ debounceSeconds: 60 })).toBe(60);
    expect(debounceFor({ debounceSeconds: 600 })).toBe(90);
  });

  it('sends an approved draft while the conversation is sending and the fan has not written since', () => {
    const base = {
      draftStatus: 'approved',
      draftCreatedAt: AT,
      conversationState: 'sending',
      lastInboundAt: AT,
    } as const;
    expect(canSend(base)).toBe(true);
    expect(canSend({ ...base, draftStatus: 'edited' })).toBe(true);
    expect(canSend({ ...base, draftStatus: 'pending' })).toBe(false);
    expect(canSend({ ...base, conversationState: 'human' })).toBe(false);
    expect(canSend({ ...base, lastInboundAt: later(1) })).toBe(false);
  });

  it('gives each bubble its own idempotency key', () => {
    expect(bubbleIdempotencyKey('d', 0)).not.toBe(bubbleIdempotencyKey('d', 1));
  });
});
