import { ConversationSummarySchema, type ConversationSummary } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import { lastMessageAgo, mergeConversations, statusClass, subline } from './view';

const NOW = new Date('2026-10-17T21:00:00Z');

function conversation(id: string, patch: Partial<ConversationSummary> = {}): ConversationSummary {
  return ConversationSummarySchema.parse({
    id: `0192f3a0-0000-7000-8000-00000000000${id}`,
    fanId: `0192f3a0-0000-7000-8000-0000000000f${id}`,
    fanDisplayName: `Fan ${id}`,
    state: 'idle',
    mode: 'copilot',
    lastInboundAt: null,
    lastOutboundAt: null,
    unreadCount: 0,
    updatedAt: '2026-10-17T20:00:00Z',
    ...patch,
  });
}

describe('mergeConversations', () => {
  it('puts every creator in one list, most recently changed first', () => {
    const a = conversation('1', { updatedAt: '2026-10-17T18:00:00Z' });
    const b = conversation('2', { updatedAt: '2026-10-17T20:30:00Z' });
    const c = conversation('3', { updatedAt: '2026-10-17T19:00:00Z' });
    const lines = mergeConversations([
      { creatorName: 'Créatrice A', items: [a, b] },
      { creatorName: 'Créatrice B', items: [c] },
    ]);
    expect(lines.map((l) => `${l.conversation.fanDisplayName} ${l.creatorName}`)).toEqual([
      'Fan 2 Créatrice A',
      'Fan 3 Créatrice B',
      'Fan 1 Créatrice A',
    ]);
  });
});

describe('lastMessageAgo', () => {
  it('says how long ago, in the unit that reads best', () => {
    expect(lastMessageAgo(null, NOW)).toBeNull();
    expect(lastMessageAgo('2026-10-17T20:59:40Z', NOW)).toBe('à l’instant');
    expect(lastMessageAgo('2026-10-17T20:48:00Z', NOW)).toBe('il y a 12 min');
    expect(lastMessageAgo('2026-10-17T18:00:00Z', NOW)).toBe('il y a 3 h');
    expect(lastMessageAgo('2026-10-15T20:00:00Z', NOW)).toBe('il y a 2 j');
  });
});

describe('subline and statusClass', () => {
  it('reads the mode then the last message, and maps states to their pill', () => {
    expect(subline(conversation('1'), NOW)).toBe('Copilote · pas encore de message');
    expect(subline(conversation('1', { mode: 'auto', lastInboundAt: '2026-10-17T20:55:00Z' }), NOW)).toBe(
      'Automatique · il y a 5 min',
    );
    expect(statusClass('awaiting_approval')).toBe('nv-status--awaiting-approval');
  });
});
