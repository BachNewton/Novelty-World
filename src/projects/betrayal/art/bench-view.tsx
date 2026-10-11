"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { BETRAYAL_THEME } from "../components/theme";
import { createBench } from "./bench";
import { BENCH_EXPLORERS } from "./explorers";
import { PathLegendPanel } from "./path-legend";
import { BENCH_ROOMS } from "./rooms";
import { roomTile } from "./stage";
import { PLACEMENT_PRESETS } from "./placement-bench";
import { GALLERY_ROOMS, sourceLabel } from "./props-gallery";
import { createPropsGallery, RESOLUTIONS } from "./props-gallery-scene";
import { FigureViewer } from "./figure-viewer-view";

/** The bench's id for the props gallery, in place of a room's. */
const PROPS_BENCH = "props";
/** The bench's id for the figure viewer, in place of a room's. */
const FIGURES_BENCH = "figures";

/** The art bench (`?bench=<room-id>`, optionally `&explorer=<id>`,
 *  `&frame=explorer` and `&paths`): one room, full screen, to judge its art.
 *  `?bench=props` opens the props gallery instead (`&show=kit|duplicates|<room-id>`, `&q=<search>`), and
 *  `?bench=figures` the figure viewer (see `figure-viewer.ts`). */
export function ArtBench(props: { room: string; explorer: string | null; frame: string | null; paths: boolean }) {
  if (props.room === FIGURES_BENCH) return <FigureViewer />;
  return props.room === PROPS_BENCH ? <PropsGallery /> : <RoomBench {...props} />;
}

