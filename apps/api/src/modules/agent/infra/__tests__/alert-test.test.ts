import type { Brief, BrainInput, HealthReport, LlmGateway } from '@nirvana/llm';
import { describe, expect, it } from 'vitest';

import { createAlertTester } from '../alert-test';

const BRIEF: Brief = {
  intent: 'asks_for_service',
  sentiment: 'positive',
  factsProposed: [],
  kycMissing: [],
  risks: [],
  action: 'reply',
  replyBrief: 'Lui dire que tu y penses.',
  toneHints: [],
};

const META = {
  provider: 'xai',
  model: 'grok-4.7',
  isFallback: false,
  latencyMs: 1,
  promptHash: 'h',
} as const;

function health(hasKey: boolean): HealthReport {
  return {
    state: hasKey ? 'ok' : 'down',
    at: new Date(),
    roles: [
      {
        role: 'brain',
        state: hasKey ? 'ok' : 'down',
        active: { provider: 'xai', model: 'grok-4.7', label: 'Grok 4.7' },
        hasKey,
        isOnFallback: false,
        callsLastHour: 0,
        errorRateLastHour: 0,
        costTodayUsd: 0,
      },
    ],
    providers: [],
    costTodayUsd: 0,
    budget: { day: '2026-10-28', spentEur: 0, capEur: 20, alertAtEur: 16, state: 'ok' },
  };
}

/** A brain that answers with `seen` as the alerts it saw, or fails; the inputs it read are kept. */
function tester(
  options: { seen?: string[]; fails?: 'all_models_failed' | 'budget_reached'; hasKey?: boolean } = {},
) {
  const inputs: BrainInput[] = [];
  const gateway: Pick<LlmGateway, 'brain' | 'health'> = {
    brain: (input) => {
      inputs.push(input);
      return Promise.resolve(
        options.fails !== undefined
          ? { ok: false, error: { code: options.fails, attempts: [] } }
          : {
              ok: true,
              value: {
                output: { ...BRIEF, ...(options.seen !== undefined && { alertsSeen: options.seen }) },
                meta: META,
              },
            },
      );
    },
    health: () => health(options.hasKey ?? true),
  };
  return {
    inputs,
    tester: createAlertTester({ gateway, persona: { creatorName: 'Lina', personaSheet: 'fiche' } }),
  };
}

// Fictional messages (ADR 0010).
const alert = { phrase: 'Il demande une vidéo rien que pour lui', keywords: ['vidéo perso', 'rien que moi'] };

describe('createAlertTester (P4-01)', () => {
  it('gives the brain her phrase as her only alert, on that message alone, and reads the id back', async () => {
    const { inputs, tester: t } = tester({ seen: ['a1'] });
    expect(await t.test({ alert, message: 'Tu me ferais une vidéo pour moi ?' })).toEqual({
      keywords: [],
      phraseMatched: true,
      reason: null,
    });
    expect(inputs[0]).toMatchObject({
      history: [{ from: 'fan', text: 'Tu me ferais une vidéo pour moi ?' }],
      alerts: [{ id: 'a1', phrase: alert.phrase }],
      fanNotes: '',
    });
  });

  it('says the phrase is not seen when the brain answers without its id', async () => {
    const { tester: t } = tester({});
    expect(await t.test({ alert, message: 'Coucou' })).toEqual({
      keywords: [],
      phraseMatched: false,
      reason: null,
    });
  });

  it('reads the words without a model, and asks no brain without a phrase', async () => {
    const { inputs, tester: t } = tester({ seen: ['a1'] });
    expect(
      await t.test({
        alert: { phrase: null, keywords: alert.keywords },
        message: 'une VIDEO-perso, rien que moi',
      }),
    ).toEqual({ keywords: ['vidéo perso', 'rien que moi'], phraseMatched: null, reason: null });
    expect(inputs).toHaveLength(0);
  });

  it('still gives the words when the brain cannot be reached or fails, and says why in French', async () => {
    const off = tester({ hasKey: false });
    const unreachable = await off.tester.test({ alert, message: 'une vidéo perso ?' });
    expect(unreachable).toMatchObject({ keywords: ['vidéo perso'], phraseMatched: null });
    expect(unreachable.reason).toContain('Réglages › Modèles IA');
    expect(off.inputs).toHaveLength(0);

    const failed = await tester({ fails: 'all_models_failed' }).tester.test({
      alert,
      message: 'une vidéo perso ?',
    });
    expect(failed).toMatchObject({ keywords: ['vidéo perso'], phraseMatched: null });
    expect(failed.reason).toContain('réessaie');

    const spent = await tester({ fails: 'budget_reached' }).tester.test({ alert, message: 'Coucou' });
    expect(spent).toMatchObject({ keywords: [], phraseMatched: null });
    expect(spent.reason).toContain('budget');
  });
});
