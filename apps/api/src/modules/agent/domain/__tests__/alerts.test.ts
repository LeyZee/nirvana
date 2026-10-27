import { describe, expect, it } from 'vitest';

import { alertKeywordsIn } from '../alerts';

// The demo persona's keywords (personas/demo), fictional messages (ADR 0010).
const KEYWORDS = ['IA', 'Bot', 'Robot', 'Vocal', 'Rencontre', 'Rendez-vous', 'Numéro'];

describe('alertKeywordsIn (P4-01)', () => {
  it('finds her keywords whatever the case, the accents or the punctuation', () => {
    expect(alertKeywordsIn('T’es un BOT ou quoi ?', KEYWORDS)).toEqual(['Bot']);
    expect(alertKeywordsIn('on se fait un rendez vous ?', KEYWORDS)).toEqual(['Rendez-vous']);
    expect(alertKeywordsIn('file moi ton numero', KEYWORDS)).toEqual(['Numéro']);
    expect(alertKeywordsIn('une rencontre... et un vocal ?', KEYWORDS)).toEqual(['Vocal', 'Rencontre']);
  });

  it('matches whole words only', () => {
    expect(alertKeywordsIn('il y a du soleil, tu vois les robots de cuisine ?', KEYWORDS)).toEqual([]);
    expect(alertKeywordsIn('je suis vocaliste', KEYWORDS)).toEqual([]);
    expect(alertKeywordsIn('une idée', KEYWORDS)).toEqual([]);
  });

  it('reads the digits inside his words as letters', () => {
    expect(alertKeywordsIn('t’es un r0b0t ?', KEYWORDS)).toEqual(['Robot']);
    expect(alertKeywordsIn('je rentre à 18h', KEYWORDS)).toEqual([]);
  });

  it('matches nothing without keywords, and ignores an empty one', () => {
    expect(alertKeywordsIn('t’es un bot', [])).toEqual([]);
    expect(alertKeywordsIn('t’es un bot', ['', ' – '])).toEqual([]);
  });
});
