import { describe, expect, it } from 'vitest';

import { MediaDescriptionSchema } from './media';

const PHOTO = {
  vocabularyVersion: '1.0.0',
  kind: 'image',
  factualDescription: 'Une femme en lingerie noire, assise sur un lit, lumière tamisée.',
  durationS: null,
  segments: [],
  intensity: 'suggestive',
  anatomyVisible: ['full_body'],
  castMode: 'solo',
  mood: ['sensual'],
  setting: 'chambre, lumière tamisée',
  audio: null,
  textVisible: null,
  quality: 'good',
  confidenceLow: false,
  notVisible: false,
  flags: [],
};

describe('MediaDescriptionSchema', () => {
  it('accepts a description in the closed vocabulary', () => {
    expect(MediaDescriptionSchema.parse(PHOTO).intensity).toBe('suggestive');
  });

  it('refuses a value outside the vocabulary or another version', () => {
    expect(MediaDescriptionSchema.safeParse({ ...PHOTO, intensity: 'spicy' }).success).toBe(false);
    expect(MediaDescriptionSchema.safeParse({ ...PHOTO, vocabularyVersion: '0.9.0' }).success).toBe(false);
  });
});
