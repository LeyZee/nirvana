import { describe, expect, it } from 'vitest';

import { LLM_PACKAGE } from './index';

describe('@nirvana/llm', () => {
  it('resolves through the workspace', () => {
    expect(LLM_PACKAGE).toBe('@nirvana/llm');
  });
});
