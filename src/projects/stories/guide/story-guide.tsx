"use client";

import { Minus, Plus } from "lucide-react";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StoryWorld } from "../tools/story-world";
import { DetailPanel } from "./detail-panel";
import { BornMark, ChapterMark, DiedMark, KIND_NAMES, KindMark } from "./marks";
import { selectionOf, type Selection } from "./selection";
import { themeStyle, type StoryTheme } from "./story-theme";
import { Timeline, type ZoomControls } from "./timeline";
import { timelineItems, yearOf, type Mark } from "./timeline-layout";

/** Where a selection sits in time: an event's date, a chapter's middle, a person's birth or first appearance. A place has no one date. */
function centreOf(world: StoryWorld, selection: Selection): { key: string; year: number } | null {
  const key = JSON.stringify(selection);
  switch (selection.type) {
    case "event":
      return { key, year: yearOf(world.events[selection.id].date) };
    case "chapter": {
      const chapter = world.chapters[selection.index];
      return { key, year: (yearOf(chapter.from) + yearOf(chapter.to)) / 2 };
    }
    case "person": {
      const born = world.people[selection.id].born;
      if (born !== undefined) return { key, year: yearOf(born) };
      const years = Object.values(world.events)
        .filter((event) => event.who?.includes(selection.id) === true)
        .map((event) => yearOf(event.date));
      return years.length === 0 ? null : { key, year: Math.min(...years) };
    }
    case "place":
      return null;
  }
}

interface Props {
  title: string;
  world: StoryWorld;
  theme: StoryTheme;
  cover: StaticImageData;
}

/** A guide to one story's world: its whole span on one zoomable timeline, and the details of whatever is picked. */
export function StoryGuide({ title, world, theme, cover }: Props) {
  const items = useMemo(() => timelineItems(world), [world]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [zoom, setZoom] = useState<ZoomControls | null>(null);
  const pick = useCallback((mark: Mark) => setSelection(selectionOf(mark)), []);
  const focus = selection?.type === "person" ? selection.id : null;
  const centre = useMemo(() => (selection === null ? null : centreOf(world, selection)), [world, selection]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "Escape") setSelection(null);
      if (event.key === "+" || event.key === "=") zoom?.step(1);
      if (event.key === "-") zoom?.step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const open = selection !== null;
  // The page keeps its own place when the timeline grows or shrinks under a zoom, so the
  // browser's scroll anchoring stays out of it.
  return (
    <div className={`min-h-screen bg-story-night text-story-ink [overflow-anchor:none] ${theme.className}`} style={themeStyle(theme)}>
      <div className={open ? "lg:pr-[400px]" : ""}>
        <header className="flex items-center gap-4 px-4 pt-6 pb-4 sm:px-8">
          <Image src={cover} alt={`The cover of ${title}`} width={88} height={88} className="size-16 rounded-sm shadow-lg sm:size-22" priority />
          <div className="grid gap-1">
            <Link href="/" className="font-story-label text-xs uppercase tracking-widest text-story-ink-soft hover:text-story-ink">
              Novelty World
            </Link>
            <h1 className="font-story-display text-3xl leading-tight text-balance sm:text-4xl">{title}</h1>
          </div>
        </header>

        <div className="sticky top-0 z-10 border-b border-story-line bg-story-night/95 backdrop-blur">
          <div className="grid grid-cols-2 gap-4 px-4 py-2 sm:px-8">
            <div className="grid justify-items-end gap-1 text-right">
              <h2 className="font-story-label text-sm uppercase tracking-widest">The world</h2>
              <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs text-story-ink-soft">
                {(["real", "canon", "story"] as const).map((kind) => (
                  <span key={kind} className="inline-flex items-center gap-1.5">
                    <KindMark kind={kind} />
                    {KIND_NAMES[kind]}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-1">
              <h2 className="font-story-label text-sm uppercase tracking-widest">The people</h2>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-story-ink-soft">
                <span className="inline-flex items-center gap-1.5">
                  <ChapterMark />
                  Chapter
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BornMark />
                  Born
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <DiedMark />
                  Died
                </span>
              </div>
            </div>
          </div>
        </div>

        <main className="pb-32">
          <Timeline items={items} theme={theme} focus={focus} selection={selection} centre={centre} onPick={pick} zoom={setZoom} />
        </main>
      </div>

      {zoom !== null && (
        <div
          role="group"
          aria-label="Zoom"
          className={`fixed bottom-[calc(12px+env(safe-area-inset-bottom,0px))] z-20 flex w-[min(420px,calc(100vw-24px))] -translate-x-1/2 items-center gap-2 rounded-lg border border-story-line bg-story-night/95 px-3 py-2 shadow-xl backdrop-blur ${open ? "left-1/2 max-lg:hidden lg:left-[calc(50%-200px)]" : "left-1/2"}`}
        >
          <button type="button" onClick={() => zoom.step(-1)} aria-label="Zoom out" className="grid size-9 place-items-center rounded-md border border-story-line hover:border-story-ink-soft focus-visible:outline-2 focus-visible:outline-story-canon">
            <Minus className="size-4" />
          </button>
          <input
            type="range"
            min={0}
            max={1000}
            value={zoom.level}
            onChange={(event) => zoom.set(Number(event.target.value))}
            aria-label="Zoom level"
            className="min-w-0 flex-1 accent-story-chapter"
          />
          <button type="button" onClick={() => zoom.step(1)} aria-label="Zoom in" className="grid size-9 place-items-center rounded-md border border-story-line hover:border-story-ink-soft focus-visible:outline-2 focus-visible:outline-story-canon">
            <Plus className="size-4" />
          </button>
        </div>
      )}

      {selection !== null && (
        <aside
          aria-label="Details"
          className="fixed inset-x-0 bottom-0 z-30 max-h-[60vh] overflow-y-auto rounded-t-xl border-t border-story-line bg-story-night/97 pb-[env(safe-area-inset-bottom,0px)] shadow-2xl backdrop-blur lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[400px] lg:rounded-none lg:border-t-0 lg:border-l"
        >
          <DetailPanel world={world} selection={selection} onSelect={setSelection} onClose={() => setSelection(null)} />
        </aside>
      )}
    </div>
  );
}
