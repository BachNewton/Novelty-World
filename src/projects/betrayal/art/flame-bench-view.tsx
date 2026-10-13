"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { BETRAYAL_THEME } from "../components/theme";
import { CAMERAS, createFlameBench, FLAME_NAMES, SPEEDS } from "./flame-bench";
import { FLAME_PRESETS } from "./kit/flame";

const PANEL = "pointer-events-auto rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm";

/** The flame bench (`?bench=flames`): the kit's shader flames beside today's diamonds, lit by their own baked lights. */
export function FlameBenchView() {
  const [bench] = useState(createFlameBench);
  const state = useSyncExternalStore(bench.subscribe, bench.snapshot, bench.snapshot);
  const containerRef = useThreeScene(bench.mount, { antialias: false, maxPixelRatio: 4 });

  return (
    <div style={BETRAYAL_THEME} className="fixed inset-0 bg-(--bt-bg) text-(--bt-ink)">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute top-0 left-0 flex max-h-full w-80 max-w-[calc(100%-1.5rem)] flex-col gap-2 overflow-y-auto p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-(--bt-danger) px-2 text-xs font-semibold tracking-wide text-(--bt-danger) uppercase">Flame bench</span>
          <a href="?bench=props" className={PANEL}>
            Other benches
          </a>
          {state.baking && <span className={`${PANEL} text-(--bt-muted)`}>Baking…</span>}
        </div>
        <div className={`${PANEL} flex flex-wrap gap-1`}>
          <span className="w-full text-(--bt-muted)">Camera</span>
          {CAMERAS.map((camera) => (
            <Toggle key={camera.id} on={state.camera === camera.id} onClick={() => bench.api.setCamera(camera.id)}>
              {camera.label}
            </Toggle>
          ))}
        </div>
        <div className={`${PANEL} flex flex-wrap gap-1`}>
          <span className="w-full text-(--bt-muted)">Centre on</span>
          <Toggle on={state.focus === null} onClick={() => bench.api.setFocus(null)}>
            All
          </Toggle>
          {FLAME_NAMES.map((name) => (
            <Toggle key={name} on={state.focus === name} onClick={() => bench.api.setFocus(name)}>
              {FLAME_PRESETS[name].label}
            </Toggle>
          ))}
        </div>
        <div className={`${PANEL} flex flex-wrap gap-1`}>
          <span className="w-full text-(--bt-muted)">Clock</span>
          <Toggle on={state.frozenAt !== null} onClick={() => bench.api.freezeClock(state.frozenAt === null ? 2 : null)}>
            {state.frozenAt === null ? "Running" : "Frozen"}
          </Toggle>
          {SPEEDS.map((speed) => (
            <Toggle key={speed} on={state.speed === speed} onClick={() => bench.api.setSpeed(speed)}>
              ×{speed}
            </Toggle>
          ))}
        </div>
        <label className={`${PANEL} flex flex-col gap-1`}>
          <span className="flex items-center gap-2">
            <span className="text-(--bt-muted)">Flicker</span>
            <Toggle on={state.held !== null} onClick={() => bench.api.holdFlicker(state.held === null ? 0 : null)}>
              {state.held === null ? "Live" : `Held at ${state.held.toFixed(2)}`}
            </Toggle>
          </span>
          {state.held !== null && (
            <input type="range" min={-1} max={1} step={0.05} value={state.held} onChange={(event) => bench.api.holdFlicker(Number(event.target.value))} />
          )}
          <span className="text-xs text-(--bt-muted)">Held, the flames and their light stand at one flicker while the flames&apos; noise runs on.</span>
        </label>
        <div className={`${PANEL} flex flex-wrap gap-1`}>
          <Toggle on={state.diamonds} onClick={() => bench.api.setDiamonds(!state.diamonds)}>
            {state.diamonds ? "Today's diamonds: shown (left of each)" : "Today's diamonds: hidden"}
          </Toggle>
        </div>
        <span className="text-xs text-(--bt-muted)">Drag to orbit, right-drag to pan, wheel to zoom.</span>
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
