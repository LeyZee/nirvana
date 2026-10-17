import { randomBytes } from 'node:crypto';

import { err, MEDIA_VOCABULARY_VERSION, ok } from '@nirvana/contracts';
import { generateText, transcribe as transcribeAudio } from 'ai';

import { classify, createCallRunner } from './call-runner';
import { MODELS, TRANSCRIPTION_MODEL } from './catalog';
import { describeBrief, notesBlock, toMessages } from './conversation-messages';
import type { LlmGateway, LlmGatewayDeps, VideoKeyframes } from './gateway-types';
import { computeHealth } from './health';
import { loadPrompt, renderPrompt } from './prompts';
import { BriefSchema, SenseOutputSchema, VoiceOutputSchema } from './schemas';
import { senseContent } from './sense-content';

export type * from './gateway-types';

export function createLlmGateway(deps: LlmGatewayDeps): LlmGateway {
  const now = deps.now ?? (() => new Date());
  const prompts = deps.prompts ?? {
    voice: loadPrompt('voice'),
    brain: loadPrompt('brain'),
    sense: loadPrompt('sense'),
  };
  const canary = deps.canary ?? `nv-${randomBytes(6).toString('hex')}`;

  const run = createCallRunner({
    config: deps.config,
    log: deps.log,
    resolveModel: deps.resolveModel,
    now,
    canary,
  });

  return {
    async sense(input) {
      const system = renderPrompt(prompts.sense, { canary });
      let pending: Promise<VideoKeyframes> | undefined;
      const keyframes = (): Promise<VideoKeyframes> => {
        if (input.media.kind !== 'video') return Promise.resolve({ frames: [] });
        pending ??= input.media.keyframes();
        return pending;
      };
      const result = await run(
        'sense',
        prompts.sense,
        system,
        async (ref) => {
          const content = await senseContent(input, ref, keyframes);
          return content === undefined ? undefined : [{ role: 'user', content }];
        },
        SenseOutputSchema,
      );
      if (!result.ok) return result;
      const { media } = input;
      return ok({
        ...result.value,
        output: {
          ...result.value.output,
          vocabularyVersion: MEDIA_VOCABULARY_VERSION,
          kind: media.kind,
          durationS: media.kind === 'image' ? null : media.durationS,
        },
      });
    },

    brain(input) {
      const system = renderPrompt(prompts.brain, {
        creator_name: input.creatorName,
        persona_sheet: input.personaSheet,
        fan_notes: notesBlock(input.fanNotes),
        situation: input.situation ?? 'Pas d’information sur le moment.',
        canary,
      });
      return run(
        'brain',
        prompts.brain,
        system,
        () => Promise.resolve(toMessages(input.history)),
        BriefSchema,
      );
    },

    voice(input) {
      const system = renderPrompt(prompts.voice, {
        creator_name: input.creatorName,
        persona_sheet: input.personaSheet,
        fan_notes: notesBlock(input.fanNotes),
        situation: input.situation ?? 'Pas d’information sur le moment.',
        brief: describeBrief(input.brief),
        canary,
      });
      return run(
        'voice',
        prompts.voice,
        system,
        () => Promise.resolve(toMessages(input.history)),
        VoiceOutputSchema,
      );
    },

    async transcribe(audio) {
      const ref = { provider: TRANSCRIPTION_MODEL.provider, model: TRANSCRIPTION_MODEL.model };
      const model = deps.resolveTranscriber?.();
      if (model === undefined)
        return err({ code: 'all_models_failed', attempts: [{ ...ref, outcome: 'missing_key' }] });
      const startedAt = now().getTime();
      const base = { role: 'sense', ...ref, promptHash: 'transcription', isFallback: false } as const;
      try {
        const result = await transcribeAudio({
          model,
          audio: audio.data,
          maxRetries: deps.config.maxTransientRetries,
          abortSignal: AbortSignal.timeout(deps.config.roles.sense.timeoutMs),
        });
        const durationS = result.durationInSeconds ?? audio.durationS;
        deps.log.append({
          ...base,
          at: now(),
          outcome: 'ok',
          latencyMs: now().getTime() - startedAt,
          ...(durationS !== undefined && {
            costUsd: (durationS / 3_600) * TRANSCRIPTION_MODEL.usdPerAudioHour,
          }),
        });
        return ok({ text: result.text, ...(durationS !== undefined && { durationS }) });
      } catch (error) {
        const { outcome, message } = classify(error);
        deps.log.append({
          ...base,
          at: now(),
          outcome,
          latencyMs: now().getTime() - startedAt,
          errorMessage: message.slice(0, 200),
        });
        return err({ code: 'all_models_failed', attempts: [{ ...ref, outcome }] });
      }
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
