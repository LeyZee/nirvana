import type { z } from 'zod';

import {
  ComparisonSchema,
  PlaygroundStateSchema,
  type Comparison,
  type Destination,
  type Media,
  type PlaygroundState,
  type Verdict,
} from './model';

/** Everything the screen asks of the playground. The HTTP client talks to the API; the demo one answers alone. */
export interface PlaygroundClient {
  readonly isDemo: boolean;
  state(): Promise<PlaygroundState>;
  choosePreset(presetId: string): Promise<PlaygroundState>;
  /** His message; the state that comes back carries her answer as `pending`. */
  send(text: string, media: readonly Media[]): Promise<PlaygroundState>;
  rate(verdict: Verdict, destination?: Destination): Promise<PlaygroundState>;
  /** Back to just before his n-th message (from 1), sent again: a new answer to the same moment. */
  branch(fanMessageNumber: number): Promise<PlaygroundState>;
  compare(): Promise<Comparison>;
  advance(hours: number): Promise<PlaygroundState>;
  setNotes(notes: readonly string[]): Promise<PlaygroundState>;
  setSpent(cents: number): Promise<PlaygroundState>;
  sendCreatorMedia(media: Media): Promise<PlaygroundState>;
}

export type PlaygroundErrorCode = 'llm_unavailable' | 'not_deployed' | 'failed';

/** What went wrong, said plainly on screen. */
export class PlaygroundError extends Error {
  constructor(readonly code: PlaygroundErrorCode) {
    super(code);
    this.name = 'PlaygroundError';
  }
}

const BASE = '/v1/playground';

async function call<S extends z.ZodType>(schema: S, path: string, body?: unknown): Promise<z.infer<S>> {
  const response = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    ...(body !== undefined && {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  if (response.status === 404) throw new PlaygroundError('not_deployed');
  if (response.status === 503) throw new PlaygroundError('llm_unavailable');
  if (!response.ok) throw new PlaygroundError('failed');
  return schema.parse(await response.json());
}

export function createHttpClient(): PlaygroundClient {
  const state = PlaygroundStateSchema;
  return {
    isDemo: false,
    state: () => call(state, ''),
    choosePreset: (presetId) => call(state, '/preset', { presetId }),
    send: (text, media) => call(state, '/messages', { text, media }),
    rate: (verdict, destination) => call(state, '/rating', { verdict, ...(destination && { destination }) }),
    branch: (fanMessageNumber) => call(state, '/branch', { fanMessageNumber }),
    compare: () => call(ComparisonSchema, '/compare', {}),
    advance: (hours) => call(state, '/advance', { hours }),
    setNotes: (notes) => call(state, '/notes', { notes }),
    setSpent: (cents) => call(state, '/situation', { spentCents: cents }),
    sendCreatorMedia: (media) => call(state, '/creator-media', media),
  };
}
