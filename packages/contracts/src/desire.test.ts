import { describe, expect, it } from 'vitest';

import { desireBandOf } from './desire';
import { EventBodySchema } from './events';

describe('desire score', () => {
  it('names the band of a score at its floors', () => {
    expect([0, 39, 40, 69, 70, 100].map(desireBandOf)).toEqual([
      'neutral',
      'neutral',
      'playful',
      'playful',
      'hot',
      'hot',
    ]);
  });

  it('journals a change of score between 0 and 100, with closed signal names', () => {
    const payload = { before: null, score: 72, signals: ['explicit_compliment'], weightsVersion: 'w1' };
    expect(EventBodySchema.safeParse({ type: 'desire_scored', payload }).success).toBe(true);
    for (const wrong of [
      { ...payload, score: 101 },
      { ...payload, score: 7.5 },
      { ...payload, before: -1 },
      { ...payload, signals: ['x'.repeat(65)] },
      { ...payload, signals: Array.from({ length: 21 }, () => 'x') },
    ]) {
      expect(EventBodySchema.safeParse({ type: 'desire_scored', payload: wrong }).success).toBe(false);
    }
  });
});
