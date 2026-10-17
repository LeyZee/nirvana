import { describe, expect, it } from 'vitest';

import { CONTRACTS_PACKAGE } from './index';

describe('@nirvana/contracts', () => {
  it('resolves through the workspace', () => {
    expect(CONTRACTS_PACKAGE).toBe('@nirvana/contracts');
  });
});
