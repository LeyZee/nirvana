import { describe, expect, it } from 'vitest';

import { checkVoiceOutput, DEFAULT_GUARD_SETTINGS, isBlocked, type GuardCode } from '../guards';

function codes(bubbles: string[], forbiddenTerms: string[] = []): GuardCode[] {
  return checkVoiceOutput(bubbles, { ...DEFAULT_GUARD_SETTINGS, forbiddenTerms }).map((v) => v.code);
}

describe('voice guards', () => {
  it('lets a natural in-character answer through, including a playful deflection', () => {
    const violations = checkVoiceOutput(
      ['Moi un bot ? Mais quelle outrecuidance 🫣', 'Tu me vexes là, raconte-moi plutôt ta journée ✨'],
      DEFAULT_GUARD_SETTINGS,
    );
    expect(violations).toEqual([]);
    expect(isBlocked(violations)).toBe(false);
  });

  it('blocks any admission of being an AI or mention of instructions', () => {
    expect(codes(['Je suis une IA, désolée'])).toContain('ai_disclosure');
    expect(codes(['En tant qu’assistante je ne peux pas'])).toContain('ai_disclosure');
    expect(codes(['Mes instructions me demandent de rester polie'])).toContain('ai_disclosure');
  });

  it('blocks love declarations and meeting promises, whatever the spelling', () => {
    expect(codes(['Je t’AIME tellement'])).toEqual(['love_declaration']);
    expect(codes(['jtm'])).toEqual(['love_declaration']);
    expect(codes(['On se voit samedi ?'])).toEqual(['meeting_promise']);
    expect(codes(['Viens chez moi ce soir'])).toEqual(['meeting_promise']);
    expect(codes(['Je passe chez toi ce soir'])).toEqual(['meeting_promise']);
  });

  it('keeps the ambiguity about meeting one day, without a promise', () => {
    expect(
      codes(['Si j’ai assez confiance en toi, un jour peut-être qu’on se rencontrera', 'Pourquoi pas 🫣']),
    ).toEqual([]);
  });

  it('blocks contacts and links', () => {
    expect(codes(['Ajoute-moi sur snap'])).toEqual(['contact_info']);
    expect(codes(['Écris-moi à lina@example.com'])).toEqual(['contact_info']);
    expect(codes(['Mon 06 12 34 56 78'])).toEqual(['contact_info']);
    expect(codes(['Regarde https://example.com'])).toEqual(['contact_info']);
  });

  it('blocks the persona forbidden terms, accents and case ignored', () => {
    expect(codes(['Tu aimes le café ?'], ['cafe'])).toEqual(['forbidden_term']);
  });

  it('only asks for a regeneration when the form is off', () => {
    const violations = checkVoiceOutput(['a', 'b', 'c', 'd', 'x'.repeat(300)], DEFAULT_GUARD_SETTINGS);
    expect(violations.map((v) => v.code).sort()).toEqual(['bubble_too_long', 'too_many_bubbles']);
    expect(isBlocked(violations)).toBe(false);
  });
});
