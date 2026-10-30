"use client";

import { useEffect, useMemo, useRef } from "react";
import { CADENCE_NAMES, beatsAt, keyAt, printed, toneVar, type Analysis, type Chord, type Feature } from "../analysis";
import { dynamicsOf } from "../dynamics";
import { cursor } from "../player";
import { allPedals, timingOf } from "../tempo";
import { barBeats, scoreBeats, type Score } from "../types";

// One lane that reads the same over both views: time runs left to right past a
// fixed line, at a pace that keeps the shortest chord legible. Bars and marks
// above, chord symbols, Roman numerals, then the picked theme's stretches.
// Along the bottom, the tempo as it moves and the pedal as it goes down. Moved on
// animation frames, written straight to the element.

const LINE_SHARE = 0.25;
const LABEL_PIXELS = 56;
const MIN_BEAT_PIXELS = 34;
const MAX_BEAT_PIXELS = 72;
const BAR_NUMBER_ROOM = 18;
const DYNAMIC_ROOM = 46;

function beatPixels(score: Score, analysis: Analysis): number {
  const starts = analysis.chords.map((chord) => beatsAt(score, chord));
  const gaps = starts.slice(1).map((start, index) => start - starts[index]).sort((a, b) => a - b);
  const typical = gaps.at(Math.floor(gaps.length / 8)) ?? 4;
  return Math.max(MIN_BEAT_PIXELS, Math.min(MAX_BEAT_PIXELS, LABEL_PIXELS / typical));
}

const CURVE_HEIGHT = 12;

// The tempo drawn across the piece: flat where it holds, a slope where it glides,
// a cliff where it changes. Only where it does change.
function TempoCurve({ score, scale, total }: { score: Score; scale: number; total: number }) {
  const { points } = timingOf(score);
  if (points.length < 2) return null;
  const speeds = points.map((point) => point.bpm);
  const [low, high] = [Math.min(...speeds), Math.max(...speeds)];
  const y = (bpm: number): number => CURVE_HEIGHT - 1 - ((bpm - low) / Math.max(1, high - low)) * (CURVE_HEIGHT - 2);
  const line = points.flatMap((point, index) => {
    const before = points.at(index - 1);
    const step = index > 0 && point.glide !== true && before !== undefined ? [`${String(point.beat * scale)},${String(y(before.bpm))}`] : [];
    return [...step, `${String(point.beat * scale)},${String(y(point.bpm))}`];
  });
  const last = points[points.length - 1];
  line.push(`${String(total * scale)},${String(y(last.bpm))}`);
  const about = `Tempo: ${String(Math.round(low))} to ${String(Math.round(high))} beats a minute`;
  return (
    <svg role="img" aria-label={about} width={total * scale} height={CURVE_HEIGHT} className="absolute bottom-0 left-0 max-md:hidden">
      <title>{about}</title>
      <polyline points={line.join(" ")} fill="none" strokeWidth={1.5} className="stroke-brand-green" />
    </svg>
  );
}

function chordAbout(chord: Chord, key: string): string {
  const roman = chord.roman === null ? "no function" : `${printed(chord.roman)} in ${printed(key)}`;
  const cadence = chord.cadence === undefined ? "" : ` ${CADENCE_NAMES[chord.cadence]}.`;
  const doubt = chord.ambiguous === true ? " Ambiguous." : "";
  return `Bar ${String(chord.bar)}, beat ${String(chord.beat)}: ${printed(chord.symbol)}, ${roman}.${cadence}${doubt}${chord.about === undefined ? "" : ` ${chord.about}`}`;
}

interface LaneProps {
  score: Score;
  analysis: Analysis | undefined;
  picked: Feature | null;
  onDetail: (text: string) => void;
}

