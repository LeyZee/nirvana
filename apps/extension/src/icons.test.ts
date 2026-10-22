import { describe, expect, it } from 'vitest';

/** WXT puts every public/icon/<size>.png in the manifest; Chrome wants 16, 32, 48 and 128. */
const icons = import.meta.glob<string>('../public/icon/*.png', {
  query: '?inline',
  import: 'default',
  eager: true,
});

/** Width and height from the PNG header (IHDR, bytes 16 to 23). */
function sizeOf(dataUrl: string): { width: number; height: number } {
  const bytes = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const int = (at: number): number =>
    ((bytes.charCodeAt(at) << 24) |
      (bytes.charCodeAt(at + 1) << 16) |
      (bytes.charCodeAt(at + 2) << 8) |
      bytes.charCodeAt(at + 3)) >>>
    0;
  return { width: int(16), height: int(20) };
}

describe('extension icons', () => {
  it.each([16, 32, 48, 128])('has a %i px square icon', (size) => {
    const icon = icons[`../public/icon/${String(size)}.png`];
    expect(icon).toBeDefined();
    expect(sizeOf(icon ?? '')).toEqual({ width: size, height: size });
  });
});
