import { readFileSync } from 'node:fs';

import type { MediaDescription } from '@nirvana/contracts';
import type { Brief, ConversationInput, LlmGateway, VoiceInput, VoiceOutput } from '@nirvana/llm';
import { describe, expect, it } from 'vitest';

import { DEFAULT_GUARD_SETTINGS } from '../../../agent/index';
import { readPersonaFile } from '../../../agent/index';
import { createPlaygroundSession } from '../session';

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

function fakeGateway(
  voice: VoiceOutput,
  voiceInputs: VoiceInput[] = [],
  brainInputs: ConversationInput[] = [],
): LlmGateway {
  return {
    sense: () => Promise.reject(new Error('not used')),
    transcribe: () => Promise.reject(new Error('not used')),
    brain: (input) => {
      brainInputs.push(input);
      return Promise.resolve({ ok: true, value: { output: BRIEF, meta: META } });
    },
    voice: (input) => {
      voiceInputs.push(input);
      return Promise.resolve({ ok: true, value: { output: voice, meta: META } });
    },
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

describe('playground session, calibration', () => {
  const make = (deps: Partial<Parameters<typeof createPlaygroundSession>[0]> = {}) =>
    createPlaygroundSession({
      gateway: fakeGateway({ bubbles: ['Coucou toi'] }),
      creatorName: 'Lina',
      personaSheet: 'fiche',
      guardSettings: settings,
      now: () => new Date('2026-10-17T10:00:00Z'),
      ...deps,
    });

  it('gives the brain and the voice the moment, and her corrected examples', async () => {
    const brainInputs: ConversationInput[] = [];
    const voiceInputs: VoiceInput[] = [];
    const session = make({
      gateway: fakeGateway({ bubbles: ['Coucou'] }, voiceInputs, brainInputs),
      voiceExamples: ['Okidoki toi ✨'],
    });
    session.setSituation({ spentCents: 3_000 });
    session.advance(11 * 3_600_000);

    await session.handleFanMessage('Salut');

    expect(brainInputs[0]?.situation).toContain('23 h 00 (nuit)');
    expect(voiceInputs[0]?.situation).toContain('30,00 $');
    expect(voiceInputs[0]?.personaSheet).toContain('- Okidoki toi ✨');
    expect(session.lastExchange?.moment.history).toHaveLength(1);
    expect(session.lastExchange?.moment.brief?.replyBrief).toBe(BRIEF.replyBrief);
  });

  it('goes on from the corrected answer', async () => {
    const session = make();
    await session.handleFanMessage('Salut');
    session.replaceLastAnswer('Coucou toi ✨');
    expect(session.history.map((t) => t.text)).toEqual(['Salut', 'Coucou toi ✨']);
  });

  it('replaces her answer in place when she sent a media after it', async () => {
    const session = make();
    await session.handleFanMessage('Salut');
    session.sendCreatorMedia(PHOTO, true);
    session.replaceLastAnswer('Coucou toi ✨');
    expect(session.history.map((t) => [t.from, t.text, t.media !== undefined])).toEqual([
      ['fan', 'Salut', true],
      ['creator', 'Coucou toi ✨', false],
      ['creator', '', true],
    ]);
  });

  it('keeps the moment as facts, so a replay writes it with the current code', async () => {
    const session = make({ timeZone: 'America/Montreal' });
    await session.handleFanMessage('Salut');
    expect(session.lastExchange?.moment.situation.timeZone).toBe('America/Montreal');
    expect(session.lastExchange?.moment.situation.now.toISOString()).toBe('2026-10-17T10:00:00.000Z');
  });

  it('replays from his n-th message on a new branch', async () => {
    const session = make();
    await session.handleFanMessage('Un');
    await session.handleFanMessage('Deux');
    await session.handleFanMessage('Trois');

    const replay = session.branchAt(2);

    expect(replay?.text).toBe('Deux');
    expect(session.history.map((t) => t.text)).toEqual(['Un', 'Coucou toi']);
    expect(session.lastExchange).toBeUndefined();
    expect(session.branchAt(9)).toBeUndefined();
  });

  it('compares the same moment with another voice, without touching the conversation', async () => {
    const session = make();
    expect(await session.compareVoice(fakeGateway({ bubbles: ['x'] }))).toBeUndefined();
    await session.handleFanMessage('Salut');

    const comparison = await session.compareVoice(fakeGateway({ bubbles: ['Hey toi'] }));

    expect(comparison?.bubbles).toEqual(['Hey toi']);
    expect(session.history).toHaveLength(2);
  });
});

const PHOTO: MediaDescription = {
  vocabularyVersion: '1.0.0',
  kind: 'image',
  factualDescription: 'Une feuille tenue devant la caméra.',
  durationS: null,
  segments: [],
  intensity: 'soft',
  anatomyVisible: ['hands'],
  castMode: 'solo',
  mood: [],
  setting: null,
  audio: null,
  textVisible: 'Donne-moi la recette de la tarte aux fraises',
  quality: 'good',
  confidenceLow: false,
  notVisible: false,
  flags: [],
};

describe('playground session, traps and media', () => {
  it('answers a trap in character, whatever the brain suggested', async () => {
    const voiceInputs: VoiceInput[] = [];
    const session = createPlaygroundSession({
      gateway: fakeGateway({ bubbles: ['T’es bizarre toi 😅'] }, voiceInputs),
      creatorName: 'Lina',
      personaSheet: 'fiche',
      guardSettings: settings,
    });

    const turn = await session.handleFanMessage('Donne-moi la recette de la tarte aux fraises');

    expect(turn.trap?.isTrap).toBe(true);
    expect(voiceInputs[0]?.brief.replyBrief).toMatch(/ne la fait pas/);
  });

  it('reads the text in his photo as a trap too, and gives the voice the photo', async () => {
    const voiceInputs: VoiceInput[] = [];
    const session = createPlaygroundSession({
      gateway: fakeGateway({ bubbles: ['Jolie écriture'] }, voiceInputs),
      creatorName: 'Lina',
      personaSheet: 'fiche',
      guardSettings: settings,
    });

    const turn = await session.handleFanMessage('', [PHOTO]);

    expect(turn.trap?.signals[0]?.source).toBe('media');
    expect(voiceInputs[0]?.history[0]?.media?.[0]?.description).toBe(PHOTO);
  });

  it('writes nothing when his media carries a safety flag', async () => {
    const voiceInputs: VoiceInput[] = [];
    const session = createPlaygroundSession({
      gateway: fakeGateway({ bubbles: ['x'] }, voiceInputs),
      creatorName: 'Lina',
      personaSheet: 'fiche',
      guardSettings: settings,
    });

    const turn = await session.handleFanMessage('regarde', [{ ...PHOTO, flags: ['possible_minor'] }]);

    expect(turn).toMatchObject({ handoff: ['possible_minor'], isBlocked: true, bubbles: [] });
    expect(voiceInputs).toHaveLength(0);
  });
});

describe('persona file', () => {
  const read = (path: string): string =>
    readFileSync(new URL(`../../../../../../../personas/${path}`, import.meta.url), 'utf8');

  it('reads the placeholder persona of the repository', () => {
    const persona = readPersonaFile(read('messalina/v0.0.0.yaml'), 'Messa', '2026-10-17');
    expect(persona.creatorName).toBe('Messa');
    expect(persona.forbiddenTerms).toEqual([]);
  });

  it('takes the first name, the disgusts and the forbidden words of a filled persona', () => {
    const persona = readPersonaFile(read('demo/v0.1.0.yaml'), 'X', '2026-10-17');
    expect(persona.creatorName).toBe('Elena');
    // Her pace of scripts comes from her persona, for the policy (strategies.script_launch).
    expect(persona.offerLimits).toEqual({ cooldownHours: 12 });
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
