import { createHash } from 'node:crypto';

import { MEDIA_VOCABULARY_VERSION } from '@nirvana/contracts';

export type MediaKind = 'image' | 'video';

export function mediaKindOf(mediaType: string): MediaKind | undefined {
  if (mediaType.startsWith('image/')) return 'image';
  if (mediaType.startsWith('video/')) return 'video';
  return undefined;
}

// What the xAI vision API accepts (docs.x.ai, image understanding): any other image is converted first.
const VISION_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png'];
const VISION_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export function needsConversion(mediaType: string, sizeBytes: number): boolean {
  return !VISION_IMAGE_TYPES.includes(mediaType) || sizeBytes > VISION_IMAGE_MAX_BYTES;
}

/**
 * One description per file, vocabulary version and model (ai-engine.md, « Cache »): a bundle media is
 * described once at import, and a fan who sends the same picture twice costs one call.
 */
export function descriptionKey(data: Uint8Array, senseModel: string): string {
  const sha256 = createHash('sha256').update(data).digest('hex');
  return `${sha256}:${MEDIA_VOCABULARY_VERSION}:${senseModel}`;
}

/**
 * Keyframes come at one per second, near-duplicates already dropped. Past `max`, keep an even spread
 * that still holds the first and the last: a long video stays affordable and keeps its ending.
 */
export function spreadFrames<T>(frames: readonly T[], max = 24): T[] {
  if (frames.length <= max) return [...frames];
  if (max <= 1) return frames.slice(0, max);
  const step = (frames.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => frames[Math.round(i * step)]).filter(
    (frame): frame is T => frame !== undefined,
  );
}
