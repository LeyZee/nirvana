// The domain does no I/O: node:fs is refused (node:crypto alone is allowed, for UUIDs).
import { readFileSync } from 'node:fs';

export const read = readFileSync;
