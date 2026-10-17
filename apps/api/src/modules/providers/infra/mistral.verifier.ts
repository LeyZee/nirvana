import { z } from 'zod';

import type { ProviderVerifier, VerificationOutcome } from '../domain/verification';

import { getJson, isProviderTrouble, type FetchLike } from './http';

/** `GET /v1/models` lists what the key can call; `mistral-large-latest` is the writing fallback (packages/llm). */
const ModelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

export interface MistralVerifierOptions {
  readonly fetch: FetchLike;
  readonly baseUrl?: string;
}

export function createMistralVerifier(options: MistralVerifierOptions): ProviderVerifier {
  const baseUrl = options.baseUrl ?? 'https://api.mistral.ai';
  return {
    provider: 'mistral',
    async verify(key): Promise<VerificationOutcome> {
      const reply = await getJson(options.fetch, `${baseUrl}/v1/models`, { authorization: `Bearer ${key}` });
      if (reply.kind === 'unreachable' || isProviderTrouble(reply.status))
        return { ok: false, kind: 'unreachable' };
      if (reply.status === 401 || reply.status === 403) return { ok: false, kind: 'unauthorized' };
      if (reply.status === 402) return { ok: false, kind: 'no_credit' };
      const models = ModelsSchema.safeParse(reply.body);
      if (reply.status !== 200 || !models.success) return { ok: false, kind: 'unreachable' };
      if (!models.data.data.some((model) => model.id.startsWith('mistral-large')))
        return { ok: false, kind: 'model_not_allowed' };
      return {
        ok: true,
        keyLabel: null,
        summary: 'Mistral Large prend le relais si Grok ne répond plus',
        facts: [
          { label: 'Modèle', value: 'Mistral Large' },
          { label: 'Utilisé pour', value: 'Le relais de la voix et des décisions' },
        ],
        settings: {},
        voices: [],
        charactersLeft: null,
        isLowCredit: false,
      };
    },
  };
}
