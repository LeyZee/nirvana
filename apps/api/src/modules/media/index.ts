/** Public entry point of the `media` module (ADR 0002). Other modules import this file only. */
export interface MediaModule {
  readonly name: 'media';
}

/** Builds the module. Its dependencies arrive as arguments once the module has any (coding.md). */
export function createMediaModule(): MediaModule {
  return { name: 'media' };
}
