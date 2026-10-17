import type { ProviderVoice } from '@nirvana/contracts';
import { z } from 'zod';

import { voiceNotesLeft } from '../domain/messages';
import type { ProviderVerifier, RefusedKey, VerificationOutcome } from '../domain/verification';

import { getJson, isProviderTrouble, type FetchLike, type HttpReply } from './http';

const SubscriptionSchema = z.object({
  character_count: z.number().int().nonnegative(),
  character_limit: z.number().int().nonnegative(),
});

const VoicesSchema = z.object({
  voices: z.array(z.object({ voice_id: z.string().min(1), name: z.string().min(1) })),
});

/** `{"detail":{"status":"missing_permissions","message":"… missing the permission voices_read …"}}` */
const RefusalSchema = z.object({ detail: z.object({ status: z.string(), message: z.string().optional() }) });

/** Under 10 % of the month's characters, the line turns amber (fiche P3-03, point 4). */
const LOW_CREDIT_SHARE = 0.1;

export interface ElevenLabsVerifierOptions {
  readonly fetch: FetchLike;
  readonly baseUrl?: string;
}

function refusal(reply: HttpReply): RefusedKey | null {
  if (reply.kind === 'unreachable' || isProviderTrouble(reply.status))
    return { ok: false, kind: 'unreachable' };
  if (reply.status === 401 || reply.status === 403) {
    const detail = RefusalSchema.safeParse(reply.body);
    if (detail.success && detail.data.detail.status === 'missing_permissions') {
      const permission = /permission (\w+)/.exec(detail.data.detail.message ?? '')?.[1];
      return permission === undefined
        ? { ok: false, kind: 'missing_permission' }
        : { ok: false, kind: 'missing_permission', permission };
    }
    return { ok: false, kind: 'unauthorized' };
  }
  if (reply.status !== 200) return { ok: false, kind: 'unreachable' };
  return null;
}

/** Keeps the voice already picked if it still exists, else the one named after Messa. */
function pickVoice(
  voices: readonly ProviderVoice[],
  current: ProviderVoice | undefined,
): ProviderVoice | undefined {
  if (current !== undefined && voices.some((v) => v.id === current.id)) return current;
  return voices.find((v) => /messa/i.test(v.name));
}

export function createElevenLabsVerifier(options: ElevenLabsVerifierOptions): ProviderVerifier {
  const baseUrl = options.baseUrl ?? 'https://api.elevenlabs.io';
  return {
    provider: 'elevenlabs',
    async verify(key, settings): Promise<VerificationOutcome> {
      const headers = { 'xi-api-key': key };
      const subscriptionReply = await getJson(options.fetch, `${baseUrl}/v1/user/subscription`, headers);
      const subscriptionRefusal = refusal(subscriptionReply);
      if (subscriptionRefusal !== null) return subscriptionRefusal;
      const voicesReply = await getJson(options.fetch, `${baseUrl}/v1/voices`, headers);
      const voicesRefusal = refusal(voicesReply);
      if (voicesRefusal !== null) return voicesRefusal;
      if (subscriptionReply.kind !== 'reply' || voicesReply.kind !== 'reply')
        return { ok: false, kind: 'unreachable' };

      const subscription = SubscriptionSchema.safeParse(subscriptionReply.body);
      const voiceList = VoicesSchema.safeParse(voicesReply.body);
      if (!subscription.success || !voiceList.success) return { ok: false, kind: 'unreachable' };

      const { character_count: used, character_limit: limit } = subscription.data;
      const left = Math.max(0, limit - used);
      const voices = voiceList.data.voices.map((v) => ({ id: v.voice_id, name: v.name }));
      const voice = pickVoice(voices, settings.voice);
      const notes = voiceNotesLeft(left).toLocaleString('fr-FR');
      return {
        ok: true,
        keyLabel: null,
        summary:
          voice === undefined
            ? `${notes} vocaux ce mois · aucune voix choisie`
            : `Voix de ${voice.name} · ${notes} vocaux ce mois`,
        facts: [
          { label: 'Ce mois', value: `${notes} vocaux possibles` },
          {
            label: 'Voix',
            value:
              voice?.name ??
              'Aucune voix clonée trouvée. Crée la voix de Messa dans ElevenLabs, puis reviens.',
          },
        ],
        settings: voice === undefined ? {} : { voice },
        voices,
        charactersLeft: left,
        isLowCredit: limit > 0 && left < limit * LOW_CREDIT_SHARE,
      };
    },
  };
}
