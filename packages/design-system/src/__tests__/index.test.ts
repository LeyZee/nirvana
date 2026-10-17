import { describe, expect, it } from 'vitest';

import { countValue, easeOutQuart, lensGeometry, lightPosition } from '../index.js';

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

describe('easeOutQuart', () => {
  it('starts at 0, ends at 1 and clamps outside the range', () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
    expect(easeOutQuart(-1)).toBe(0);
    expect(easeOutQuart(2)).toBe(1);
  });

  it('covers most of the distance early', () => {
    expect(easeOutQuart(0.5)).toBeGreaterThan(0.9);
  });
});

describe('countValue', () => {
  it('lands exactly on the target and counts down as well as up', () => {
    expect(countValue(0, 1846.2, 1000, 1000)).toBe(1846.2);
    expect(countValue(120, 80, 2000, 1000)).toBe(80);
    expect(countValue(120, 80, 500, 1000)).toBeLessThan(120);
  });

  it('shows the target at once when there is no duration', () => {
    expect(countValue(0, 42, 0, 0)).toBe(42);
  });
});
