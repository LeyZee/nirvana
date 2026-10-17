import { describe, expect, it } from 'vitest';

import { mayComposeDrafts } from '../composition-root';

describe('mayComposeDrafts', () => {
  it('never lets the fictional demo persona write to real fans in production', () => {
    expect(mayComposeDrafts({ NODE_ENV: 'production', PLAYGROUND_PERSONA_PATH: undefined })).toBe(false);
    expect(mayComposeDrafts({ NODE_ENV: 'production', PLAYGROUND_PERSONA_PATH: '/srv/persona.yaml' })).toBe(
      true,
    );
    expect(mayComposeDrafts({ NODE_ENV: 'development', PLAYGROUND_PERSONA_PATH: undefined })).toBe(true);
  });
});
