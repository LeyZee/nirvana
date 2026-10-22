import { describe, expect, it } from 'vitest';

/**
 * Windows and macOS read `Reader.tsx` and `reader.ts` as the same file: TypeScript then refuses the import
 * (TS1149, TS1261), though Linux and the CI see nothing. Two modules of a folder never differ only by case.
 */
const modules = Object.keys(import.meta.glob('./**/*.{ts,tsx}'));

describe('module names', () => {
  it('never differ only by case in a folder', () => {
    const byName = new Map<string, string[]>();
    for (const path of modules) {
      const stem = path.replace(/(\.test)?\.tsx?$/, '');
      const name = stem.toLowerCase();
      byName.set(name, [...new Set([...(byName.get(name) ?? []), stem])]);
    }
    expect([...byName.values()].filter((stems) => stems.length > 1)).toEqual([]);
  });
});
