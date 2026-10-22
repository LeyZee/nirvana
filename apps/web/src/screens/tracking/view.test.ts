import { ConversationSummarySchema, type ConversationSummary } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import {
  bubblesFromText,
  lastMessageAgo,
  mergeConversations,
  parseTrackingSearch,
  sharedMode,
  statusClass,
  subline,
} from './view';

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
      { creatorId: 'a', creatorName: 'Créatrice A', items: [a, b] },
      { creatorId: 'b', creatorName: 'Créatrice B', items: [c] },
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

describe('subline, sharedMode and statusClass', () => {
  it('says when he last wrote, with the mode only when the lines do not share one', () => {
    expect(subline(conversation('1'), NOW, false)).toBe('N’a pas encore écrit');
    const auto = conversation('2', { mode: 'auto', lastInboundAt: '2026-10-17T20:55:00Z' });
    expect(subline(auto, NOW, false)).toBe('A écrit il y a 5 min');
    expect(subline(auto, NOW, true)).toBe('Automatique · a écrit il y a 5 min');
  });

  it('finds the mode all lines share, or none', () => {
    const line = (mode: 'copilot' | 'auto') => ({
      conversation: conversation('1', { mode }),
      creatorId: 'a',
      creatorName: 'A',
    });
    expect(sharedMode([line('copilot'), line('copilot')])).toBe('copilot');
    expect(sharedMode([line('copilot'), line('auto')])).toBeNull();
    expect(sharedMode([])).toBeNull();
  });

  it('maps states to their pill', () => {
    expect(statusClass('awaiting_approval')).toBe('nv-status--awaiting-approval');
  });
});

describe('parseTrackingSearch', () => {
  it('opens the conversation of a Telegram link, and ignores anything else', () => {
    const id = '0192f3a0-0000-7000-8000-000000000001';
    expect(parseTrackingSearch({ conversation: id })).toEqual({ conversation: id });
    expect(parseTrackingSearch({ conversation: '<script>' })).toEqual({});
    expect(parseTrackingSearch({ conversation: 42 })).toEqual({});
    expect(parseTrackingSearch({})).toEqual({});
  });
});

describe('bubblesFromText', () => {
  it('makes one bubble per line, and refuses what the server would refuse', () => {
    expect(bubblesFromText('Coucou toi\n\n  Tu fais quoi ?  ')).toEqual(['Coucou toi', 'Tu fais quoi ?']);
    expect(bubblesFromText('  \n ')).toBeNull();
    expect(bubblesFromText(Array.from({ length: 11 }, (_, i) => `b${String(i)}`).join('\n'))).toBeNull();
    expect(bubblesFromText('x'.repeat(2_001))).toBeNull();
  });
});
