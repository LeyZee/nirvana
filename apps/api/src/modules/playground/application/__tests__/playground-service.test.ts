import { describe, expect, it } from 'vitest';

import type { PlaygroundEngine } from '../engine';
import { createPlaygroundService } from '../playground-service';

const unused = (): never => {
  throw new Error('not used');
};

function engine(): PlaygroundEngine {
  return {
    state: unused,
    applyPreset: unused,
    reset: unused,
    send: unused,
    rate: unused,
    branch: unused,
    compare: unused,
    patchSituation: unused,
    advance: unused,
    setNotes: unused,
    sendCreatorMedia: unused,
  };
}

describe('playground service', () => {
  it('keeps one playground per user', () => {
    let built = 0;
    const service = createPlaygroundService(() => {
      built += 1;
      return engine();
    });
    expect(service.forUser('a')).toBe(service.forUser('a'));
    expect(service.forUser('b')).not.toBe(service.forUser('a'));
    expect(built).toBe(2);
  });
});
