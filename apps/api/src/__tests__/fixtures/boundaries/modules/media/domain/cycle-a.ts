// Violation: cycle-a and cycle-b import each other.
import { cycleB } from './cycle-b';

export const cycleA = (): string => cycleB();
