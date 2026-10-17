/** LlmGateway: sense, brain, voice and judge roles over provider SDKs (ADR 0009). The only package that imports one. */
export const LLM_PACKAGE = '@nirvana/llm';

export {
  createInMemoryCallLog,
  createJsonlCallLog,
  type CallOutcome,
  type LlmCallLog,
  type LlmCallRecord,
} from './call-log';
export {
  MODELS,
  PROVIDERS,
  costUsd,
  findModel,
  type InputKind,
  type ModelInfo,
  type ProviderInfo,
} from './catalog';
export {
  DEFAULT_LLM_CONFIG,
  LlmConfigSchema,
  readProviderCredentials,
  type LlmConfig,
  type LlmRole,
  type LlmRoleConfig,
  type ModelRef,
  type ProviderCredentials,
  type ProviderId,
} from './config';
export {
  createLlmGateway,
  type CallMeta,
  type ConnectionTest,
  type ConversationInput,
  type ConversationTurn,
  type LlmFailure,
  type LlmGateway,
  type LlmGatewayDeps,
  type LlmSuccess,
  type VoiceInput,
} from './gateway';
export type { HealthReport, HealthState, ProviderHealth, RoleHealth } from './health';
export { createModelResolver, type ModelResolver } from './providers';
export { BriefSchema, VoiceOutputSchema, type Brief, type VoiceOutput } from './schemas';
export { wrapUntrusted, type UntrustedKind } from './untrusted';
