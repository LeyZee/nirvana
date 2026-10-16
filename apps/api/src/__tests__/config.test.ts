import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';

describe('loadConfig', () => {
  it('applies the documented defaults', () => {
    expect(loadConfig({})).toEqual({ NODE_ENV: 'development', LOG_LEVEL: 'info', PORT: 3000 });
  });

  it('reads PORT as a number', () => {
    expect(loadConfig({ PORT: '4100' }).PORT).toBe(4100);
  });

  it('refuses a malformed variable and names it', () => {
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow(/PORT/);
  });

  it('returns an immutable object', () => {
    expect(Object.isFrozen(loadConfig({}))).toBe(true);
  });
});
