"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { BETRAYAL_THEME } from "../components/theme";
import { CATALOG } from "../data";
import { CAMERA_LABELS, CAMERAS, createItemBench, HOLDERS } from "./item-bench";

const PANEL = "pointer-events-auto rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm";
const SELECT = "bg-(--bt-panel) text-(--bt-ink)";

/** The item bench (`?bench=items`): every item model, held and on its plate, under a room's light. */
export function ItemBenchView() {
  const [bench] = useState(() => createItemBench(window.location.search));
  const state = useSyncExternalStore(bench.subscribe, bench.snapshot, bench.snapshot);
  const containerRef = useThreeScene(bench.mount, { antialias: false, maxPixelRatio: 4 });

  return (
    <div style={BETRAYAL_THEME} className="fixed inset-0 bg-(--bt-bg) text-(--bt-ink)">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute top-0 left-0 flex max-h-full w-80 max-w-[calc(100%-1.5rem)] flex-col gap-2 overflow-y-auto p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-(--bt-danger) px-2 text-xs font-semibold tracking-wide text-(--bt-danger) uppercase">Item bench</span>
          <a href="?bench=figures" className={PANEL}>
            Figure viewer
          </a>
          {state.building && <span className={`${PANEL} text-(--bt-muted)`}>Building…</span>}
        </div>
        <label className={`${PANEL} flex items-center gap-2`}>
          <span className="text-(--bt-muted)">Frame</span>
          <select className={SELECT} value={state.focus ?? ""} onChange={(event) => bench.api.setFocus(event.target.value === "" ? null : event.target.value)}>
            <option value="">Every item</option>
            {state.items.map((item) => (
              <option key={item} value={item}>
                {CATALOG.cards[item].name}
              </option>
            ))}
          </select>
        </label>
        {state.focus !== null && (
          <div className={`${PANEL} flex flex-wrap gap-1`}>
            {CAMERAS.filter((camera) => camera !== "all").map((camera) => (
              <Toggle key={camera} on={state.camera === camera} onClick={() => bench.api.setCamera(camera)}>
                {CAMERA_LABELS[camera]}
              </Toggle>
            ))}
          </div>
        )}
        <label className={`${PANEL} flex items-center gap-2`}>
          <span className="text-(--bt-muted)">Held by</span>
          <select className={SELECT} value={state.explorer} onChange={(event) => bench.api.setExplorer(event.target.value)}>
            {HOLDERS.map((holder) => (
              <option key={holder.id} value={holder.id}>
                {holder.name}
              </option>
            ))}
          </select>
        </label>
        <div className={`${PANEL} flex flex-wrap gap-1`}>
          <Toggle on={state.active} onClick={() => bench.api.setActive(!state.active)}>
            {state.active ? "Explorer's light: on" : "Explorer's light: off"}
          </Toggle>
        </div>
        <span className="text-xs text-(--bt-muted)">Lit by the {state.room}&apos;s light at its prime place. Drag to orbit, right-drag to pan, wheel to zoom.</span>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-xs ${on ? "border-(--bt-door) text-(--bt-door)" : "border-(--bt-line)"}`}
    >
      {children}
    </button>
  );
}
