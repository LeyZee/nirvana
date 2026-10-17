import { randomBytes } from 'node:crypto';

import { err, MEDIA_VOCABULARY_VERSION, ok, type MediaDescription, type Result } from '@nirvana/contracts';
import {
  APICallError,
  generateText,
  JSONParseError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  TypeValidationError,
  type ModelMessage,
  type TextPart,
  type TranscriptionModel,
  transcribe as transcribeAudio,
  type UserContent,
} from 'ai';
import type { z } from 'zod';

import type { CallOutcome, LlmCallLog } from './call-log';
import { acceptsInput, costUsd, MODELS, TRANSCRIPTION_MODEL } from './catalog';
import type { LlmConfig, LlmRole, ModelRef, ProviderCredentials, ProviderId } from './config';
import { computeHealth, type HealthReport } from './health';
import { loadPrompt, renderPrompt, type PromptTemplate } from './prompts';
import type { ModelResolver } from './providers';
import { BriefSchema, SenseOutputSchema, VoiceOutputSchema, type Brief, type VoiceOutput } from './schemas';
import { wrapUntrusted } from './untrusted';

/** A media exchanged in the conversation, already described by `sense`. */
export interface TurnMedia {
  readonly description: MediaDescription;
  /** A paid media of hers the fan has not bought yet: she can tease it, not give it away. */
  readonly isLocked?: boolean;
}

export interface ConversationTurn {
  readonly from: 'fan' | 'creator';
  readonly text: string;
  readonly media?: readonly TurnMedia[];
}

export interface VideoFrame {
  readonly atS: number;
  readonly mediaType: string;
  readonly data: Uint8Array;
}

export type SenseMedia =
  | { readonly kind: 'image'; readonly mediaType: string; readonly data: Uint8Array }
  | {
      readonly kind: 'video';
      readonly durationS: number;
      /** The file, read natively (picture and sound) by a model that takes video, such as Gemini. */
      readonly mediaType: string;
      readonly data: Uint8Array;
      /**
       * Dated keyframes and transcript, for a model that reads images only (Grok). Called only when the call
       * falls back to such a model, at most once: a fan's video costs ffmpeg and speech to text only then.
       */
      readonly keyframes: () => Promise<VideoKeyframes>;
    }
  | { readonly kind: 'audio'; readonly durationS: number; readonly transcript: string };

export interface VideoKeyframes {
  readonly frames: readonly VideoFrame[];
  /** What is said in it, from `transcribe`. */
  readonly transcript?: string;
}

export interface SenseInput {
  /** A fan's media is described to react to it; one of hers, to talk about it and make him want it. */
  readonly origin: 'fan' | 'creator';
  readonly media: SenseMedia;
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
  sense(input: SenseInput): Promise<Result<LlmSuccess<MediaDescription>, LlmFailure>>;
  brain(input: ConversationInput): Promise<Result<LlmSuccess<Brief>, LlmFailure>>;
  voice(input: VoiceInput): Promise<Result<LlmSuccess<VoiceOutput>, LlmFailure>>;
  health(): HealthReport;
  testConnection(provider: ProviderId): Promise<ConnectionTest>;
  /** The sound of a video or a voice note, as text for `sense`. */
  transcribe(audio: {
    readonly data: Uint8Array;
    readonly mediaType: string;
  }): Promise<Result<Transcript, LlmFailure>>;
}

export interface LlmGatewayDeps {
  readonly config: LlmConfig;
  readonly credentials: ProviderCredentials;
  readonly resolveModel: ModelResolver;
  readonly log: LlmCallLog;
  readonly now?: () => Date;
  readonly prompts?: {
    readonly voice: PromptTemplate;
    readonly brain: PromptTemplate;
    readonly sense: PromptTemplate;
  };
  /** Secret written in every system prompt: an output that contains it has leaked the prompt. */
  readonly canary?: string;
  /** Speech to text (xAI); undefined when no key is set. */
  readonly resolveTranscriber?: () => TranscriptionModel | undefined;
}

