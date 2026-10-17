import { describe, expect, it } from 'vitest';

import { popupTitle } from './title';

describe('popupTitle', () => {
  it('names the product', () => {
    expect(popupTitle()).toBe('Nirvana');
  });
});
