import type { LanguageModelUsage } from 'ai';

import type { ModelRef, ProviderId } from './config';

export type InputKind = 'text' | 'image' | 'video' | 'audio';

export interface ModelInfo extends ModelRef {
  readonly label: string;
  readonly inputs: readonly InputKind[];
  /** Announced by third parties but not yet checked against the provider with a real call. */
  readonly unconfirmedInputs: readonly InputKind[];
  readonly contextTokens: number;
  /** USD per million tokens. */
  readonly pricing?: {
    readonly input: number;
    readonly cachedInput: number;
    readonly output: number;
    readonly checkedOn: string;
    readonly source: string;
  };
}

export interface ProviderInfo {
  readonly id: ProviderId;
  readonly label: string;
  readonly apiKeyEnv: string;
}

export const PROVIDERS: readonly ProviderInfo[] = [
  { id: 'xai', label: 'xAI', apiKeyEnv: 'LLM_XAI_API_KEY' },
  { id: 'mistral', label: 'Mistral', apiKeyEnv: 'LLM_MISTRAL_API_KEY' },
  { id: 'venice', label: 'Venice', apiKeyEnv: 'LLM_VENICE_API_KEY' },
];

// Prices are indicative until checked on each provider's own page (docs/reference/llm-providers.md).
export const MODELS: readonly ModelInfo[] = [
  {
    provider: 'xai',
    model: 'grok-4.7',
    label: 'Grok 4.7',
    inputs: ['text', 'image'],
    unconfirmedInputs: ['video'],
    contextTokens: 500_000,
    pricing: {
      input: 2,
      cachedInput: 0.5,
      output: 6,
      checkedOn: '2026-10-17',
      source: 'third-party listings',
    },
  },
  {
    provider: 'xai',
    model: 'grok-4.3',
    label: 'Grok 4.3',
    inputs: ['text', 'image', 'video'],
    unconfirmedInputs: [],
    contextTokens: 1_000_000,
    pricing: {
      input: 1.25,
      cachedInput: 1.25,
      output: 2.5,
      checkedOn: '2026-10-16',
      source: 'third-party listings',
    },
  },
  {
    provider: 'mistral',
    model: 'mistral-large-latest',
    label: 'Mistral Large',
    inputs: ['text', 'image'],
    unconfirmedInputs: [],
    contextTokens: 128_000,
    pricing: { input: 2, cachedInput: 2, output: 6, checkedOn: '2026-10-17', source: 'third-party listings' },
  },
];

export function findModel(ref: ModelRef): ModelInfo | undefined {
  return MODELS.find((m) => m.provider === ref.provider && m.model === ref.model);
}

/** Cost of one call in USD, or undefined when the model has no known price. */
export function costUsd(ref: ModelRef, usage: LanguageModelUsage): number | undefined {
  const pricing = findModel(ref)?.pricing;
  if (pricing === undefined) return undefined;
  const cached = usage.inputTokenDetails.cacheReadTokens ?? 0;
  const uncached = Math.max(0, (usage.inputTokens ?? 0) - cached);
  const output = usage.outputTokens ?? 0;
  return (uncached * pricing.input + cached * pricing.cachedInput + output * pricing.output) / 1_000_000;
}
