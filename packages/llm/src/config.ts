import { z } from 'zod';

const ProviderIdSchema = z.enum(['xai', 'mistral', 'venice']);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const LlmRoleSchema = z.enum(['voice', 'brain', 'sense', 'judge']);
export type LlmRole = z.infer<typeof LlmRoleSchema>;

const ModelRefSchema = z.object({
  provider: ProviderIdSchema,
  model: z.string().min(1),
});
export type ModelRef = z.infer<typeof ModelRefSchema>;

const LlmRoleConfigSchema = ModelRefSchema.extend({
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  fallback: ModelRefSchema.optional(),
});
export type LlmRoleConfig = z.infer<typeof LlmRoleConfigSchema>;

export const LlmConfigSchema = z.object({
  roles: z.record(LlmRoleSchema, LlmRoleConfigSchema),
  /** Transient errors (timeout, 429, 5xx) are retried this many times before the fallback. */
  maxTransientRetries: z.number().int().min(0).max(5),
  /** Daily spend ceiling in USD; the health report compares today's cost with it. */
  dailyBudgetUsd: z.number().positive(),
});
export type LlmConfig = z.infer<typeof LlmConfigSchema>;

const MISTRAL_FALLBACK: ModelRef = { provider: 'mistral', model: 'mistral-large-latest' };

/** Defaults (ADR 0009); per-creator overrides arrive with CreatorSettings.llm. Changing a default needs evals first. */
export const DEFAULT_LLM_CONFIG: LlmConfig = LlmConfigSchema.parse({
  roles: {
    voice: {
      provider: 'xai',
      model: 'grok-4.7',
      temperature: 0.9,
      maxOutputTokens: 400,
      timeoutMs: 30_000,
      fallback: MISTRAL_FALLBACK,
    },
    brain: {
      provider: 'xai',
      model: 'grok-4.7',
      temperature: 0.3,
      maxOutputTokens: 800,
      timeoutMs: 30_000,
      fallback: MISTRAL_FALLBACK,
    },
    sense: { provider: 'xai', model: 'grok-4.7', temperature: 0.2, maxOutputTokens: 800, timeoutMs: 60_000 },
    judge: { provider: 'xai', model: 'grok-4.7', temperature: 0, maxOutputTokens: 600, timeoutMs: 60_000 },
  },
  maxTransientRetries: 2,
  dailyBudgetUsd: 15,
});

/** API keys come from the environment only (playbook add-an-llm-provider.md, step 9); they are never logged. */
const ProviderCredentialsSchema = z.object({
  LLM_XAI_API_KEY: z.string().min(1).optional(),
  LLM_MISTRAL_API_KEY: z.string().min(1).optional(),
  LLM_VENICE_API_KEY: z.string().min(1).optional(),
});
export type ProviderCredentials = z.infer<typeof ProviderCredentialsSchema>;

export function readProviderCredentials(env: Record<string, string | undefined>): ProviderCredentials {
  const nonEmpty = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ''),
  );
  return ProviderCredentialsSchema.parse(nonEmpty);
}

export function apiKeyFor(credentials: ProviderCredentials, provider: ProviderId): string | undefined {
  switch (provider) {
    case 'xai':
      return credentials.LLM_XAI_API_KEY;
    case 'mistral':
      return credentials.LLM_MISTRAL_API_KEY;
    case 'venice':
      return credentials.LLM_VENICE_API_KEY;
  }
}
