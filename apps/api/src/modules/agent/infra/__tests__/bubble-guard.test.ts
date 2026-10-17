import { describe, expect, it } from 'vitest';

import { DEFAULT_GUARD_SETTINGS } from '../../domain/guards';
import { createBubbleGuard } from '../bubble-guard';

describe('bubble guard (approval of edited bubbles)', () => {
  const guard = createBubbleGuard({ ...DEFAULT_GUARD_SETTINGS, forbiddenTerms: ['Mon adresse'] });

  it('refuses an edit that gives her away, split or masked, and her forbidden words', () => {
    expect(guard.check(['ok je suis une', '1A'])).toEqual({ isBlocked: true, codes: ['ai_disclosure'] });
    expect(guard.check(['mon num 06 12', '34 56 78'])).toMatchObject({
      isBlocked: true,
      codes: ['contact_info'],
    });
    expect(guard.check(['Je te donne mon adresse ?']).codes).toContain('forbidden_term');
  });

  it('lets a long or many-bubble edit through: soft guards are the chatter’s call', () => {
    const long = 'Coucou '.repeat(60);
    expect(guard.check([long, 'a', 'b', 'c', 'd'])).toEqual({ isBlocked: false, codes: [] });
  });
});
