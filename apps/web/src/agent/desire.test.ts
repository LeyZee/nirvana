import { DESIRE_BANDS, DESIRE_SIGNALS } from '@nirvana/contracts';
import { describe, expect, it } from 'vitest';

import { DESIRE_BAND_LABELS, DESIRE_SIGNAL_LABELS, movementOf, signalsLine, thresholdHint } from './desire';

describe('the desire score in words (P3-12)', () => {
  it('has a word for every band and every signal of the contracts', () => {
    expect(Object.keys(DESIRE_BAND_LABELS)).toEqual([...DESIRE_BANDS]);
    expect(Object.keys(DESIRE_SIGNAL_LABELS).toSorted()).toEqual([...DESIRE_SIGNALS].toSorted());
    expect(Object.values(DESIRE_SIGNAL_LABELS).every((label) => label.trim() !== '')).toBe(true);
  });

  it('groups a repeated signal, in the order counted', () => {
    expect(signalsLine(['steers_to_intimate', 'long_reply', 'suggestive_emoji', 'suggestive_emoji'])).toBe(
      'Il ramène vers l’intime, réponse longue, emoji suggestif ×2',
    );
    expect(signalsLine(['frozen'])).toBe('Figée : risque sur le message');
  });

  it('says what a message moved, and the first score as such', () => {
    expect(movementOf({ before: null, score: 46 })).toBe('Première note : 46');
    expect(movementOf({ before: 46, score: 60 })).toBe('+14');
    expect(movementOf({ before: 60, score: 52 })).toBe('−8');
    expect(movementOf({ before: 52, score: 52 })).toBe('0');
  });

  it('says the band a threshold falls in, changing at 40 and at 70', () => {
    expect(thresholdHint(39, 40, 'quand elle ouvre l’intime')).toBe(
      'À partir de 39 : bande neutre. Le Suivi dira encore « neutre » quand elle ouvre l’intime.',
    );
    expect(thresholdHint(40, 40, 'quand elle ouvre l’intime')).toBe('À partir de 40 : bande joueur.');
    expect(thresholdHint(69, 70, 'quand les scripts partent')).toBe(
      'À partir de 69 : bande joueur. Le Suivi dira encore « joueur » quand les scripts partent.',
    );
    expect(thresholdHint(70, 70, 'quand les scripts partent')).toBe('À partir de 70 : bande chaud.');
    expect(thresholdHint(undefined, 70, 'quand les scripts partent')).toBe(
      'Par défaut : 70. À partir de 70 : bande chaud.',
    );
  });
});
