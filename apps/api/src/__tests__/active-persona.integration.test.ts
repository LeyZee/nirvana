import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CreatorIdSchema,
  newId,
  PersonaSchema,
  PlatformAccountIdSchema,
  type CreatorId,
  type Persona,
} from '@nirvana/contracts';
import { and, eq, schema } from '@nirvana/db';
import { createTestDb, type TestDb } from '@nirvana/db/testing';
import type { BrainInput, Brief, HealthReport, LlmGateway, VoiceInput } from '@nirvana/llm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { parse } from 'yaml';

import { createApp, type App } from '../composition-root';
import { createLogger } from '../logger';
import {
  activePersonaForModels,
  createAlertTester,
  startDraftComposer,
  type ActivePersonaSource,
} from '../modules/agent';

import { testConfig } from './support/config';

/** The fictional demo persona of the repository (ADR 0010: never a real one in a test). */
const DEMO: Persona = PersonaSchema.parse(
  parse(
    readFileSync(fileURLToPath(new URL('../../../../personas/demo/v0.2.0.yaml', import.meta.url)), 'utf8'),
  ),
);

/** Two versions told apart by their first name: invented, as every name here. */
const version = (number: string, firstName: string): Persona => ({
  ...DEMO,
  meta: { ...DEMO.meta, version: number },
  details: { ...DEMO.details, first_name: firstName },
});

const NO_LOG = { info: () => undefined, warn: () => undefined };

const BRIEF: Brief = {
  intent: 'small_talk',
  sentiment: 'positive',
  factsProposed: [],
  kycMissing: [],
  risks: [],
  action: 'reply',
  replyBrief: 'Lui demander sa journée.',
  toneHints: [],
};
const META = {
  provider: 'xai',
  model: 'grok-4.7',
  isFallback: false,
  latencyMs: 1,
  promptHash: 'h',
} as const;

function health(): HealthReport {
  const role = (name: 'brain' | 'voice') => ({
    role: name,
    state: 'ok' as const,
    active: { provider: 'xai' as const, model: 'grok-4.7', label: 'Grok 4.7' },
    hasKey: true,
    isOnFallback: false,
    callsLastHour: 0,
    errorRateLastHour: 0,
    costTodayUsd: 0,
  });
  return {
    state: 'ok',
    at: new Date(),
    roles: [role('brain'), role('voice')],
    providers: [],
    costTodayUsd: 0,
    budget: { day: '2026-10-29', spentEur: 0, capEur: 20, alertAtEur: 16, state: 'ok' },
  };
}

/** A gateway that answers the brain and the voice, and keeps what they read. */
function recordingGateway() {
  const brain: BrainInput[] = [];
  const voice: VoiceInput[] = [];
  const gateway: LlmGateway = {
    sense: () => Promise.reject(new Error('not used')),
    transcribe: () => Promise.reject(new Error('not used')),
    brain: (input) => {
      brain.push(input);
      return Promise.resolve({ ok: true, value: { output: BRIEF, meta: META } });
    },
    voice: (input) => {
      voice.push(input);
      return Promise.resolve({ ok: true, value: { output: { bubbles: ['Coucou toi'] }, meta: META } });
    },
    health,
    judge: () => Promise.reject(new Error('not used')),
    testConnection: () => Promise.reject(new Error('not used')),
  };
  return { gateway, brain, voice };
}