export interface Transcript {
  readonly text: string;
  readonly durationS?: number;
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

const LABELS = {
  image: 'Photo',
  video: 'Vidéo',
  audio: 'Vocal',
} as const;

/** A description as the brain and the voice read it: plain French, closed values kept as they are. */
function renderMedia(media: TurnMedia): string {
  const d = media.description;
  const duration = d.durationS === null ? '' : ` de ${String(Math.round(d.durationS))} s`;
  return [
    `${LABELS[d.kind]}${duration}${media.isLocked === true ? ' (verrouillé, pas encore acheté)' : ''}.`,
    d.factualDescription,
    ...d.segments.map((s) => `De ${String(s.startS)} à ${String(s.endS)} s : ${s.description}`),
    `Intensité : ${d.intensity}. Visible : ${d.anatomyVisible.join(', ') || 'rien de particulier'}.`,
    d.mood.length > 0 ? `Ambiance : ${d.mood.join(', ')}.` : '',
    d.setting === null ? '' : `Décor : ${d.setting}.`,
    d.audio?.transcript ? `Ce qui est dit : « ${d.audio.transcript} ».` : '',
    d.textVisible === null ? '' : `Texte écrit dans le média : « ${d.textVisible} ».`,
    d.confidenceLow ? 'Description incertaine.' : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function toMessages(history: readonly ConversationTurn[]): ModelMessage[] {
  return history.map((turn) => {
    const isFan = turn.from === 'fan';
    const media = (turn.media ?? []).map((m) =>
      wrapUntrusted(isFan ? 'fan_media_description' : 'creator_media_description', renderMedia(m)),
    );
    if (isFan) {
      const text = turn.text.trim() === '' ? [] : [wrapUntrusted('fan_message', turn.text)];
      return { role: 'user', content: [...text, ...media].join('\n') };
    }
    return { role: 'assistant', content: [turn.text, ...media].filter((part) => part !== '').join('\n') };
  });
}

// Gemini takes up to 20 MB inline; a larger video goes through keyframes until the Files API is wired.
const INLINE_VIDEO_MAX_BYTES = 20 * 1024 * 1024;

const ORIGIN = { fan: 'Média envoyé par un fan.', creator: 'Média du catalogue de la créatrice.' } as const;

function transcriptPart(transcript: string | undefined): TextPart[] {
  return transcript === undefined
    ? []
    : [{ type: 'text', text: wrapUntrusted('media_transcript', transcript) }];
}

/** The user message of a `sense` call, or undefined when this model cannot read this media. */
async function senseContent(
  input: SenseInput,
  ref: ModelRef,
  keyframes: () => Promise<VideoKeyframes>,
): Promise<UserContent | undefined> {
  const { media } = input;
  const origin = ORIGIN[input.origin];
  switch (media.kind) {
    case 'image':
      if (!acceptsInput(ref, 'image')) return undefined;
      return [
        { type: 'text', text: `${origin} Photo.` },
        { type: 'file', data: media.data, mediaType: media.mediaType },
      ];
    case 'audio':
      return [
        { type: 'text', text: `${origin} Vocal de ${String(media.durationS)} s, transcrit.` },
        ...transcriptPart(media.transcript),
      ];
    case 'video': {
      const intro = `${origin} Vidéo de ${String(Math.round(media.durationS))} s`;
      if (acceptsInput(ref, 'video') && media.data.byteLength <= INLINE_VIDEO_MAX_BYTES) {
        return [
          { type: 'text', text: `${intro}, avec son.` },
          { type: 'file', data: media.data, mediaType: media.mediaType },
        ];
      }
      if (!acceptsInput(ref, 'image')) return undefined;
      const { frames, transcript } = await keyframes();
      if (frames.length === 0) return undefined;
      return [
        { type: 'text', text: `${intro}, en images extraites et datées :` },
        ...frames.flatMap((frame) => [
          { type: 'text' as const, text: `À ${String(frame.atS)} s :` },
          { type: 'file' as const, data: frame.data, mediaType: frame.mediaType },
        ]),
        ...transcriptPart(transcript),
      ];
    }
  }
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
  const prompts = deps.prompts ?? {
    voice: loadPrompt('voice'),
    brain: loadPrompt('brain'),
    sense: loadPrompt('sense'),
  };
  const canary = deps.canary ?? `nv-${randomBytes(6).toString('hex')}`;

  async function run<T>(
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
          if (result.finishReason === 'content-filter') {
            record('refused', latencyMs);
            break;
          }
          const cost = costUsd(ref, result.usage);
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
        const durationS = result.durationInSeconds;
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
