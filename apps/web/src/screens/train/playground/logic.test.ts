import type { PlaygroundAnswer as Answer, PlaygroundState } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import { bubblesOf, duration, money, needsAttention, percent, rateTone, stepOf } from './logic';
import { handoffReasons, suggestedDestination } from './model';

const answer = (patch: Partial<Answer> = {}): Answer => ({
  bubbles: ['Coucou toi ✨'],
  isBlocked: false,
  violations: [],
  latencyMs: 1000,
  costUsd: 0.001,
  costEur: 0.0009,
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

  it('counts what a fan spent in euros, as Reveal and the Dashboard do', () => {
    expect(money(4500)).toBe('45\u00a0€');
    expect(money(1999)).toBe('19,99\u00a0€');
  });

  it('turns her answer into one bubble per line', () => {
    expect(bubblesOf('Coucou toi ✨\n\n  Tu fais quoi ?  ')).toEqual(['Coucou toi ✨', 'Tu fais quoi ?']);
  });
});

describe('needsAttention', () => {
  it('opens « Pourquoi » only when something was blocked or flagged', () => {
    expect(needsAttention(null)).toBe(false);
    expect(needsAttention(answer())).toBe(false);
    expect(needsAttention(answer({ isBlocked: true }))).toBe(true);
    expect(needsAttention(answer({ handoff: ['possible_minor'] }))).toBe(true);
    expect(
      needsAttention(
        answer({ trap: { signals: [{ kind: 'override', source: 'fan_message', label: 'Ordre' }] } }),
      ),
    ).toBe(true);
  });
});

describe('suggestedDestination', () => {
  it('sends a correction to the voice examples, a rule reason to a rule, the rest to a test', () => {
    expect(suggestedDestination({ kind: 'validated' })).toBeUndefined();
    expect(suggestedDestination({ kind: 'corrected', text: 'Pas faux !' })).toBe('voice_example');
    expect(suggestedDestination({ kind: 'rejected', reason: 'missed_sale' })).toBe('rule');
    expect(suggestedDestination({ kind: 'rejected', reason: 'sounds_ai' })).toBe('test');
  });
});

describe('handoffReasons', () => {
  it('says in words why a human takes over, without repeats', () => {
    const brief = {
      intent: 'distress',
      sentiment: 'negative',
      risks: ['distress', 'distress'],
      action: 'handoff',
      replyBrief: 'Ne rien écrire.',
      kycMissing: [],
    };
    expect(handoffReasons(answer({ handoff: ['possible_minor'], brief }))).toEqual([
      'Mineur possible',
      'Détresse',
    ]);
    expect(handoffReasons(answer({ handoff: ['new_flag'] }))).toEqual(['new_flag']);
  });

  it('names the newest risks of the brain in words', () => {
    const brief = {
      intent: 'other',
      sentiment: 'negative',
      risks: ['dangerous_request', 'real_abuse'],
      action: 'handoff',
      replyBrief: 'Ne rien écrire.',
      kycMissing: [],
    };
    expect(handoffReasons(answer({ brief }))).toEqual(['Demande dangereuse', 'Récit de violences réelles']);
  });
});

describe('stepOf', () => {
  const state = (pending: Answer | null = null): PlaygroundState => ({
    presets: [],
    presetId: null,
    situation: {
      now: '2026-10-17T21:40:00.000Z',
      timeZone: 'Europe/Paris',
      relationshipStartedAt: '2026-10-17T21:40:00.000Z',
      spentCents: 0,
      isNight: true,
    },
    fanNotes: [],
    history: [],
    rate: { rate: 0.64, rated: 50, validated: 32, target: 0.8, trendPoints: null, previousVersion: null },
    version: { voicePrompt: '1.4.0', voiceModel: 'grok-4.7' },
    rejectReasons: [],
    sessionCostUsd: 0,
    sessionCostEur: 0,
    voice: { reachable: true },
    pending,
  });

  it('proposes the one thing to do next', () => {
    expect(stepOf(state(), 'idle', true)).toBe('busy');
    expect(stepOf(state(), 'idle', false)).toBe('write');
    expect(stepOf(state(answer()), 'idle', false)).toBe('rate');
    expect(stepOf(state(answer({ isBlocked: true })), 'idle', false)).toBe('blocked');
    expect(stepOf(state(answer({ isBlocked: true, handoff: ['possible_minor'] })), 'idle', false)).toBe(
      'handoff',
    );
    expect(stepOf(state(answer()), 'lesson', false)).toBe('lesson');
  });
});
