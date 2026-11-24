"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AxisMark, KIND_COLORS } from "./marks";
import { isSelected, type Selection } from "./selection";
import type { StoryTheme } from "./story-theme";
import { placeLabels, yearOf, type Mark, type TimelineItem } from "./timeline-layout";

const START = 1900;
const END = 2165;
const PAD = 28;
const K_MIN = 2.5;
const K_MAX = 700;
const REACH = 56;
const clampK = (k: number) => Math.min(K_MAX, Math.max(K_MIN, k));

interface Props {
  items: TimelineItem[];
  theme: StoryTheme;
  /** The people being followed: their marks stand out and the rest fade. */
  focus: string | null;
  selection: Selection | null;
  /** The year to bring to the middle of the screen, once each time its key changes. */
  centre: { key: string; year: number } | null;
  onPick: (mark: Mark) => void;
  /** Called with the zoom controls, so the page can place them. */
  zoom: (controls: ZoomControls) => void;
}

export interface ZoomControls {
  level: number;
  set: (level: number) => void;
  step: (direction: 1 | -1) => void;
}

/** The zoom slider's position, 0 to 1000, on a log scale of pixels per year. */
export const toLevel = (k: number) => Math.round((Math.log(k / K_MIN) / Math.log(K_MAX / K_MIN)) * 1000);
const fromLevel = (level: number) => K_MIN * Math.pow(K_MAX / K_MIN, level / 1000);

function lanes(spans: TimelineItem[]): Map<string, number> {
  const ends: number[] = [];
  const lane = new Map<string, number>();
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    let i = ends.findIndex((end) => end < span.start);
    if (i === -1) i = ends.length;
    ends[i] = span.end;
    lane.set(span.key, i);
  }
  return lane;
}

/** Today never changes while the page is open; the server, which can't know the reader's day, draws no line. */
const noChange = () => () => undefined;
const todayYear = () => yearOf(new Date().toISOString().slice(0, 10));

/** The cover's four-pointed star, centred on the origin, one unit from centre to point. */
const STAR = "M0 -1L0.27 -0.27L1 0L0.27 0.27L0 1L-0.27 0.27L-1 0L-0.27 -0.27Z";

/** Stars scattered across the sky after `from`, thickening toward the end, the same every time. */
function starField(from: number, count: number): { year: number; across: number; size: number }[] {
  let seed = 2063;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: count }, () => ({ year: from + (END - from) * Math.sqrt(next()), across: next(), size: 2 + next() * 4 }));
}

function color(item: TimelineItem): string {
  switch (item.mark.type) {
    case "event":
      return KIND_COLORS[item.mark.kind];
    case "chapter":
      return "var(--story-chapter)";
    case "born":
    case "died":
      return "var(--story-ink-soft)";
  }
}

