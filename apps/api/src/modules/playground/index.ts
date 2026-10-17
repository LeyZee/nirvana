/** Public entry point of the `playground` module (ADR 0002): the training screen's API (P3-06). */
import { randomUUID } from 'node:crypto';

import { DEFAULT_LLM_CONFIG, loadPrompt, type LlmGateway } from '@nirvana/llm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { CalibrationRecord, CalibrationStore } from '../agent/index';

import { createPlaygroundService } from './application/playground-service';
import { createPlaygroundEngine } from './infra/engine';
import { createPlaygroundGateway, createVoiceVariant, type PlaygroundGatewayDeps } from './infra/gateways';
import type { PlaygroundPersona } from './infra/persona-file';
import { createPlaygroundRoutes, type PlaygroundRoutesOptions } from './infra/routes';

export { FAN_PRESETS, findPreset } from './domain/fan-presets';
export { ratingRecord } from './infra/engine';
export { createPlaygroundGateway, createVoiceVariant } from './infra/gateways';
export { readPersonaFile } from './infra/persona-file';
export { createPlaygroundSession, withExamples, type PlaygroundTurn } from './infra/session';

export interface PlaygroundModule {
  readonly name: 'playground';
  /** `/v1/playground`, behind the guard given here. */
  readonly routes: (options: PlaygroundRoutesOptions) => FastifyPluginAsyncZod;
}

export interface PlaygroundDeps extends PlaygroundGatewayDeps {
  readonly persona: PlaygroundPersona;
  readonly store: CalibrationStore;
  /** The ratings already kept: the rate starts from them and the corrections come back as voice examples. */
  readonly records: CalibrationRecord[];
  readonly timeZone?: string;
  readonly now?: () => Date;
  /** Tests only: fake gateways in place of the providers. */
  readonly gateway?: LlmGateway;
  readonly gatewayForVoice?: (voiceModel: string) => LlmGateway | undefined;
}

export function createPlaygroundModule(deps: PlaygroundDeps): PlaygroundModule {
  const gateway = deps.gateway ?? createPlaygroundGateway(deps);
  const version = {
    voicePrompt: loadPrompt('voice').header.version,
    voiceModel: DEFAULT_LLM_CONFIG.roles.voice.model,
  };
  const service = createPlaygroundService(() =>
    createPlaygroundEngine({
      gateway,
      gatewayForVoice: deps.gatewayForVoice ?? ((model) => createVoiceVariant(deps, model)),
      persona: deps.persona,
      store: deps.store,
      records: deps.records,
      version,
      sessionId: `api-${randomUUID()}`,
      ...(deps.timeZone !== undefined && { timeZone: deps.timeZone }),
      ...(deps.now !== undefined && { now: deps.now }),
    }),
  );
  return { name: 'playground', routes: (options) => createPlaygroundRoutes(service, options) };
}