export function HarmonyLane({ score, analysis, picked, onDetail }: LaneProps) {
  const frame = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const keyFlag = useRef<HTMLSpanElement>(null);
  const scale = useMemo(() => (analysis === undefined ? MIN_BEAT_PIXELS : beatPixels(score, analysis)), [score, analysis]);
  const bar = barBeats(score);
  const total = Math.ceil(scoreBeats(score) / bar);
  const dynamics = useMemo(() => dynamicsOf(score), [score]);
  const pedals = useMemo(() => allPedals(score), [score]);

  useEffect(() => {
    const [outer, inner, flag] = [frame.current, strip.current, keyFlag.current];
    if (outer === null || inner === null) return;
    let shown = NaN;
    let shownKey = "";
    let request = requestAnimationFrame(function follow() {
      const beats = timingOf(score).beats(cursor());
      const offset = outer.clientWidth * LINE_SHARE - beats * scale;
      if (offset !== shown) {
        shown = offset;
        inner.style.transform = `translate3d(${String(offset)}px, 0, 0)`;
      }
      if (analysis !== undefined && flag !== null) {
        const key = keyAt(analysis, score, beats).key;
        if (key !== shownKey) {
          shownKey = key;
          flag.textContent = printed(key);
        }
      }
      request = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(request);
  }, [score, analysis, scale]);

  const place = (beats: number): string => `${String(beats * scale)}px`;
  const chords = analysis?.chords ?? [];

  return (
    <div ref={frame} aria-label="Harmony" className="relative h-[66px] shrink-0 overflow-hidden border-b border-border-default bg-surface-primary text-text-primary select-none max-md:pointer-events-none max-md:h-12">
      <div ref={strip} className="absolute inset-y-0 left-0 will-change-transform">
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className="absolute top-0 h-full border-l border-border-hover pl-0.5 text-[10px] leading-3 text-text-muted" style={{ left: place(index * bar) }}>
            {index + 1}
          </span>
        ))}
        {dynamics.map((mark) => (
          <button
            key={`${mark.text}${String(mark.bar)}`}
            type="button"
            title={mark.about}
            onPointerEnter={() => onDetail(mark.about)}
            onClick={() => onDetail(mark.about)}
            className="absolute top-0 font-serif text-[11px] leading-3 text-text-secondary italic max-md:hidden"
            style={{ left: `${String((mark.bar - 1) * bar * scale + BAR_NUMBER_ROOM)}px` }}
          >
            {mark.text}
          </button>
        ))}
        {(analysis?.tempo ?? []).map((mark) => {
          const about = `Bars ${String(mark.bars[0])} to ${String(mark.bars[1])}: ${mark.mark}${mark.about === undefined ? "" : `. ${mark.about}`}`;
          return (
            <button
              key={`${mark.mark}${String(mark.bars[0])}`}
              type="button"
              title={about}
              onPointerEnter={() => onDetail(about)}
              onClick={() => onDetail(about)}
              className="absolute top-0 rounded-sm px-0.5 text-[10px] leading-3 font-semibold text-brand-green max-md:hidden"
              style={{ left: `${String((mark.bars[0] - 1) * bar * scale + DYNAMIC_ROOM)}px` }}
            >
              {mark.mark}
            </button>
          );
        })}
        {chords.map((chord, index) => {
          const from = beatsAt(score, chord);
          const next = chords.at(index + 1);
          const to = next === undefined ? total * bar : beatsAt(score, next);
          const about = chordAbout(chord, analysis === undefined ? "" : keyAt(analysis, score, from).key);
          return (
            <button
              key={`${String(chord.bar)}.${String(chord.beat)}`}
              type="button"
              title={about}
              onPointerEnter={() => onDetail(about)}
              onClick={() => onDetail(about)}
              className="absolute top-3 flex h-[34px] flex-col items-start justify-center overflow-hidden border-l-2 border-text-muted px-1 text-left whitespace-nowrap"
              style={{ left: place(from), width: place(to - from) }}
            >
              <span className="text-[13px] leading-4 font-semibold">
                {printed(chord.symbol)}
                {chord.ambiguous === true && <span className="text-text-muted">?</span>}
              </span>
              <span className="font-serif text-[12px] leading-[14px] text-brand-orange">{chord.roman === null ? "·" : printed(chord.roman)}</span>
              {chord.cadence !== undefined && <span className="absolute right-0.5 bottom-0 text-[9px] leading-3 font-bold text-brand-pink">{chord.cadence}</span>}
            </button>
          );
        })}
        {(analysis?.keys ?? []).slice(1).map((area) => {
          const about = `Bar ${String(area.bar)}: to ${printed(area.key)}, ${area.how ?? "direct"}${area.about === undefined ? "" : `. ${area.about}`}`;
          return (
            <button
              key={`${area.key}${String(area.bar)}`}
              type="button"
              title={about}
              onPointerEnter={() => onDetail(about)}
              onClick={() => onDetail(about)}
              className="absolute top-3 z-10 h-[15px] -translate-x-full rounded-l-sm bg-brand-blue px-1 text-[10px] leading-[15px] font-bold whitespace-nowrap text-surface-primary"
              style={{ left: place(beatsAt(score, area)) }}
            >
              {printed(area.key)}
            </button>
          );
        })}
        <TempoCurve score={score} scale={scale} total={scoreBeats(score)} />
        {pedals.map((pedal) => (
          <span key={`${String(pedal.start)}:${String(pedal.end)}`} title="Pedal down" className="absolute bottom-0 h-0.5 rounded-sm bg-text-secondary max-md:hidden" style={{ left: place(pedal.start), width: place(pedal.end - pedal.start - 1 / scale) }} />
        ))}
        {picked?.spans.map((span) => (
          <button
            key={`${String(span.from)}${span.about}`}
            type="button"
            title={span.about}
            onPointerEnter={() => onDetail(span.about)}
            onClick={() => onDetail(span.about)}
            className="absolute top-[48px] h-[14px] overflow-hidden rounded-sm px-1 text-left text-[10px] leading-[14px] font-bold whitespace-nowrap text-surface-primary"
            style={{ left: place(span.from), width: place(span.to - span.from), background: `var(${toneVar(picked.tone)})` }}
          >
            {span.mark}
          </button>
        ))}
      </div>
      <div className="absolute inset-y-0 w-0.5 bg-brand-orange opacity-70" style={{ left: `${String(LINE_SHARE * 100)}%` }} />
      {analysis !== undefined && (
        <span ref={keyFlag} title="Key here" className="absolute top-0 left-0 z-10 rounded-br-sm bg-surface-elevated px-1.5 text-[11px] leading-4 font-bold text-brand-blue" />
      )}
    </div>
  );
}
