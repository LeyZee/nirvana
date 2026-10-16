import { describe, expect, it } from 'vitest';

import { manifest } from '../wxt.config';

describe('extension manifest', () => {
  it('limits host permissions to Reveal', () => {
    expect(manifest.host_permissions).toEqual(['*://*.reveal.me/*']);
  });
});
