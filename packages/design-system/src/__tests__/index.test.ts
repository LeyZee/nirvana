import { describe, expect, it } from 'vitest';

import { lensGeometry, lightPosition } from '../index.js';

describe('lightPosition', () => {
  it('returns the pointer position relative to the box', () => {
    expect(lightPosition({ left: 100, top: 40 }, 130, 52)).toEqual({ x: 30, y: 12 });
  });

  it('allows positions outside the box so the light can fade past the edge', () => {
    expect(lightPosition({ left: 100, top: 40 }, 90, 30)).toEqual({ x: -10, y: -10 });
  });
});

describe('lensGeometry', () => {
  it('covers the item exactly', () => {
    expect(lensGeometry({ offsetLeft: 72, offsetWidth: 66 })).toEqual({ x: 72, width: 66 });
  });
});
