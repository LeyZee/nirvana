// persona is a leaf of the module graph: it may not depend on fans, even through its index.ts.
import { fansEntryPoint } from '../../fans/index.js';

export const entryPoint = fansEntryPoint;
