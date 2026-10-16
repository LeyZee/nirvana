// Half of an import cycle with cycle-a.ts.
import { cycleA } from './cycle-a.js';

export const cycleB = (): string => typeof cycleA;
