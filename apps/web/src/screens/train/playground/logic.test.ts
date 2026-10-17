import { describe, expect, it } from 'vitest';

import { bubblesOf, destinationFor, duration, needsAttention, percent, rateTone, stepOf } from './logic';
import type { Answer, PlaygroundState } from './model';

const answer = (patch: Partial<Answer> = {}): Answer => ({
  bubbles: ['Coucou toi ✨'],
  isBlocked: false,
  violations: [],
  latencyMs: 1000,
  costUsd: 0.001,
  isFallback: false,
  ...patch,
});

describe('rateTone', () => {
  it('is neutral at the target, amber under it, red under 60 %', () => {
    expect(rateTone(0.8, 0.8)).toBe('ok');
    expect(rateTone(0.64, 0.8)).toBe('warn');
    expect(rateTone(0.59, 0.8)).toBe('bad');
    expect(rateTone(null, 0.8)).toBe('ok');
  });
});

describe('formatting', () => {
  it('writes the rate and the relationship age the way the screen says them', () => {
    expect(percent(0.644)).toBe('64 %');
    expect(percent(null)).toBe('—');
    expect(duration(6 * 60_000)).toBe('6 min');
    expect(duration(3 * 3_600_000)).toBe('3 h');
    expect(duration(74 * 3_600_000)).toBe('3 j 2 h');
    expect(duration(48 * 3_600_000)).toBe('2 j');
  });

  it('turns her answer into one bubble per line', () => {
    expect(bubblesOf('Coucou toi ✨\n\n  Tu fais quoi ?  ')).toEqual(['Coucou toi ✨', 'Tu fais quoi ?']);
  });
});

describe('needsAttention', () => {
  it('opens « Pourquoi » only when something was blocked or flagged', () => {
    expect(needsAttention(undefined)).toBe(false);
    expect(needsAttention(answer())).toBe(false);
    expect(needsAttention(answer({ isBlocked: true }))).toBe(true);
    expect(needsAttention(answer({ handoff: ['Mineur suspecté'] }))).toBe(true);
    expect(
      needsAttention(answer({ trap: [{ code: 'injection', label: 'Consigne', blocking: false }] })),
    ).toBe(true);
  });
});

describe('destinationFor', () => {
  const reasons: PlaygroundState['reasons'] = [
    { code: 'sounds_ai', label: 'Sonne IA', destination: 'test' },
    { code: 'missed_sale', label: 'Vente ratée', destination: 'rule' },
  ];

  it('sends a correction to the voice examples and a rejection where its reason says', () => {
    expect(destinationFor({ kind: 'validated' }, reasons)).toBeUndefined();
    expect(destinationFor({ kind: 'corrected', text: 'Pas faux !' }, reasons)).toBe('voice_example');
    expect(destinationFor({ kind: 'rejected', reason: 'missed_sale' }, reasons)).toBe('rule');
    expect(destinationFor({ kind: 'rejected', reason: 'unknown' }, reasons)).toBe('test');
  });
});

describe('stepOf', () => {
  const state = (pending?: Answer): PlaygroundState => ({
    presets: [],
    reasons: [],
    situation: {
      now: '2026-10-17T21:40:00.000Z',
      timeZone: 'Europe/Paris',
      relationshipStartedAt: '2026-10-17T21:40:00.000Z',
      spentCents: 0,
      isNight: true,
    },
    fanNotes: [],
    history: [],
    ...(pending && { pending }),
    rate: { rate: 0.64, rated: 50, validated: 32, target: 0.8 },
    version: { voicePrompt: '1.4.0', voiceModel: 'grok-4.7' },
    sessionCostUsd: 0,
  });

  it('proposes the one thing to do next', () => {
    expect(stepOf(state(), 'idle', true)).toBe('busy');
    expect(stepOf(state(), 'idle', false)).toBe('write');
    expect(stepOf(state(answer()), 'idle', false)).toBe('rate');
    expect(stepOf(state(answer({ isBlocked: true })), 'idle', false)).toBe('blocked');
    expect(stepOf(state(answer({ isBlocked: true, handoff: ['Détresse'] })), 'idle', false)).toBe('handoff');
    expect(stepOf(state(answer()), 'lesson', false)).toBe('lesson');
  });
});
