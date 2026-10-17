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
  it('reads the placeholder persona of the repository', () => {
    const source = readFileSync(
      new URL('../../../../personas/messalina/v0.0.0.yaml', import.meta.url),
      'utf8',
    );
    const persona = readPersonaFile(source, 'Messa');
    expect(persona.creatorName).toBe('Messa');
    expect(persona.forbiddenTerms).toEqual([]);
    expect(persona.personaSheet).toContain('style:');
  });

  it('takes the first name and the disgusts when they are filled', () => {
    const persona = readPersonaFile('identity:\n  first_name: Lina\nboundaries:\n  disgusts: [pieds]\n', 'X');
    expect(persona).toMatchObject({ creatorName: 'Lina', forbiddenTerms: ['pieds'] });
  });
});
