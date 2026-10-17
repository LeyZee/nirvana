import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import type { LanguageModel, TranscriptionModel } from 'ai';

import { TRANSCRIPTION_MODEL } from './catalog';
import { apiKeyFor, type ModelRef, type ProviderCredentials } from './config';

/** Returns the model, or undefined when its provider has no API key configured. */
export type ModelResolver = (ref: ModelRef) => LanguageModel | undefined;

const VENICE_BASE_URL = 'https://api.venice.ai/api/v1';

export function createModelResolver(credentials: ProviderCredentials): ModelResolver {
  return (ref) => {
    const apiKey = apiKeyFor(credentials, ref.provider);
    if (apiKey === undefined) return undefined;
    switch (ref.provider) {
      case 'xai':
        return createXai({ apiKey })(ref.model);
      case 'mistral':
        return createMistral({ apiKey })(ref.model);
      case 'venice':
        return createOpenAICompatible({ name: 'venice', baseURL: VENICE_BASE_URL, apiKey })(ref.model);
      case 'google':
        return createGoogleGenerativeAI({ apiKey })(ref.model);
    }
  };
}

/** xAI speech to text, or undefined without an xAI key. */
export function createTranscriberResolver(
  credentials: ProviderCredentials,
): () => TranscriptionModel | undefined {
  return () => {
    const apiKey = credentials.LLM_XAI_API_KEY;
    return apiKey === undefined ? undefined : createXai({ apiKey }).transcription(TRANSCRIPTION_MODEL.model);
  };
}
