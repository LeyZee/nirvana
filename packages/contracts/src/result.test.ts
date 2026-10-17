import { describe, expect, it } from 'vitest';

import { err, ok, type Result } from './result';

function half(n: number): Result<number, 'odd'> {
  return n % 2 === 0 ? ok(n / 2) : err('odd');
}

describe('Result', () => {
  it('carries a value or an error', () => {
    expect(half(4)).toEqual({ ok: true, value: 2 });
    expect(half(3)).toEqual({ ok: false, error: 'odd' });
  });
});
