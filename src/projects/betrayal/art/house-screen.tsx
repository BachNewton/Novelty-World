"use client";

import { useState, useSyncExternalStore } from "react";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { BETRAYAL_THEME } from "../components/theme";
import { FLOOR_NAMES } from "../engine/board";
import { BenchButton } from "./bench-view";
import { createHouseView, type FloorChoice } from "./house-view";

/** The house view prototype (`?house`): a whole house of rooms, full screen. */
export function HouseScreen() {
  const [view] = useState(() => createHouseView());
  const state = useSyncExternalStore(view.subscribe, view.snapshot, view.snapshot);
  const containerRef = useThreeScene(view.mount, {
    antialias: false,
    maxPixelRatio: 4,
    stats: true,
    statsCorner: "top-right",
  });
  const zoomIndex = view.zooms.indexOf(state.zoom);
  const floors: FloorChoice[] = [...view.floors, "all"];
  const rooms = state.floor === "all" ? [] : view.api.rooms(state.floor);

  return (
    <div style={BETRAYAL_THEME} className="fixed inset-0 bg-(--bt-bg) text-(--bt-ink)">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-3 pr-24">
        {floors.map((floor) => (
          <button
            key={floor}
            type="button"
            onClick={() => view.api.setFloor(floor)}
            className={`pointer-events-auto rounded border px-2 py-1 text-sm ${state.floor === floor ? "border-(--bt-accent) bg-(--bt-room)" : "border-(--bt-line) bg-(--bt-panel)"}`}
          >
            {floor === "all" ? "All floors" : FLOOR_NAMES[floor]}
          </button>
        ))}
        <label className="pointer-events-auto flex items-center gap-2 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm">
          <span className="text-(--bt-muted)">Room</span>
          <select
            className="bg-(--bt-panel) text-(--bt-ink)"
            value={state.focus ?? ""}
            disabled={rooms.length === 0}
            onChange={(event) => view.api.setFocus(event.target.value || null)}
          >
            <option value="">Whole floor</option>
            {rooms.map((id) => (
              <option key={id} value={id}>
                {view.roomName(id)}
              </option>
            ))}
          </select>
        </label>
        <label className="pointer-events-auto flex items-center gap-2 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm">
          <span className="text-(--bt-muted)">Resolution</span>
          <select
            className="bg-(--bt-panel) text-(--bt-ink)"
            value={state.resolution ?? "native"}
            onChange={(event) => view.api.setResolution(event.target.value === "native" ? null : Number(event.target.value))}
          >
            {view.resolutions.map((resolution) => (
              <option key={resolution ?? "native"} value={resolution ?? "native"}>
                {resolution === null ? "Native" : `${resolution}p`}
              </option>
            ))}
          </select>
        </label>
        <span className="rounded border border-(--bt-danger) px-2 text-xs font-semibold tracking-wide text-(--bt-danger) uppercase">
          House prototype
        </span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <BenchButton label="Orbit left" onClick={() => view.api.setView(state.view - 1)}>
          ⟲
        </BenchButton>
        <BenchButton label="Zoom out" disabled={zoomIndex <= 0} onClick={() => view.api.setZoom(view.zooms[zoomIndex - 1])}>
          −
        </BenchButton>
        <BenchButton label="Zoom in" disabled={zoomIndex >= view.zooms.length - 1} onClick={() => view.api.setZoom(view.zooms[zoomIndex + 1])}>
          +
        </BenchButton>
        <BenchButton label="Orbit right" onClick={() => view.api.setView(state.view + 1)}>
          ⟳
        </BenchButton>
      </div>
    </div>
  );
}