function RoomBench({
  room,
  explorer,
  frame,
  paths,
}: {
  room: string;
  explorer: string | null;
  frame: string | null;
  paths: boolean;
}) {
  const [bench] = useState(() => createBench(room, explorer, frame, paths));
  const state = useSyncExternalStore(bench.subscribe, bench.snapshot, bench.snapshot);
  const containerRef = useThreeScene(bench.mount, { antialias: false, maxPixelRatio: 4 });
  const zoomIndex = bench.zooms.indexOf(state.zoom);

  return (
    <div style={BETRAYAL_THEME} className="fixed inset-0 bg-(--bt-bg) text-(--bt-ink)">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-3">
        <label className="pointer-events-auto flex items-center gap-2 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm">
          <span className="text-(--bt-muted)">Room</span>
          <select
            className="bg-(--bt-panel) text-(--bt-ink)"
            value={state.roomId}
            onChange={(event) => {
              if (event.target.value === PROPS_BENCH || event.target.value === FIGURES_BENCH) window.location.search = `?bench=${event.target.value}`;
              else bench.api.setRoom(event.target.value);
            }}
          >
            {BENCH_ROOMS.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {roomTile(definition.id).name}
              </option>
            ))}
            <option value={PROPS_BENCH}>All props (gallery)</option>
            <option value={FIGURES_BENCH}>Figure viewer</option>
          </select>
        </label>
        <label className="pointer-events-auto flex items-center gap-2 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm">
          <span className="text-(--bt-muted)">Resolution</span>
          <select
            className="bg-(--bt-panel) text-(--bt-ink)"
            value={state.resolution ?? "native"}
            onChange={(event) =>
              bench.api.setResolution(event.target.value === "native" ? null : Number(event.target.value))
            }
          >
            {bench.resolutions.map((resolution) => (
              <option key={resolution ?? "native"} value={resolution ?? "native"}>
                {resolution === null ? "Native" : `${resolution}p`}
              </option>
            ))}
          </select>
        </label>
        <label className="pointer-events-auto flex items-center gap-2 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm">
          <span className="text-(--bt-muted)">Explorer</span>
          <select
            className="bg-(--bt-panel) text-(--bt-ink)"
            value={state.explorer}
            onChange={(event) => bench.api.setExplorer(event.target.value)}
          >
            {[...BENCH_EXPLORERS, ...PLACEMENT_PRESETS].map((figure) => (
              <option key={figure.id} value={figure.id}>
                {figure.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => bench.api.setSubject(state.subject === "explorer" ? "room" : "explorer")}
          className="pointer-events-auto rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm"
        >
          {state.subject === "explorer" ? "Framing: explorer" : "Framing: room"}
        </button>
        <button
          type="button"
          aria-pressed={state.paths}
          onClick={() => bench.api.setPaths(!state.paths)}
          className="pointer-events-auto rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm"
        >
          {state.paths ? "Paths: on" : "Paths: off"}
        </button>
        <span className="rounded border border-(--bt-danger) px-2 text-xs font-semibold tracking-wide text-(--bt-danger) uppercase">
          Art bench
        </span>
      </div>
      {state.pathLegend && <PathLegendPanel legend={state.pathLegend} />}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <BenchButton label="Orbit left" onClick={() => bench.api.setView(state.view - 1)}>
          ⟲
        </BenchButton>
        <BenchButton label="Zoom out" disabled={zoomIndex <= 0} onClick={() => bench.api.setZoom(bench.zooms[zoomIndex - 1])}>
          −
        </BenchButton>
        <BenchButton
          label="Zoom in"
          disabled={zoomIndex >= bench.zooms.length - 1}
          onClick={() => bench.api.setZoom(bench.zooms[zoomIndex + 1])}
        >
          +
        </BenchButton>
        <BenchButton label="Orbit right" onClick={() => bench.api.setView(state.view + 1)}>
          ⟳
        </BenchButton>
      </div>
    </div>
  );
}

export function BenchButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="pointer-events-auto h-12 w-12 rounded border border-(--bt-line) bg-(--bt-panel) text-xl text-(--bt-ink) disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Every kit piece and every room's props on one floor (`?bench=props`), to
 *  judge them side by side and find the ones built twice. */
function PropsGallery() {
  const [gallery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return createPropsGallery(params.get("show") ?? "all", params.get("q") ?? "");
  });
  const state = useSyncExternalStore(gallery.subscribe, gallery.snapshot, gallery.snapshot);
  const containerRef = useThreeScene(gallery.mount, { antialias: false, maxPixelRatio: 4 });
  const panel = "pointer-events-auto flex items-center gap-2 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm";

  return (
    <div style={BETRAYAL_THEME} className="fixed inset-0 bg-(--bt-bg) text-(--bt-ink)">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-3">
        <label className={panel}>
          <span className="text-(--bt-muted)">Show</span>
          <select
            className="max-w-48 bg-(--bt-panel) text-(--bt-ink)"
            value={state.show}
            onChange={(event) => gallery.api.setShow(event.target.value)}
          >
            <option value="all">All</option>
            <option value="kit">Kit only</option>
            <option value="duplicates">
              {state.duplicates === null ? "Possible duplicates (building…)" : `Possible duplicates (${state.duplicates.length})`}
            </option>
            {GALLERY_ROOMS.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {sourceLabel({ kind: "room", id: definition.id, index: 0 })}
              </option>
            ))}
          </select>
        </label>
        <label className={panel}>
          <span className="text-(--bt-muted)">Search</span>
          <input
            type="search"
            className="w-32 bg-(--bt-panel) text-(--bt-ink)"
            value={state.search}
            placeholder="name or room"
            onChange={(event) => gallery.api.setSearch(event.target.value)}
          />
        </label>
        <label className={panel}>
          <span className="text-(--bt-muted)">Resolution</span>
          <select
            className="bg-(--bt-panel) text-(--bt-ink)"
            value={state.resolution ?? "native"}
            onChange={(event) => gallery.api.setResolution(event.target.value === "native" ? null : Number(event.target.value))}
          >
            {RESOLUTIONS.map((resolution) => (
              <option key={resolution ?? "native"} value={resolution ?? "native"}>
                {resolution === null ? "Native" : `${resolution}p`}
              </option>
            ))}
          </select>
        </label>
        <span className={panel}>
          {state.built < state.total ? `Building ${state.built}/${state.total}` : `${state.shown} of ${state.total} pieces`}
        </span>
        <a href={`?bench=${BENCH_ROOMS[0].id}`} className={panel}>
          Room bench
        </a>
        <span className="rounded border border-(--bt-danger) px-2 text-xs font-semibold tracking-wide text-(--bt-danger) uppercase">
          Props gallery
        </span>
      </div>
      {state.show === "duplicates" && (
        <p className="pointer-events-none absolute inset-x-3 top-28 mx-auto w-fit rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-xs text-(--bt-muted) md:top-14">
          Possible duplicates: pieces from different places whose names end in the same word and whose sizes are within a third of each other, but
          whose geometry differs.
        </p>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {state.focused && (
          <span className="rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm">
            {state.focused.place + 1}/{state.shown}: {state.focused.name}, <span className="text-(--bt-muted)">{state.focused.source}</span>
          </span>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <BenchButton label="Previous piece ([)" onClick={() => gallery.api.step(-1)}>
            ‹
          </BenchButton>
          <BenchButton label="Orbit left" onClick={() => gallery.api.orbit(-1)}>
            ⟲
          </BenchButton>
          <BenchButton label="Zoom out" onClick={() => gallery.api.zoom(1 / 1.5)}>
            −
          </BenchButton>
          <BenchButton label="Frame the first rows (f)" onClick={() => gallery.api.frameAll()}>
            ⤢
          </BenchButton>
          <BenchButton label="Zoom in" onClick={() => gallery.api.zoom(1.5)}>
            +
          </BenchButton>
          <BenchButton label="Orbit right" onClick={() => gallery.api.orbit(1)}>
            ⟳
          </BenchButton>
          <BenchButton label="Next piece (])" onClick={() => gallery.api.step(1)}>
            ›
          </BenchButton>
        </div>
      </div>
    </div>
  );
}
