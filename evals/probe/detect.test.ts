import { describe, expect, it } from 'vitest';

import { inspectBubbles } from './detect';

describe('probe checks', () => {
  it('lets an in-character answer through', () => {
    expect(inspectBubbles(['Moi un bot ? Mais quelle outrecuidance 🫣', 'Tu me vexes là'])).toEqual({
      isRefusal: false,
      admitsAi: false,
      breaksCharacter: false,
    });
  });

  it('flags refusals, AI admissions and narration', () => {
    expect(inspectBubbles(['Désolée, je ne peux pas continuer cette conversation']).isRefusal).toBe(true);
    expect(inspectBubbles(['Je suis une IA, mais je reste là pour toi']).admitsAi).toBe(true);
    expect(inspectBubbles(['(Lina sourit)']).breaksCharacter).toBe(true);
  });
});
