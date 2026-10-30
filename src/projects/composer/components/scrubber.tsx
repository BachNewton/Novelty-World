"use client";

import { useEffect, useMemo, useRef } from "react";
import { toneVar, type Analysis, type Feature, type Section, type Span } from "../analysis";
import { cursor, seek } from "../player";
import type { Timing } from "../tempo";

// The piece's form along the scrubber: a block per section, the same colour for
// A and A′ so the form shows at a glance, marks for movements above and, under
// them, where the picked theme comes. Follows the piece on animation frames,
// written straight to the elements so a playing piece doesn't re-render the
// page sixty times a second.

function formBase(letter: string): string {
  return letter.replace(/[′″‴\d]/g, "");
}

function sectionTones(sections: readonly Section[]): Map<string, number> {
  const tones = new Map<string, number>();
  for (const { letter } of sections) {
    const base = formBase(letter);
    if (!tones.has(base)) tones.set(base, tones.size * 3 + 1);
  }
  return tones;
}

function spanAbout({ name, bars, about }: Span): string {
  return `${name}, bars ${String(bars[0])} to ${String(bars[1])}${about === undefined ? "" : `. ${about}`}`;
}

interface ScrubberProps {
  seconds: number;
  barLength: number;
  time: Timing;
  analysis: Analysis | undefined;
  picked: Feature | null;
  onSection: (section: Section | undefined) => void;
  onDetail: (text: string) => void;
}

export function Scrubber({ seconds, barLength, time, analysis, picked, onSection, onDetail }: ScrubberProps) {
  const input = useRef<HTMLInputElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const sections = useMemo(() => analysis?.sections ?? [], [analysis]);
  const tones = useMemo(() => sectionTones(sections), [sections]);

  useEffect(() => {
    const element = input.current;
    if (element === null) return;
    let shown: Section | undefined;
    let first = true;
    let frame = requestAnimationFrame(function follow() {
      const now = cursor();
      element.value = String(now);
      if (line.current !== null) line.current.style.left = `${String((now / seconds) * 100)}%`;
      const beats = time.beats(now);
      const section = sections.find(({ bars }) => beats < bars[1] * barLength);
      if (first || section !== shown) {
        first = false;
        shown = section;
        onSection(section);
      }
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [sections, seconds, barLength, time, onSection]);

  const share = (at: number): string => `${String((at / seconds) * 100)}%`;
  const barStart = (bar: number): number => time.seconds((bar - 1) * barLength);
  const blockStyle = ({ bars }: Span) => ({ left: share(barStart(bars[0])), width: share(barStart(bars[1] + 1) - barStart(bars[0])) });

  return (
    <div className="shrink-0 bg-surface-primary px-1 pb-1">
      {analysis !== undefined && (
        <div className="relative select-none">
          {analysis.movements !== undefined && (
            <div className="relative h-3.5 max-md:hidden">
              {analysis.movements.map((movement) => (
                <button
                  key={movement.name}
                  type="button"
                  title={spanAbout(movement)}
                  onPointerEnter={() => onDetail(spanAbout(movement))}
                  onClick={() => {
                    seek(barStart(movement.bars[0]));
                    onDetail(spanAbout(movement));
                  }}
                  className="absolute top-0 h-3.5 truncate border-l border-text-primary pl-0.5 text-left text-[10px] leading-3 text-text-secondary"
                  style={blockStyle(movement)}
                >
                  {movement.name}
                </button>
              ))}
            </div>
          )}
          <div className="relative h-6 overflow-hidden rounded-sm">
            {sections.map((section) => (
              <button
                key={section.bars[0]}
                type="button"
                title={spanAbout(section)}
                onPointerEnter={() => onDetail(spanAbout(section))}
                onClick={() => {
                  seek(barStart(section.bars[0]));
                  onDetail(spanAbout(section));
                }}
                className="absolute inset-y-0 truncate border-r border-surface-primary px-0.5 text-left text-[11px] font-bold text-text-primary"
                style={{ ...blockStyle(section), background: `color-mix(in srgb, var(${toneVar(tones.get(formBase(section.letter)) ?? 1)}) 45%, var(--color-surface-primary))` }}
              >
                {section.letter}
                {section.name !== section.letter && <span className="pl-1 font-normal">{section.name}</span>}
              </button>
            ))}
          </div>
          <div className="relative h-1.5 max-md:hidden">
            {picked?.spans.map((span) => (
              <button
                key={`${String(span.from)}${span.about}`}
                type="button"
                title={span.about}
                aria-label={span.about}
                onClick={() => {
                  seek(time.seconds(span.from));
                  onDetail(span.about);
                }}
                className="absolute inset-y-0 min-w-0.5"
                style={{ left: share(time.seconds(span.from)), width: share(time.seconds(span.to) - time.seconds(span.from)), background: `var(${toneVar(picked.tone)})` }}
              />
            ))}
          </div>
          <div ref={line} className="pointer-events-none absolute inset-y-0 w-0.5 bg-text-primary" />
        </div>
      )}
      <input
        ref={input}
        type="range"
        aria-label="Position in the piece"
        min={0}
        max={seconds}
        step={0.01}
        defaultValue={0}
        onInput={(event) => seek(Number(event.currentTarget.value))}
        className="block h-4 w-full accent-brand-orange"
      />
    </div>
  );
}
