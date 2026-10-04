"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { BETRAYAL_THEME } from "../components/theme";
import { createBench } from "./bench";
import { BENCH_ROOMS } from "./rooms";
import { roomTile } from "./stage";

/** The art bench (`?bench=<room-id>`): one room, full screen, to judge its art. */
export function ArtBench({ room }: { room: string }) {
  const [bench] = useState(() => createBench(room));
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
            onChange={(event) => bench.api.setRoom(event.target.value)}
          >
            {BENCH_ROOMS.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {roomTile(definition.id).name}
              </option>
            ))}
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
        <button
          type="button"
          onClick={() => bench.api.setCamera(state.camera === "free" ? "dollhouse" : "free")}
          className="pointer-events-auto rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm"
        >
          {state.camera === "free" ? "Free camera: on" : "Free camera: off"}
        </button>
        <span className="rounded border border-(--bt-danger) px-2 text-xs font-semibold tracking-wide text-(--bt-danger) uppercase">
          Art bench
        </span>
      </div>
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

function BenchButton({
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
