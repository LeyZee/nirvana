// Half of an import cycle with cycle-b.ts.
import { cycleB } from './cycle-b.js';

export const cycleA = (): string => cycleB();
