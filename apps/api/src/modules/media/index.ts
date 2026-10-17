/** Public entry point of the `media` module (ADR 0002). Other modules import this file only. */
export { createMediaDescriber } from './application/describe-media';
export { createFfmpegMediaTools } from './infra/ffmpeg-media-tools';
export {
  createGatewaySenser,
  createGatewayTranscriber,
  createInMemoryDescriptionStore,
} from './infra/gateway-senser';

export interface MediaModule {
  readonly name: 'media';
}

/** Builds the module. Its dependencies arrive as arguments once the module has any (coding.md). */
export function createMediaModule(): MediaModule {
  return { name: 'media' };
}