export function Timeline({ items, theme, focus, selection, centre, onPick, zoom }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const [k, setK] = useState(4);
  const today = useSyncExternalStore(noChange, todayYear, () => null);
  const anchor = useRef<{ year: number; clientY: number } | null>(null);
  // The scale on screen, and the one asked for. Zoom events can come faster than the page redraws
  // (a dragged slider, a wheel, a pinch), so each step builds on the scale asked for last, and the
  // year held at the centre is read once, from what is on screen, and kept until the redraw.
  const shown = useRef(k);
  const wanted = useRef(k);

  // The timeline's width, from the browser. The first width opens the story whole: every year
  // from the first event to the Federation on one screen.
  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    let fitted = false;
    const observer = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      if (fitted) return;
      fitted = true;
      const top = el.getBoundingClientRect().top + window.scrollY;
      wanted.current = clampK((window.innerHeight - top - 120) / (END - START));
      setK(wanted.current);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A label's height depends on the width it wraps in, so every label is watched, shown or not,
  // and placing waits until each has been measured.
  const labelSizes = useMemo(
    () =>
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) =>
            setHeights((before) => {
              const after = new Map(before);
              for (const entry of entries) {
                const key = (entry.target as HTMLElement).dataset.key;
                if (key !== undefined) after.set(key, (entry.target as HTMLElement).offsetHeight);
              }
              return after;
            }),
          ),
    [],
  );
  useEffect(() => () => labelSizes?.disconnect(), [labelSizes]);

  const zoomTo = useCallback((next: number, clientY = window.innerHeight / 2) => {
    const el = box.current;
    if (el === null) return;
    anchor.current ??= { year: START + (clientY - el.getBoundingClientRect().top - PAD) / shown.current, clientY };
    wanted.current = clampK(next);
    setK(wanted.current);
  }, []);

  // Zooming keeps the year under the pointer (or the screen's middle) where it was.
  useLayoutEffect(() => {
    shown.current = k;
    const held = anchor.current;
    if (held === null || box.current === null) return;
    anchor.current = null;
    const y = box.current.getBoundingClientRect().top + PAD + (held.year - START) * k;
    window.scrollBy(0, y - held.clientY);
  }, [k]);

  // What's picked comes to the middle of what the reader can see: the whole screen beside the
  // details panel, or the strip above it where it covers the lower part.
  const centreKey = centre?.key;
  const centreYear = centre?.year;
  useEffect(() => {
    const el = box.current;
    if (el === null || centreYear === undefined || centreKey === undefined) return;
    const beside = window.matchMedia("(min-width: 1024px)").matches;
    const target = beside ? window.innerHeight / 2 : window.innerHeight * 0.2;
    const top = el.getBoundingClientRect().top + window.scrollY + PAD + (centreYear - START) * shown.current;
    window.scrollTo({ top: top - target, behavior: "smooth" });
  }, [centreKey, centreYear]);

  const controls = useMemo<Omit<ZoomControls, "level">>(
    () => ({ set: (level) => zoomTo(fromLevel(level)), step: (direction) => zoomTo(wanted.current * (direction > 0 ? 1.6 : 1 / 1.6)) }),
    [zoomTo],
  );
  useEffect(() => {
    zoom({ level: toLevel(k), ...controls });
  }, [k, zoom, controls]);

  // Ctrl and the wheel, which is also what a trackpad pinch sends, and two fingers on a touch screen.
  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      zoomTo(wanted.current * Math.exp(-event.deltaY * 0.0025), event.clientY);
    };
    let pinch: { distance: number; k: number } | null = null;
    const spread = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) pinch = { distance: spread(event.touches), k: wanted.current };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (pinch === null || event.touches.length !== 2) return;
      event.preventDefault();
      zoomTo((pinch.k * spread(event.touches)) / pinch.distance, (event.touches[0].clientY + event.touches[1].clientY) / 2);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [zoomTo]);

  const y = useCallback((year: number) => PAD + (year - START) * k, [k]);
  const mid = width / 2;
  const narrow = width < 640;
  const zone = narrow ? 28 : 64;
  const gutter = narrow ? 12 : 32;
  const labelWidth = Math.max(0, mid - zone - gutter);
  const faded = useCallback((item: TimelineItem) => focus !== null && item.mark.type !== "chapter" && !item.people.includes(focus), [focus]);

  const tops = useMemo(() => {
    if (width === 0 || items.some((item) => !heights.has(item.key))) return null;
    const result = new Map<string, number>();
    for (const side of ["world", "people"] as const) {
      const boxes = items
        .filter((item) => item.side === side)
        .map((item) => ({
          key: item.key,
          want: item.mark.type === "chapter" ? (y(item.start) + y(item.end)) / 2 : y(item.start),
          height: heights.get(item.key) ?? 0,
          rank: item.rank + (faded(item) ? 10 : 0),
        }));
      for (const [key, top] of placeLabels(boxes, narrow ? 6 : 8, REACH)) result.set(key, top);
    }
    return result;
  }, [items, heights, width, y, narrow, faded]);

  const spans = useMemo(() => lanes(items.filter((item) => item.end > item.start)), [items]);
  const stars = useMemo(() => starField(theme.starsFrom, 160), [theme.starsFrom]);
  const total = y(END) + PAD;
  const ground = `linear-gradient(to bottom, ${theme.eras.map((era) => `${era.color} ${((y(era.year) / total) * 100).toFixed(2)}%`).join(", ")})`;
  const yearStep = [1, 2, 5, 10, 25, 50].find((step) => step * k >= 44) ?? 100;
  const years: number[] = [];
  for (let year = Math.ceil(START / yearStep) * yearStep; year <= END; year += yearStep) years.push(year);

  return (
    <div ref={box} className="relative touch-pan-y" style={{ height: total, background: ground }}>
      {width > 0 && (
        <svg aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
          {Array.from({ length: (END - START) / 10 }, (_, i) => START + i * 10)
            .filter((decade) => (decade / 10) % 2 === 1)
            .map((decade) => (
              <rect key={decade} x={0} y={y(decade)} width={width} height={10 * k} className="fill-story-band" />
            ))}
          {stars.map((star, i) => (
            <path key={i} d={STAR} transform={`translate(${star.across * width} ${y(star.year)}) scale(${star.size})`} className="fill-story-ink" fillOpacity={0.55} />
          ))}
          <line x1={mid} x2={mid} y1={PAD} y2={y(END)} className="stroke-story-ink" strokeWidth={2} />
          {k >= 6 &&
            Array.from({ length: END - START + 1 }, (_, i) => START + i).map((year) => (
              <line key={year} x1={mid - 4} x2={mid + 4} y1={y(year)} y2={y(year)} className="stroke-story-ink-soft" />
            ))}
          {today !== null && (
            <g>
              <line x1={0} x2={width} y1={y(today)} y2={y(today)} className="stroke-story-ink-soft" strokeDasharray="6 4" />
              <text x={width - 4} y={y(today) - 5} textAnchor="end" className="fill-story-ink-soft font-story-label text-[11px] tracking-widest">
                TODAY
              </text>
            </g>
          )}
          {items.map((item) => {
            const dir = item.side === "world" ? -1 : 1;
            const lane = spans.get(item.key);
            const opacity = faded(item) ? 0.2 : 1;
            const top = tops?.get(item.key);
            const want = item.mark.type === "chapter" ? (y(item.start) + y(item.end)) / 2 : y(item.start);
            const barX = mid + dir * (24 + (lane ?? 0) * 7);
            const from = lane === undefined ? mid + dir * 3 : barX + dir * 2.5;
            return (
              <g key={item.key} opacity={opacity}>
                {lane !== undefined && (
                  <rect x={barX - 2.5} y={y(item.start)} width={5} height={Math.max(3, y(item.end) - y(item.start))} rx={1.5} fill={color(item)} fillOpacity={item.mark.type === "chapter" ? 1 : 0.55} />
                )}
                {top !== undefined && (
                  <polyline
                    points={`${from},${want} ${lane === undefined ? mid + dir * zone * 0.45 : from + dir * 4},${want} ${mid + dir * (zone - 4)},${top + Math.min((heights.get(item.key) ?? 0) / 2, 16)}`}
                    fill="none"
                    stroke={color(item)}
                    strokeOpacity={0.8}
                  />
                )}
                {lane === undefined && (
                  <AxisMark kind={item.mark.type === "event" ? item.mark.kind : item.mark.type === "born" ? "born" : "died"} x={mid} y={y(item.start)} />
                )}
              </g>
            );
          })}
          {years.map((year) => (
            <g key={year}>
              <rect x={mid - 19} y={y(year) - 8} width={38} height={16} rx={3} className="fill-story-night stroke-story-line" />
              <text x={mid} y={y(year) + 4} textAnchor="middle" className="fill-story-ink font-story-label text-[12px]">
                {year}
              </text>
            </g>
          ))}
        </svg>
      )}
      {width > 0 &&
        items.map((item) => {
          const top = tops?.get(item.key);
          const hidden = top === undefined;
          const picked = isSelected(item.mark, selection);
          const left = item.side === "world" ? mid - zone - labelWidth : mid + zone;
          return (
            <button
              key={item.key}
              type="button"
              data-key={item.key}
              ref={(el) => {
                if (el === null || labelSizes === null) return;
                labelSizes.observe(el);
                return () => labelSizes.unobserve(el);
              }}
              onClick={() => onPick(item.mark)}
              aria-pressed={picked}
              aria-hidden={hidden}
              tabIndex={hidden ? -1 : 0}
              className={`absolute grid gap-px rounded-sm px-1 py-0.5 text-left text-sm leading-snug transition-opacity text-story-ink hover:bg-story-band focus-visible:outline-2 focus-visible:outline-story-canon ${item.side === "world" ? "text-right" : ""} ${picked ? "bg-story-night/70 ring-1 ring-story-ink-soft" : ""} ${faded(item) ? "opacity-25" : ""} ${hidden ? "invisible" : ""}`}
              style={{ left, top: top ?? 0, width: labelWidth }}
            >
              <span className="font-story-label text-xs uppercase tracking-wide text-story-ink-soft">{item.dateText}</span>
              <span className={`${item.mark.type === "chapter" ? "font-story-display text-base" : ""} ${item.mark.type === "died" ? "italic" : ""}`} style={item.mark.type === "event" && item.mark.kind === "canon" ? { color: KIND_COLORS.canon } : undefined}>
                {item.mark.type === "chapter" && <span className="mr-1.5 font-story-label text-sm text-story-chapter">{item.mark.index + 1}</span>}
                {item.label}
              </span>
            </button>
          );
        })}
    </div>
  );
}
