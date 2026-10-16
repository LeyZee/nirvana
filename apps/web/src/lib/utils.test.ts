import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
  it('keeps the last conflicting Tailwind utility', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4');
  });

  it('drops falsy values', () => {
    expect(cn('font-semibold', false, undefined)).toBe('font-semibold');
  });
});
