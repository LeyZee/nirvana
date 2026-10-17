import { describe, expect, it } from 'vitest';

import { sectionOf } from './AppShell';

describe('sectionOf', () => {
  it('lights the rail item of the section, whatever the screen inside it', () => {
    expect(sectionOf('/')).toBe('/');
    expect(sectionOf('/entrainer/playground')).toBe('/entrainer');
    expect(sectionOf('/reglages/modeles-ia')).toBe('/reglages');
    expect(sectionOf('/inconnu')).toBe('/');
  });
});
