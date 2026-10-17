import { ProviderErrorKindSchema, type ProviderStatus } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import { DASHBOARD_PROVIDERS } from '../catalog';
import {
  applyReverification,
  credentialFromVerification,
  markRefusedInProduction,
  toStatus,
} from '../credential';
import { checkKeyShape, detectProvider } from '../key-shape';
import { describeLowCredit, describeRefusal } from '../messages';
import { nextAction } from '../next-action';
import type { VerifiedKey } from '../verification';

const FAKE_XAI = 'xai-FAKEFAKEFAKEFAKEFAKEFAKE0000';
const FAKE_GOOGLE = 'AIzaFAKEFAKEFAKEFAKEFAKEFAKE000';
const FAKE_ELEVEN = 'sk_FAKEFAKEFAKEFAKEFAKEFAKE0000';
const NOW = new Date('2026-10-17T19:00:00Z');

const verified: VerifiedKey = {
  ok: true,
  keyLabel: 'nirvana-prod',
  summary: 'Grok 4.7 écrit et décide',
  facts: [{ label: 'Modèle', value: 'Grok 4.7' }],
  settings: {},
  voices: [],
  charactersLeft: null,
  isLowCredit: false,
};

function status(provider: ProviderStatus['provider'], state: ProviderStatus['state']): ProviderStatus {
  return { ...toStatus(provider, null, null), state };
}

describe('key shape', () => {
  it('recognises each console by its prefix', () => {
    expect(detectProvider(FAKE_XAI)).toBe('xai');
    expect(detectProvider(FAKE_GOOGLE)).toBe('google');
    expect(detectProvider(FAKE_ELEVEN)).toBe('elevenlabs');
    expect(detectProvider('mistral-like-key-without-prefix')).toBeUndefined();
  });

  it('refuses a cut paste and a key meant for another service, before any call', () => {
    expect(checkKeyShape('xai', 'xai-abc')).toEqual({ ok: false, error: { kind: 'too_short' } });
    expect(checkKeyShape('xai', FAKE_GOOGLE)).toEqual({
      ok: false,
      error: { kind: 'wrong_provider', belongsTo: 'google' },
    });
    expect(checkKeyShape('google', `  ${FAKE_GOOGLE}\n`)).toEqual({ ok: true, value: FAKE_GOOGLE });
  });
});

describe('the single translation table', () => {
  it('has one French sentence per refusal and provider, never an HTTP code', () => {
    for (const provider of DASHBOARD_PROVIDERS) {
      for (const kind of ProviderErrorKindSchema.options) {
        const sentence = describeRefusal(provider, kind);
        expect(sentence.length).toBeGreaterThan(10);
        expect(sentence).not.toMatch(/\b(400|401|403|404|429|500)\b/);
      }
    }
  });

  it('says where a misplaced key belongs and which Gemini models the key sees', () => {
    expect(describeRefusal('xai', 'wrong_provider', { belongsTo: 'google' })).toBe(
      'Cette clé vient de Google : elle va dans Gemini.',
    );
    expect(describeRefusal('xai', 'unauthorized')).toBe(
      'xAI ne reconnaît pas cette clé. Vérifie qu’elle est copiée en entier.',
    );
    expect(
      describeRefusal('google', 'vision_model_missing', {
        visionModel: 'gemini-3.8-flash',
        availableModels: ['gemini-3.5-flash'],
      }),
    ).toBe('gemini-3.8-flash n’est pas visible avec cette clé. Modèles trouvés : gemini-3.5-flash.');
    expect(describeRefusal('elevenlabs', 'missing_permission', { permission: 'voices_read' })).toBe(
      'La clé ne peut pas lire tout ce qu’il faut. Ajoute Voices en lecture à ses accès.',
    );
  });

  it('counts low credit in voice notes', () => {
    expect(describeLowCredit(4_000)).toBe('Plus que 40 vocaux ce mois. Recharge avant d’en manquer.');
  });
});

describe('credential states', () => {
  const saved = credentialFromVerification('xai', FAKE_XAI, verified, NOW);

  it('stays as it is when the provider cannot be reached', () => {
    expect(applyReverification(saved, { ok: false, kind: 'unreachable' }, NOW)).toBe(saved);
  });

  it('turns red on a real refusal, at the check or on a production call', () => {
    expect(applyReverification(saved, { ok: false, kind: 'unauthorized' }, NOW).state).toBe(
      'needs_reconnect',
    );
    const refused = markRefusedInProduction(saved, 'unauthorized');
    expect(toStatus('xai', refused, 'dashboard').message).toBe(
      'xAI refuse la clé. L’agent est passé en copilote.',
    );
  });

  it('never puts the key in the status', () => {
    expect(JSON.stringify(toStatus('xai', saved, 'dashboard'))).not.toContain(FAKE_XAI);
  });
});

describe('next action', () => {
  it('asks for Grok first, as it stops the agent', () => {
    const action = nextAction(DASHBOARD_PROVIDERS.map((p) => status(p, 'not_connected')));
    expect(action).toMatchObject({ kind: 'connect', provider: 'xai', lead: 'Connecte Grok' });
  });

  it('puts a refused key before low credit, and low credit before a missing service', () => {
    expect(
      nextAction([
        status('xai', 'connected'),
        status('google', 'needs_reconnect'),
        status('elevenlabs', 'low_credit'),
      ]).kind,
    ).toBe('replace_key');
    expect(
      nextAction([
        status('xai', 'connected'),
        status('google', 'not_connected'),
        status('elevenlabs', 'low_credit'),
      ]).kind,
    ).toBe('top_up');
  });

  it('says when the last one is left, then that all is set', () => {
    expect(
      nextAction([
        status('xai', 'connected'),
        status('google', 'connected'),
        status('elevenlabs', 'not_connected'),
      ]),
    ).toMatchObject({
      provider: 'elevenlabs',
      detail: 'C’est le dernier. Tu peux aussi le faire plus tard.',
    });
    expect(nextAction(DASHBOARD_PROVIDERS.map((p) => status(p, 'connected'))).kind).toBe('all_set');
  });
});
