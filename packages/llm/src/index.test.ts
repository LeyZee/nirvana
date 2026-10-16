import { describe, expect, it } from 'vitest';

import * as entry from './index.js';

describe('@nirvana/llm', () => {
  it('loads its public entry point', () => {
    expect(entry).toBeTypeOf('object');
  });
});
