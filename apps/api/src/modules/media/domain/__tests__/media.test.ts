import { describe, expect, it } from 'vitest';

import { descriptionKey, mediaKindOf, needsConversion, spreadFrames } from '../media';

describe('media domain', () => {
  it('tells photos from videos and refuses the rest', () => {
    expect(mediaKindOf('image/jpeg')).toBe('image');
    expect(mediaKindOf('video/mp4')).toBe('video');
    expect(mediaKindOf('application/pdf')).toBeUndefined();
  });

  it('keys a description by content, vocabulary and model', () => {
    const a = descriptionKey(new Uint8Array([1, 2]), 'grok-4.7');
    expect(a).toBe(descriptionKey(new Uint8Array([1, 2]), 'grok-4.7'));
    expect(a).not.toBe(descriptionKey(new Uint8Array([1, 3]), 'grok-4.7'));
    expect(a).not.toBe(descriptionKey(new Uint8Array([1, 2]), 'grok-4.3'));
    expect(a).toMatch(/:1\.0\.0:grok-4\.7$/);
  });

  it('converts what the vision API refuses: WebP, HEIC, huge files', () => {
    expect(needsConversion('image/jpeg', 1_000)).toBe(false);
    expect(needsConversion('image/png', 1_000)).toBe(false);
    expect(needsConversion('image/webp', 1_000)).toBe(true);
    expect(needsConversion('image/heic', 1_000)).toBe(true);
    expect(needsConversion('image/jpeg', 25 * 1024 * 1024)).toBe(true);
  });

  it('keeps every keyframe of a short video, and an even spread with the ending of a long one', () => {
    expect(spreadFrames([1, 2, 3])).toEqual([1, 2, 3]);
    const long = spreadFrames(Array.from({ length: 180 }, (_, i) => i));
    expect(long).toHaveLength(24);
    expect(long[0]).toBe(0);
    expect(long.at(-1)).toBe(179);
  });
});
