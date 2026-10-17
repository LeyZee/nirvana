import { describe, expect, it } from 'vitest';

import { err, isOk, map, ok, type Result, unwrapOr } from './result';

function half(n: number): Result<number, 'odd'> {
  return n % 2 === 0 ? ok(n / 2) : err('odd');
}

describe('Result', () => {
  it('carries a value or an error', () => {
    expect(half(4)).toEqual({ ok: true, value: 2 });
    expect(half(3)).toEqual({ ok: false, error: 'odd' });
  });
});

describe('Result helpers', () => {
  it('maps a value, keeps an error, and falls back', () => {
    expect(map(half(4), (n) => n + 1)).toEqual(ok(3));
    expect(map(half(3), (n) => n + 1)).toEqual(err('odd'));
    expect(unwrapOr(half(3), 0)).toBe(0);
    expect(unwrapOr(half(4), 0)).toBe(2);
    expect(isOk(half(4))).toBe(true);
  });
});
