import { err, ok, type Result } from '@nirvana/contracts';
import {
  APICallError,
  generateText,
  JSONParseError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  TypeValidationError,
  type LanguageModelUsage,
  type ModelMessage,
} from 'ai';
import type { z } from 'zod';

import type { CallOutcome, LlmCallLog } from './call-log';
import { costUsd } from './catalog';
import type { LlmConfig, LlmRole, ModelRef } from './config';
import type { LlmFailure, LlmSuccess } from './gateway-types';
import type { PromptTemplate } from './prompts';
import type { ModelResolver } from './providers';

interface Classified {
  readonly outcome: CallOutcome;
  readonly isTransient: boolean;
  readonly message: string;
  /** Tokens the failed call still billed, when the provider said. */
  readonly usage?: LanguageModelUsage;
}

export function classify(error: unknown): Classified {
  if (NoObjectGeneratedError.isInstance(error)) {
    // A block the SDK only reports as a failed object (see the finish check in `run`).
    const isBlocked =
      error.finishReason === 'content-filter' ||
      error.finishReason === 'other' ||
      (error.text ?? '').trim() === '';
    return {
      outcome: isBlocked ? 'refused' : 'invalid_output',
      isTransient: false,
      message: error.message,
      ...(error.usage !== undefined && { usage: error.usage }),
    };
  }
  if (NoOutputGeneratedError.isInstance(error)) {
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

/** Gemini's own filters, off for sexual content between adults (Charles, 17/10); core harms stay blocked. */
const GOOGLE_SAFETY = {
  google: {
    safetySettings: (
      [
        'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        'HARM_CATEGORY_HARASSMENT',
        'HARM_CATEGORY_HATE_SPEECH',
        'HARM_CATEGORY_DANGEROUS_CONTENT',
      ] as const
    ).map((category) => ({ category, threshold: 'OFF' })),
  },
};

export interface CallRunnerDeps {
  readonly config: LlmConfig;
  readonly log: LlmCallLog;
  readonly resolveModel: ModelResolver;
  readonly now: () => Date;
  readonly canary: string;
}

export type CallRunner = <T>(
  role: LlmRole,
  prompt: PromptTemplate,
  system: string,
  buildMessages: (ref: ModelRef) => Promise<ModelMessage[] | undefined>,
  schema: z.ZodType<T>,
) => Promise<Result<LlmSuccess<T>, LlmFailure>>;

/**
 * One structured call for a role: main model then fallback, transient retries, one repair round on an
 * invalid output, refusals and prompt leaks moved to the next model, every attempt journaled.
 */
export function createCallRunner(deps: CallRunnerDeps): CallRunner {
  const { now, canary } = deps;
  return async function run<T>(
    role: LlmRole,
    prompt: PromptTemplate,
    system: string,
    buildMessages: (ref: ModelRef) => Promise<ModelMessage[] | undefined>,
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
      let built: ModelMessage[] | undefined;
      try {
        built = await buildMessages(ref);
      } catch {
        // Keyframes could not be made: this model cannot be given the media.
        built = undefined;
      }
      if (built === undefined) {
        attempts.push({ provider: ref.provider, model: ref.model, outcome: 'unsupported_input' });
        continue;
      }
      let messages = built;
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
            ...(ref.provider === 'google' && { providerOptions: GOOGLE_SAFETY }),
          });
          const latencyMs = now().getTime() - startedAt;
          const cost = costUsd(ref, result.usage);
          // Gemini blocks a media by stopping with no text (finish « other ») as often as with « content-filter »:
          // both are a refusal, and asking again with the same media would only be refused again.
          const isBlocked =
            result.finishReason === 'content-filter' ||
            (result.finishReason === 'other' && result.text.trim() === '');
          if (isBlocked) {
            record('refused', latencyMs, cost === undefined ? {} : { costUsd: cost });
            break;
          }
          if (JSON.stringify(result.output).includes(canary)) {
            // The fan got the model to write its instructions: nothing of this output may go further.
            record('prompt_leak', latencyMs, cost === undefined ? {} : { costUsd: cost });
            break;
          }
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
          const { outcome, isTransient, message, usage } = classify(error);
          const cost = usage === undefined ? undefined : costUsd(ref, usage);
          record(outcome, latencyMs, {
            errorMessage: message.slice(0, 200),
            ...(cost !== undefined && { costUsd: cost }),
          });
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
  };
}
