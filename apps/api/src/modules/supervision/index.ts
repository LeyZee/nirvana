/** Public entry point of the `supervision` module (ADR 0002). Other modules import this file only. */
export interface SupervisionModule {
  readonly name: 'supervision';
}

/** Builds the module. Its dependencies arrive as arguments once the module has any (coding.md). */
export function createSupervisionModule(): SupervisionModule {
  return { name: 'supervision' };
}
