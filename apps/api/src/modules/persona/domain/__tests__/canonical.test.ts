import { describe, expect, it } from 'vitest';

import { canonicalJson } from '../canonical';

describe('canonicalJson', () => {
  it('sorts keys at every level and keeps the order of lists', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe('{"a":{"c":null,"d":[2,1]},"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
});
