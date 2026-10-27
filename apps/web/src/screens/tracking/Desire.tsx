import type { ConversationDesire, DesirePoint } from '@nirvana/contracts';
import { chartPoints, linePath, nearestIndex } from '@nirvana/design-system';
import { useQuery } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { fetchDesireCurve } from './api';

import { DESIRE_BAND_LABELS, movementOf, signalsLine } from '@/agent/desire';
import { clockAt, dayOf, shortDay } from '@/scheduling/time';

/** The curve follows the reader's pace: a new message of his moves it. */
const REFRESH_MS = 10_000;

/** The two floors drawn across the curve, named by the band they open (glossary « Note de désir »). */
const FLOORS = [
  { value: 40, band: 'playful' },
  { value: 70, band: 'hot' },
] as const;

/**
 * « Désir » in the reader's sheet of the fan (P3-12): the band in a word over a neutral gauge, then, opened, the curve
 * of his score message after message. The server cools the score and picks the band; nothing is computed here. A fan
 * without a score yet has no line at all.
 */
export function DesireSheet({
  creatorId,
  conversationId,
  desire,
}: {
  creatorId: string;
  conversationId: string;
  desire: ConversationDesire | null;
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['desire', creatorId, conversationId],
    queryFn: () => fetchDesireCurve(creatorId, conversationId),
    enabled: open && desire !== null,
    refetchInterval: REFRESH_MS,
  });
  if (desire === null) return null;
  const band = DESIRE_BAND_LABELS[desire.band];
  return (
    <details
      className="tr-limits tr-desire"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>
        <span className="tr-limits__title">Désir</span>
        <span className="tr-desire__sum">
          {/* Never amber nor neon: this gauge counts no budget, and the list is no heat map. */}
          <span
            className="nv-gauge tr-desire__gauge"
            role="meter"
            aria-label="Note de désir"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={desire.score}
            aria-valuetext={`${String(desire.score)} sur 100, ${band}`}
            style={{ '--nv-gauge-value': `${String(desire.score)}%` }}
          >
            <span className="nv-gauge__fill" />
          </span>
          <span>{band}</span>
        </span>
      </summary>
      <div className="tr-limits__body">
        {query.data === undefined ? (
          <p className="tr-desire__empty">
            {query.isError
              ? 'Le serveur ne répond pas : la courbe n’a pas pu être lue.'
              : 'Lecture de la courbe…'}
          </p>
        ) : query.data.length < 2 ? (
          <p className="tr-desire__empty">Pas encore assez de messages pour une courbe.</p>
        ) : (
          <DesireChart points={query.data} />
        )}
      </div>
    </details>
  );
}

const CHART = { left: 30, right: 44, top: 10, bottom: 8, height: 132 } as const;

/** Above this height (px from the top), a tip opened over its point would run out of the chart. */
const TIP_ROOM = 72;

/** Arrow keys walk the points, as the pointer does. */
const STEPS: Readonly<Record<string, 1 | -1>> = { ArrowRight: 1, ArrowLeft: -1 };

/** His score message after message, in `data-1` (the neon is the urgencies' light), from 0 to 100. */
function DesireChart({ points }: { points: readonly DesirePoint[] }): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return undefined;
    const measure = (): void => {
      setWidth(element.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const { height } = CHART;
  const plotWidth = Math.max(0, width - CHART.left - CHART.right);
  const base = height - CHART.bottom;
  const frame = { width: plotWidth, height, padTop: CHART.top, padBottom: CHART.bottom };
  const at = chartPoints(
    points.map((p) => p.score),
    frame,
    { min: 0, max: 100 },
  );
  const y = (value: number): number => base - (value / 100) * (base - CHART.top);
  const last = points.length - 1;
  const point = hover === null ? undefined : points[hover];
  const dot = hover === null ? undefined : at[hover];
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = dayOf(new Date(), zone);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    setHover((current) => Math.min(last, Math.max(0, (current ?? last) + step)));
  };

  return (
    <div
      className={`nv-chart tr-desire__chart${dot === undefined ? '' : ' is-hovering'}`}
      ref={box}
      tabIndex={0}
      aria-label="Note de désir au fil de ses messages. Les flèches passent d’un point à l’autre."
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setHover(nearestIndex(event.clientX - rect.left - CHART.left, points.length, plotWidth));
      }}
      onPointerLeave={() => {
        setHover(null);
      }}
      onFocus={() => {
        setHover(last);
      }}
      onBlur={() => {
        setHover(null);
      }}
      onKeyDown={onKeyDown}
    >
      {width === 0 ? null : (
        <svg viewBox={`0 0 ${String(width)} ${String(height)}`} height={height} aria-hidden="true">
          {[0, 100].map((value) => (
            <g key={value}>
              <line
                className="nv-chart__grid"
                x1={CHART.left}
                x2={width - CHART.right}
                y1={y(value)}
                y2={y(value)}
              />
              <text className="nv-chart__axis" x={CHART.left - 8} y={y(value) + 4} textAnchor="end">
                {String(value)}
              </text>
            </g>
          ))}
          {FLOORS.map((floor) => (
            <g key={floor.value}>
              <line
                className="nv-chart__grid tr-desire__floor"
                x1={CHART.left}
                x2={width - CHART.right}
                y1={y(floor.value)}
                y2={y(floor.value)}
              />
              <text className="nv-chart__axis" x={CHART.left - 8} y={y(floor.value) + 4} textAnchor="end">
                {String(floor.value)}
              </text>
              <text className="nv-chart__axis" x={width - CHART.right + 6} y={y(floor.value) + 4}>
                {DESIRE_BAND_LABELS[floor.band]}
              </text>
            </g>
          ))}
          <g transform={`translate(${String(CHART.left)},0)`}>
            <path className="nv-chart__line" pathLength={1} d={linePath(at)} />
            {dot === undefined ? null : (
              <>
                <line className="nv-chart__cursor" x1={dot.x} x2={dot.x} y1={CHART.top} y2={base} />
                <circle className="nv-chart__dot" cx={dot.x} cy={dot.y} r={4} />
              </>
            )}
          </g>
        </svg>
      )}
      {point === undefined || dot === undefined ? null : (
        <div
          className={`nv-chart__tip tr-desire__tip${dot.y < TIP_ROOM ? ' is-below' : ''}`}
          role="status"
          style={{
            '--nv-tip-x': `${String(Math.min(Math.max(dot.x + CHART.left, 110), width - 110))}px`,
            '--nv-tip-y': `${String(dot.y)}px`,
          }}
        >
          <span className="nv-chart__tip-l">
            {dayOf(point.at, zone) === today
              ? clockAt(point.at, zone)
              : `${shortDay(dayOf(point.at, zone))} · ${clockAt(point.at, zone)}`}
          </span>
          <span className="nv-chart__tip-v">{movementOf(point)}</span>
          <span className="nv-chart__tip-l tr-desire__signals">{signalsLine(point.signals)}</span>
        </div>
      )}
    </div>
  );
}
