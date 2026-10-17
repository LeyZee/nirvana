import { err, ok, type Result } from '@nirvana/contracts';
import {
  APICallError,
  generateText,
  JSONParseError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  TypeValidationError,
  type ModelMessage,
} from 'ai';
import type { z } from 'zod';

import type { CallOutcome, LlmCallLog } from './call-log';
import { costUsd, MODELS } from './catalog';
import type { LlmConfig, LlmRole, ModelRef, ProviderCredentials, ProviderId } from './config';
import { computeHealth, type HealthReport } from './health';
import { loadPrompt, renderPrompt, type PromptTemplate } from './prompts';
import type { ModelResolver } from './providers';
import { BriefSchema, VoiceOutputSchema, type Brief, type VoiceOutput } from './schemas';
import { wrapUntrusted } from './untrusted';

export interface ConversationTurn {
  readonly from: 'fan' | 'creator';
  readonly text: string;
}

export interface ConversationInput {
  readonly creatorName: string;
  /** Persona sections relevant to this turn, already rendered as text. */
  readonly personaSheet: string;
  /** What she knows about this fan; derived from the fan, so treated as untrusted. */
  readonly fanNotes: string;
  readonly history: readonly ConversationTurn[];
}

export interface VoiceInput extends ConversationInput {
  readonly brief: Brief;
}

export interface CallMeta {
  readonly provider: ProviderId;
  readonly model: string;
  readonly isFallback: boolean;
  readonly latencyMs: number;
  readonly costUsd?: number;
  readonly promptHash: string;
}

export interface LlmSuccess<T> {
  readonly output: T;
  readonly meta: CallMeta;
}

export interface LlmFailure {
  readonly code: 'all_models_failed';
  readonly attempts: readonly {
    readonly provider: ProviderId;
    readonly model: string;
    readonly outcome: CallOutcome;
  }[];
}

export interface ConnectionTest {
  readonly provider: ProviderId;
  readonly isOk: boolean;
  readonly model?: string;
  readonly latencyMs?: number;
  readonly outcome: CallOutcome;
}

export interface LlmGateway {
  brain(input: ConversationInput): Promise<Result<LlmSuccess<Brief>, LlmFailure>>;
  voice(input: VoiceInput): Promise<Result<LlmSuccess<VoiceOutput>, LlmFailure>>;
  health(): HealthReport;
  testConnection(provider: ProviderId): Promise<ConnectionTest>;
}

export interface LlmGatewayDeps {
  readonly config: LlmConfig;
  readonly credentials: ProviderCredentials;
  readonly resolveModel: ModelResolver;
  readonly log: LlmCallLog;
  readonly now?: () => Date;
  readonly prompts?: { readonly voice: PromptTemplate; readonly brain: PromptTemplate };
}

interface Classified {
  readonly outcome: CallOutcome;
  readonly isTransient: boolean;
  readonly message: string;
}

function classify(error: unknown): Classified {
  if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)) {
    return { outcome: 'invalid_output', isTransient: false, message: error.message };
  }
  if (TypeValidationError.isInstance(error) || JSONParseError.isInstance(error)) {
    return { outcome: 'invalid_output', isTransient: false, message: error.message };
  }
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === 401 || status === 403)
      return { outcome: 'auth', isTransient: false, message: `HTTP ${String(status)}` };
    if (status === 429) return { outcome: 'rate_limited', isTransient: true, message: 'HTTP 429' };
    if (status !== undefined && status >= 500)
      return { outcome: 'unavailable', isTransient: true, message: `HTTP ${String(status)}` };
    return { outcome: 'error', isTransient: error.isRetryable, message: `HTTP ${String(status ?? '?')}` };
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return { outcome: 'timeout', isTransient: true, message: 'timeout' };
  }
  return {
    outcome: 'error',
    isTransient: false,
    message: error instanceof Error ? error.name : 'unknown error',
  };
}

function toMessages(history: readonly ConversationTurn[]): ModelMessage[] {
  return history.map((turn) =>
    turn.from === 'fan'
      ? { role: 'user', content: wrapUntrusted('fan_message', turn.text) }
      : { role: 'assistant', content: turn.text },
  );
}

