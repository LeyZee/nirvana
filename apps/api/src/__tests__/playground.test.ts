import { readFileSync } from 'node:fs';

import type { Brief, LlmGateway, VoiceOutput } from '@nirvana/llm';
import { describe, expect, it } from 'vitest';

import { DEFAULT_GUARD_SETTINGS } from '../modules/agent/index';
import { readPersonaFile } from '../scripts/persona-file';
import { createPlaygroundSession } from '../scripts/playground-session';

const BRIEF: Brief = {
  intent: 'kyc_answer',
  sentiment: 'positive',
  factsProposed: [
    { category: 'identity', key: 'first_name', value: 'Julien', kind: 'declared', confidence: 1 },
  ],
  kycMissing: ['age'],
  risks: [],
  action: 'reply',
  replyBrief: 'Retenir son prénom et lui demander son âge.',
  toneHints: [],
};

const META = {
  provider: 'xai',
  model: 'grok-4.7',
  isFallback: false,
  latencyMs: 900,
  costUsd: 0.002,
  promptHash: 'h',
} as const;

function fakeGateway(voice: VoiceOutput): LlmGateway {
  return {
    brain: () => Promise.resolve({ ok: true, value: { output: BRIEF, meta: META } }),
    voice: () => Promise.resolve({ ok: true, value: { output: voice, meta: META } }),
    health: () => {
      throw new Error('not used');
    },
    testConnection: () => Promise.reject(new Error('not used')),
  };
}

const settings = { ...DEFAULT_GUARD_SETTINGS, forbiddenTerms: [] };

describe('playground session', () => {
  it('runs brain, voice and guards, keeps notes and the history', async () => {
    const session = createPlaygroundSession({
      gateway: fakeGateway({ bubbles: ['Enchantée Julien ✨', 'Et tu as quel âge'] }),
      creatorName: 'Lina',
      personaSheet: 'fiche',
      guardSettings: settings,
    });

    const turn = await session.handleFanMessage('Moi c’est Julien');

    expect(turn.isBlocked).toBe(false);
    expect(turn.costUsd).toBeCloseTo(0.004);
    expect(session.history.map((t) => t.from)).toEqual(['fan', 'creator']);
    expect(session.fanNotes).toEqual(['identity / first_name : Julien (declared)']);
    session.reset();
    expect(session.history).toHaveLength(0);
  });

  it('shows a blocked answer without adding it to the conversation', async () => {
    const session = createPlaygroundSession({
      gateway: fakeGateway({ bubbles: ['Je suis une IA'] }),
      creatorName: 'Lina',
      personaSheet: 'fiche',
      guardSettings: settings,
    });

    const turn = await session.handleFanMessage('T’es un bot ?');

    expect(turn.isBlocked).toBe(true);
    expect(turn.violations.map((v) => v.code)).toContain('ai_disclosure');
    expect(session.history.map((t) => t.from)).toEqual(['fan']);
  });
});

describe('persona file', () => {
  const read = (path: string): string =>
    readFileSync(new URL(`../../../../personas/${path}`, import.meta.url), 'utf8');

  it('reads the placeholder persona of the repository', () => {
    const persona = readPersonaFile(read('messalina/v0.0.0.yaml'), 'Messa', '2026-10-17');
    expect(persona.creatorName).toBe('Messa');
    expect(persona.forbiddenTerms).toEqual([]);
  });

  it('takes the first name, the disgusts and the forbidden words of a filled persona', () => {
    const persona = readPersonaFile(read('demo/v0.1.0.yaml'), 'X', '2026-10-17');
    expect(persona.creatorName).toBe('Elena');
    expect(persona.forbiddenTerms).toEqual([
      'Insultes',
      'Humiliation',
      "Je t'aime",
      'Mon adresse',
      'Mon numéro',
    ]);
  });

  it('gives the model her age and voice, never the date of birth nor the rules code applies', () => {
    const { personaSheet } = readPersonaFile(read('demo/v0.1.0.yaml'), 'X', '2026-10-17');
    expect(personaSheet).toContain('age: 25');
    expect(personaSheet).toContain('additional_info:');
    expect(personaSheet).not.toMatch(/date_of_birth|strategies|follow_ups|notifications/);
  });

  it('refuses a file outside the persona schema', () => {
    expect(() => readPersonaFile('identity:\n  first_name: Lina\n', 'X', '2026-10-17')).toThrow();
  });
});
