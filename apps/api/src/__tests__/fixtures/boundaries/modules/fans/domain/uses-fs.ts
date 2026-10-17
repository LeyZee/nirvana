// Violation: the domain does no I/O.
import { readFileSync } from 'node:fs';

export const usesFs = readFileSync;