function describeBrief(brief: Brief): string {
  const lines = [
    `Intention du fan : ${brief.intent} (humeur : ${brief.sentiment}).`,
    `À dire : ${brief.replyBrief}`,
    brief.toneHints.length > 0 ? `Ton : ${brief.toneHints.join(', ')}.` : '',
    brief.callback !== undefined ? `Si ça vient naturellement, rappelle : ${brief.callback}` : '',
    brief.selfDisclosure !== undefined ? `Tu peux confier : ${brief.selfDisclosure}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
  return wrapUntrusted('brief', lines);
}

function notesBlock(fanNotes: string): string {
  return fanNotes.trim() === ''
    ? 'Rien pour l’instant : c’est le début de votre relation.'
    : wrapUntrusted('fan_notes', fanNotes);
}

export function createLlmGateway(deps: LlmGatewayDeps): LlmGateway {
  const now = deps.now ?? (() => new Date());
  const prompts = deps.prompts ?? { voice: loadPrompt('voice'), brain: loadPrompt('brain') };

  async function run<T>(
    role: LlmRole,
    prompt: PromptTemplate,
    system: string,
    history: readonly ConversationTurn[],
    schema: z.ZodType<T>,
  ): Promise<Result<LlmSuccess<T>, LlmFailure>> {
    const roleConfig = deps.config.roles[role];
    const targets: { ref: ModelRef; isFallback: boolean }[] = [{ ref: roleConfig, isFallback: false }];
    if (roleConfig.fallback !== undefined) targets.push({ ref: roleConfig.fallback, isFallback: true });
    const attempts: LlmFailure['attempts'][number][] = [];

    for (const { ref, isFallback } of targets) {
      const record = (outcome: CallOutcome, latencyMs: number, extra: object = {}): void => {
        attempts.push({ provider: ref.provider, model: ref.model, outcome });
        deps.log.append({
          at: now(),
          role,
          provider: ref.provider,
          model: ref.model,
          promptHash: prompt.hash,
          outcome,
          latencyMs,
          isFallback,
          ...extra,
        });
      };
      const model = deps.resolveModel(ref);
      if (model === undefined) {
        // Not a call: kept in the failure trace, out of the journal, so health shows the real last error.
        attempts.push({ provider: ref.provider, model: ref.model, outcome: 'missing_key' });
        continue;
      }
      let messages = toMessages(history);
      let transientLeft = deps.config.maxTransientRetries;
      let hasRepaired = false;
      for (;;) {
        const startedAt = now().getTime();
        try {
          const result = await generateText({
            model,
            system,
            messages,
            output: Output.object({ schema }),
            temperature: roleConfig.temperature,
            maxOutputTokens: roleConfig.maxOutputTokens,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(roleConfig.timeoutMs),
          });
          const latencyMs = now().getTime() - startedAt;
          if (result.finishReason === 'content-filter') {
            record('refused', latencyMs);
            break;
          }
          const cost = costUsd(ref, result.usage);
          record('ok', latencyMs, {
            ...(result.usage.inputTokens !== undefined && { inputTokens: result.usage.inputTokens }),
            ...(result.usage.inputTokenDetails.cacheReadTokens !== undefined && {
              cachedInputTokens: result.usage.inputTokenDetails.cacheReadTokens,
            }),
            ...(result.usage.outputTokens !== undefined && { outputTokens: result.usage.outputTokens }),
            ...(cost !== undefined && { costUsd: cost }),
          });
          return ok({
            output: result.output,
            meta: {
              provider: ref.provider,
              model: ref.model,
              isFallback,
              latencyMs,
              promptHash: prompt.hash,
              ...(cost !== undefined && { costUsd: cost }),
            },
          });
        } catch (error) {
          const latencyMs = now().getTime() - startedAt;
          const { outcome, isTransient, message } = classify(error);
          record(outcome, latencyMs, { errorMessage: message.slice(0, 200) });
          if (outcome === 'invalid_output' && !hasRepaired) {
            hasRepaired = true;
            messages = [
              ...messages,
              {
                role: 'user',
                content: `Ta réponse précédente ne respectait pas le format demandé (${message.slice(0, 300)}). Réponds de nouveau, uniquement avec l'objet JSON.`,
              },
            ];
            continue;
          }
          if (isTransient && transientLeft > 0) {
            transientLeft -= 1;
            continue;
          }
          break;
        }
      }
    }
    return err({ code: 'all_models_failed', attempts });
  }

  return {
    brain(input) {
      const system = renderPrompt(prompts.brain, {
        creator_name: input.creatorName,
        persona_sheet: input.personaSheet,
        fan_notes: notesBlock(input.fanNotes),
      });
      return run('brain', prompts.brain, system, input.history, BriefSchema);
    },

    voice(input) {
      const system = renderPrompt(prompts.voice, {
        creator_name: input.creatorName,
        persona_sheet: input.personaSheet,
        fan_notes: notesBlock(input.fanNotes),
        brief: describeBrief(input.brief),
      });
      return run('voice', prompts.voice, system, input.history, VoiceOutputSchema);
    },

    health() {
      return computeHealth(deps.config, deps.credentials, deps.log, now());
    },

    async testConnection(provider) {
      // Test the model the config actually uses for this provider, else the first one the catalog knows.
      const configured = Object.values(deps.config.roles)
        .flatMap((role) => [role, ...(role.fallback ? [role.fallback] : [])])
        .find((ref) => ref.provider === provider);
      const ref = configured ?? MODELS.find((m) => m.provider === provider);
      if (ref === undefined) return { provider, isOk: false, outcome: 'unknown_model' };
      const model = deps.resolveModel(ref);
      if (model === undefined) return { provider, isOk: false, model: ref.model, outcome: 'missing_key' };
      const startedAt = now().getTime();
      try {
        await generateText({
          model,
          prompt: 'Réponds seulement : ok',
          maxOutputTokens: 5,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(15_000),
        });
        return {
          provider,
          isOk: true,
          model: ref.model,
          latencyMs: now().getTime() - startedAt,
          outcome: 'ok',
        };
      } catch (error) {
        return { provider, isOk: false, model: ref.model, outcome: classify(error).outcome };
      }
    },
  };
}
