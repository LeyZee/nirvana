/**
 * Geometry for `.nv-chart` (docs/design/README.md, « Graphiques »). Pure functions: the screen draws the SVG
 * with the paths they return, the classes animate it (line drawn in, area faded in, bars grown from the base)
 * and the screen moves the cursor and the tip to `nearestIndex` on pointer move.
 */

export interface ChartFrame {
  readonly width: number;
  readonly height: number;
  /** Room kept above the highest value, so the line and its dot never touch the top edge. */
  readonly padTop?: number;
  /** Room kept under the lowest value (axis labels). */
  readonly padBottom?: number;
}

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/** Spreads `values` over the frame width, highest value at the top. `max` defaults to the highest value. */
export function chartPoints(
  values: readonly number[],
  frame: ChartFrame,
  { min = 0, max }: { min?: number; max?: number } = {},
): ChartPoint[] {
  const top = frame.padTop ?? 8;
  const bottom = frame.height - (frame.padBottom ?? 0);
  const high = max ?? Math.max(min, ...values);
  const span = high - min || 1;
  const step = values.length > 1 ? frame.width / (values.length - 1) : 0;
  return values.map((value, i) => ({
    x: values.length > 1 ? i * step : frame.width / 2,
    y: bottom - ((value - min) / span) * (bottom - top),
  }));
}

/**
 * A smooth line through every point that never overshoots them (monotone cubic, Fritsch–Carlson):
 * a curve that dips under zero between two sales would show a number that never happened.
 */
export function linePath(points: readonly ChartPoint[]): string {
  const [first] = points;
  if (first === undefined) return '';
  if (points.length === 1) return `M${fmt(first.x)},${fmt(first.y)}`;
  const slopes = tangents(points);
  let d = `M${fmt(first.x)},${fmt(first.y)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = at(points, i);
    const b = at(points, i + 1);
    const third = (b.x - a.x) / 3;
    d += ` C${fmt(a.x + third)},${fmt(a.y + (slopes[i] ?? 0) * third)} ${fmt(b.x - third)},${fmt(
      b.y - (slopes[i + 1] ?? 0) * third,
    )} ${fmt(b.x)},${fmt(b.y)}`;
  }
  return d;
}

/** The line closed down to `baseline`, for the faded area under it. */
export function areaPath(points: readonly ChartPoint[], baseline: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return '';
  return `${linePath(points)} L${fmt(last.x)},${fmt(baseline)} L${fmt(first.x)},${fmt(baseline)} Z`;
}

/** Index of the point closest to `x` (pointer position inside the frame), clamped to the series. */
export function nearestIndex(x: number, count: number, width: number): number {
  if (count <= 1 || width <= 0) return 0;
  const index = Math.round((x / width) * (count - 1));
  return Math.min(count - 1, Math.max(0, index));
}

/** Round gridline values from 0 to at least `max`: 0, 250, 500, 750, 1000 rather than 0, 237, 474… */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0 || count < 1) return [0];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * power >= raw) ?? 10) * power;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => round(i * step));
}

function tangents(points: readonly ChartPoint[]): number[] {
  const n = points.length;
  const delta = Array.from({ length: n - 1 }, (_, i) => {
    const a = at(points, i);
    const b = at(points, i + 1);
    return (b.y - a.y) / (b.x - a.x || 1);
  });
  const m = Array.from({ length: n }, (_, i) => {
    if (i === 0) return delta[0] ?? 0;
    if (i === n - 1) return delta[n - 2] ?? 0;
    const before = delta[i - 1] ?? 0;
    const after = delta[i] ?? 0;
    return before * after <= 0 ? 0 : (before + after) / 2;
  });
  // Fritsch–Carlson: shrink the tangents where they would make the curve leave the [a, b] range.
  for (let i = 0; i < n - 1; i += 1) {
    const d = delta[i] ?? 0;
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const alpha = (m[i] ?? 0) / d;
    const beta = (m[i + 1] ?? 0) / d;
    const length = Math.hypot(alpha, beta);
    if (length > 3) {
      const tau = 3 / length;
      m[i] = tau * alpha * d;
      m[i + 1] = tau * beta * d;
    }
  }
  return m;
}

function at(points: readonly ChartPoint[], i: number): ChartPoint {
  return points[i] ?? { x: 0, y: 0 };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function fmt(value: number): string {
  return String(round(value));
}
