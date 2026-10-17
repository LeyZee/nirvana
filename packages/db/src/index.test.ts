import { describe, expect, it } from 'vitest';

import { DB_PACKAGE } from './index';

describe('@nirvana/db', () => {
  it('resolves through the workspace', () => {
    expect(DB_PACKAGE).toBe('@nirvana/db');
  });
});
