/**
 * Motion helpers for the Nirvana design system. Framework-free: React components call them from
 * effects, the extension popup calls them directly. State (selected tab, checked option) stays with
 * the caller; these helpers only move matter and light.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly left: number;
  readonly top: number;
}

export interface LensGeometry {
  readonly x: number;
  readonly width: number;
}

const ISLAND_SETTLE_MS = 700;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Pointer position relative to an element's box, in px. */
export function lightPosition(box: Box, clientX: number, clientY: number): Point {
  return { x: clientX - box.left, y: clientY - box.top };
}

/**
 * Makes the inner light of a `.nv-glass` surface follow the pointer.
 * Returns a cleanup function (React effect friendly).
 */
export function attachGlassLight(element: HTMLElement): () => void {
  const onMove = (event: PointerEvent): void => {
    const point = lightPosition(element.getBoundingClientRect(), event.clientX, event.clientY);
    element.style.setProperty('--nv-light-x', `${String(point.x)}px`);
    element.style.setProperty('--nv-light-y', `${String(point.y)}px`);
  };
  const onLeave = (): void => {
    element.style.removeProperty('--nv-light-x');
    element.style.removeProperty('--nv-light-y');
  };
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerleave', onLeave);
  return () => {
    element.removeEventListener('pointermove', onMove);
    element.removeEventListener('pointerleave', onLeave);
    onLeave();
  };
}

/** Plays the squash-and-release of a thumb or lens while it travels. No-op under reduced motion. */
export function playLiquid(element: HTMLElement): void {
  if (prefersReducedMotion()) return;
  element.classList.remove('is-liquid');
  // Reading layout restarts the CSS animation on the next class add.
  void element.offsetWidth;
  element.classList.add('is-liquid');
}

/** Where the tab bar lens must sit to cover an item. */
export function lensGeometry(item: Pick<HTMLElement, 'offsetLeft' | 'offsetWidth'>): LensGeometry {
  return { x: item.offsetLeft, width: item.offsetWidth };
}

/** Moves the `.nv-tabbar__lens` under `item`. The lens reads the variables from its tab bar. */
export function placeTabBarLens(tabBar: HTMLElement, item: HTMLElement, lens?: HTMLElement): void {
  const { x, width } = lensGeometry(item);
  tabBar.style.setProperty('--nv-lens-x', `${String(x)}px`);
  tabBar.style.setProperty('--nv-lens-width', `${String(width)}px`);
  if (lens) playLiquid(lens);
}

/** Moves the `.nv-seg__thumb` of a segmented control to option `index` of `count`. */
export function placeSegmentThumb(
  segmented: HTMLElement,
  index: number,
  count: number,
  thumb?: HTMLElement,
): void {
  segmented.style.setProperty('--nv-seg-count', String(count));
  segmented.style.setProperty('--nv-seg-index', String(index));
  if (thumb) playLiquid(thumb);
}

/** Shrinks a `.nv-island` into its capsule. */
export function collapseIsland(island: HTMLElement): void {
  island.style.height = `${String(island.offsetHeight)}px`;
  void island.offsetWidth;
  island.classList.add('is-collapsed');
  island.style.removeProperty('height');
}

/** Grows a collapsed `.nv-island` back to its content height on a spring. */
export function expandIsland(island: HTMLElement): void {
  island.classList.remove('is-collapsed');
  const height = island.offsetHeight;
  island.classList.add('is-collapsed');
  void island.offsetWidth;
  island.classList.remove('is-collapsed');
  island.style.height = `${String(height)}px`;
  window.setTimeout(() => {
    island.style.removeProperty('height');
  }, ISLAND_SETTLE_MS);
}