describe('the agent writes with her active persona version (recette G4, M13; ADR 0010, 0022)', () => {
  let test: TestDb;
  let app: App;
  let anna: CreatorId;
  let bea: CreatorId;
  let activePersona: ActivePersonaSource;

  beforeAll(async () => {
    test = await createTestDb(inject('pgSuperuserUrl'));
    const config = testConfig({ DATABASE_URL: test.appUrl, DATABASE_ADMIN_URL: test.adminUrl });
    app = await createApp(config, createLogger(config));
    anna = (await app.modules.persona.creators.create({ displayName: 'Anna' })).id;
    bea = (await app.modules.persona.creators.create({ displayName: 'Bea' })).id;
    const { versions } = app.modules.persona;
    // Anna: a first version activated, then a second one activated over it.
    await versions.load(anna, version('0.1.0', 'Ancienne'), { sourcePath: 'test', activate: true });
    await versions.load(anna, version('0.2.0', 'Nouvelle'), { sourcePath: 'test', activate: true });
    // Bea: a version stored and never activated.
    await versions.load(bea, version('0.1.0', 'Jamais'), { sourcePath: 'test', activate: false });
    // As the composition root wires it.
    activePersona = (creatorId) => versions.active(CreatorIdSchema.parse(creatorId));
  });

  afterAll(async () => {
    await app.shutdown();
    await test.close();
  });

  it('gives her only active version through the persona port, none to a creator without one', async () => {
    const active = await app.modules.persona.versions.active(anna);
    expect(active).toMatchObject({ version: '0.2.0', creatorName: 'Anna' });
    expect(active?.persona.details.first_name).toBe('Nouvelle');
    expect(await app.modules.persona.versions.active(bea)).toBeNull();
  });

  it('writes the prompts with the second version, the active one, and nothing for a creator without one', async () => {
    const { gateway, brain, voice } = recordingGateway();
    const composer = await startDraftComposer({
      gateway,
      activePersona,
      trainingDir: join(tmpdir(), `nirvana-no-ratings-${newId(CreatorIdSchema)}`),
      timeZoneOf: () => Promise.resolve('Europe/Paris'),
    });
    const input = (creatorId: CreatorId) => ({
      creatorId,
      conversationId: 'conversation-1',
      fanId: 'fan-1',
      draftId: 'draft-1',
      correlationId: 'correlation-1',
      now: new Date('2026-10-29T10:00:00Z'),
      history: [{ direction: 'inbound' as const, text: 'Salut', at: new Date('2026-10-29T09:59:00Z') }],
      fan: { notes: [], spentMinor: 0, firstMessageAt: new Date('2026-10-29T09:59:00Z') },
    });

    expect(await composer.compose(input(anna))).toMatchObject({ kind: 'draft', bubbles: ['Coucou toi'] });
    expect(brain[0]?.creatorName).toBe('Nouvelle');
    expect(brain[0]?.personaSheet).toContain('Nouvelle');
    expect(brain[0]?.personaSheet).not.toContain('Ancienne');
    expect(voice[0]?.creatorName).toBe('Nouvelle');

    expect(await composer.compose(input(bea))).toEqual({
      kind: 'held',
      reason: 'handoff',
      detail: ['persona_inactive'],
      costUsd: 0,
    });
    expect(brain).toHaveLength(1);
  });

  it('« Tester » reads the phrase with the active version of the creator it names', async () => {
    const { gateway, brain } = recordingGateway();
    const tester = createAlertTester({
      gateway,
      personaOf: (creatorId) => activePersonaForModels(activePersona, creatorId, new Date()),
    });
    const alert = { phrase: 'Il demande une vidéo rien que pour lui', keywords: ['vidéo perso'] };

    await tester.test({ creatorId: anna, alert, message: 'Tu me fais une vidéo ?' });
    expect(brain[0]?.creatorName).toBe('Nouvelle');
    expect(brain[0]?.personaSheet).not.toContain('Ancienne');

    const none = await tester.test({ creatorId: bea, alert, message: 'une vidéo perso ?' });
    expect(none).toMatchObject({ keywords: ['vidéo perso'], phraseMatched: null });
    expect(none.reason).toContain('pas de persona active');
    expect(brain).toHaveLength(1);
  });

  it('hands his message to a human when she has no active version, through the app’s own composer', async () => {
    const platformAccountId = newId(PlatformAccountIdSchema);
    await test.admin.db.insert(schema.platformAccounts).values({
      id: platformAccountId,
      creatorId: bea,
      platform: 'reveal',
      handle: 'test-active-persona',
      sessionState: 'valid',
    });
    const { conversationId } = await app.modules.conversations.ingestMessage({
      creatorId: bea,
      platformAccountId,
      platformConversationId: 'c-julien',
      platformFanId: 'f-julien',
      fanDisplayName: 'Julien',
      message: {
        ref: { platform: 'reveal', id: 'm-julien' },
        conversationRef: { platform: 'reveal', id: 'c-julien' },
        direction: 'inbound',
        text: 'Salut',
        media: [],
        priceMinor: null,
        currency: null,
        isPaid: false,
        createdAt: new Date().toISOString(),
      },
      correlationId: 'seed',
    });
    await app.modules.conversations.jobs.respond(
      { creatorId: bea, conversationId, correlationId: 'g4' },
      NO_LOG,
    );

    const handoffs = await test.admin.db
      .select({ payload: schema.domainEvents.payload })
      .from(schema.domainEvents)
      .where(and(eq(schema.domainEvents.creatorId, bea), eq(schema.domainEvents.type, 'handoff_requested')));
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0]?.payload).toMatchObject({ conversationId, cause: 'other' });
    expect(JSON.stringify(handoffs[0]?.payload)).toContain('persona_inactive');
  });
});
