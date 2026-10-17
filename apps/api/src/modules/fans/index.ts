/** Public entry point of the `fans` module (ADR 0002). Other modules import this file only. */
export interface FansModule {
  readonly name: 'fans';
}

/** Builds the module. Its dependencies arrive as arguments once the module has any (coding.md). */
export function createFansModule(): FansModule {
  return { name: 'fans' };
}
