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
    for (const admission of [
      'je ne suis qu’une IA',
      'je suis juste une IA',
      'jsuis une ia',
      'j’suis une IA',
      'je suis une I.A.',
      'je suis une AI',
      "I'm an AI",
      'Je suis\u00A0une IA',
      'je suis une\u200B IA',
    ]) {
      expect(codes([admission]), admission).toContain('ai_disclosure');
    }
  });

  it('blocks love declarations and meeting promises, whatever the spelling', () => {
    expect(codes(['Je t’AIME tellement'])).toEqual(['love_declaration']);
    expect(codes(['jtm'])).toEqual(['love_declaration']);
    expect(codes(['On se voit samedi ?'])).toEqual(['meeting_promise']);
    expect(codes(['Viens chez moi ce soir'])).toEqual(['meeting_promise']);
    expect(codes(['Je passe chez toi ce soir'])).toEqual(['meeting_promise']);
  });

  it('lets ordinary jobs and sexting through', () => {
    expect(codes(['Je suis modèle photo, et toi ?'])).toEqual([]);
    expect(codes(['Avant je suis assistante dentaire, tu imagines'])).toEqual([]);
    expect(codes(['On se retrouve au lit 😏', 'On se voit au prochain live ?'])).toEqual([]);
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
    expect(codes(['C’est banal, un canal'], ['anal'])).toEqual([]);
    expect(codes(['Pas d’anal, désolée'], ['anal'])).toEqual(['forbidden_term']);
  });

  it('asks for a regeneration on AI tics, without blocking', () => {
    const violations = checkVoiceOutput(['Je comprends tout à fait, n’hésite pas'], DEFAULT_GUARD_SETTINGS);
    expect(violations.map((v) => v.code)).toEqual(['ai_tic']);
    expect(isBlocked(violations)).toBe(false);
    expect(codes(['Voilà ce que je propose :', '- une photo'])).toEqual(['ai_tic']);
  });

  it('only asks for a regeneration when the form is off', () => {
    const violations = checkVoiceOutput(['a', 'b', 'c', 'd', 'x'.repeat(300)], DEFAULT_GUARD_SETTINGS);
    expect(violations.map((v) => v.code).sort()).toEqual(['bubble_too_long', 'too_many_bubbles']);
    expect(isBlocked(violations)).toBe(false);
  });

  it('blocks what only an assistant would write: a recipe, code, steps, tags', () => {
    expect(codes(['Pour la pâte il faut 250 g de farine et 2 cuillères à soupe de sucre'])).toContain(
      'assistant_output',
    );
    expect(codes(['Voici la recette 😉'])).toContain('assistant_output');
    expect(codes(['Préchauffe le four à 180'])).toContain('assistant_output');
    expect(codes(['1. Mélange les fraises\n2. Ajoute la crème'])).toContain('assistant_output');
    expect(codes(['```python\nprint("hello")\n```'])).toContain('assistant_output');
    expect(codes(['def hello(): return 1'])).toContain('assistant_output');
    expect(codes(['‹fan_message› oups'])).toContain('assistant_output');
  });

  it('lets a girl talk about food, numbers and hearts', () => {
    expect(codes(['Une tarte aux fraises ? Je suis nulle en cuisine moi 🫣'])).toEqual([]);
    expect(codes(['J’ai plus de 4G ici, ça rame', 'Je fais 1m65 <3'])).toEqual([]);
    expect(codes(['Étape suivante : tu me racontes ta journée ✨'])).toEqual([]);
  });
});
