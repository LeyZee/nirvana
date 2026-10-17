import type { ProviderStatus } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import { checkedAgo, dotOf, dotOfNext, nextAfter, segments } from './view';

function status(provider: ProviderStatus['provider'], state: ProviderStatus['state']): ProviderStatus {
  return {
    provider,
    state,
    source: state === 'not_connected' ? null : 'dashboard',
    keyLabel: null,
    verifiedAt: null,
    message: 'Message',
    facts: [],
    settings: {},
    voices: [],
  };
}

describe('Services view rules', () => {
  it('says when a key was last checked', () => {
    const now = new Date('2026-10-17T20:00:00Z');
    expect(checkedAgo(null, now)).toBeNull();
    expect(checkedAgo('2026-10-17T19:59:40Z', now)).toBe('vérifié à l’instant');
    expect(checkedAgo('2026-10-17T19:48:00Z', now)).toBe('vérifié il y a 12 min');
    expect(checkedAgo('2026-10-17T17:00:00Z', now)).toBe('vérifié il y a 3 h');
  });

  it('fills one segment per working service, red for a refused key', () => {
    expect(
      segments([
        status('xai', 'connected'),
        status('google', 'needs_reconnect'),
        status('elevenlabs', 'not_connected'),
      ]),
    ).toEqual(['on', 'bad', 'off']);
  });

  it('offers the next service still to connect, then « Terminé »', () => {
    const services = [
      status('xai', 'connected'),
      status('google', 'not_connected'),
      status('elevenlabs', 'not_connected'),
    ];
    expect(nextAfter(services, 'xai')).toEqual({ label: 'Continuer avec Gemini', provider: 'google' });
    expect(nextAfter([status('xai', 'connected')], 'xai')).toEqual({ label: 'Terminé', provider: null });
  });

  it('rings Grok in neon while it is missing, the others in grey', () => {
    expect(dotOf(status('xai', 'not_connected'), false)).toBe('must');
    expect(dotOf(status('google', 'not_connected'), false)).toBe('off');
    expect(dotOf(status('google', 'connected'), true)).toBe('busy');
    expect(dotOfNext({ kind: 'connect', provider: 'xai', lead: 'Connecte Grok', detail: 'd' })).toBe('must');
    expect(dotOfNext({ kind: 'all_set', lead: 'Tout est connecté', detail: 'd' })).toBe('ok');
  });
});
