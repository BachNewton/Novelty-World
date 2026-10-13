"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { BETRAYAL_THEME } from "../components/theme";
import { BenchButton } from "./bench-view";
import { SHINES, type Shine } from "./shine";
import {
  BENCH_LIGHTS,
  createShineBench,
  NO_LAMP,
  swatchShine,
  TILTS,
  type ShineBench,
  type ShineBenchSnapshot,
  type ShineMark,
  type Swatch,
} from "./shine-bench";

const PANEL = "pointer-events-auto rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm";

const numbers = (shine: Shine | null) => (shine ? `r ${shine.roughness} · m ${shine.metalness} · refl ${shine.reflectance ?? 0.04}` : "matte");

/** The shine bench (`?bench=shine`): every floor and shiny shell surface of the built rooms, under a light to pick and move. */
export function ShineBenchView() {
  const [bench] = useState(createShineBench);
  const state = useSyncExternalStore(bench.subscribe, bench.snapshot, bench.snapshot);
  const containerRef = useThreeScene(bench.mount, { antialias: false, maxPixelRatio: 4 });
  const zoomIndex = bench.zooms.indexOf(state.zoom);
  const [open, setOpen] = useState(true);

  return (
    <div style={BETRAYAL_THEME} className="fixed inset-0 bg-(--bt-bg) text-(--bt-ink)">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute top-0 left-0 flex max-h-full w-80 max-w-[calc(100%-1.5rem)] flex-col gap-2 overflow-y-auto p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-(--bt-danger) px-2 text-xs font-semibold tracking-wide text-(--bt-danger) uppercase">Shine bench</span>
          <a href="?bench=props" className={PANEL}>
            Other benches
          </a>
          <span className={`${PANEL} text-(--bt-muted)`}>
            {state.baking ? "Baking…" : state.bakeMs === null ? "" : `Baked in ${Math.round(state.bakeMs)} ms`}
          </span>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={PANEL}>
            {open ? "Hide controls" : "Controls"}
          </button>
        </div>
        {open && <Controls bench={bench} state={state} />}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <BenchButton label="Orbit left" onClick={() => bench.api.setView(state.view - 1)}>
          ⟲
        </BenchButton>
        <BenchButton label="Zoom out" disabled={zoomIndex <= 0} onClick={() => bench.api.setZoom(bench.zooms[zoomIndex - 1])}>
          −
        </BenchButton>
        <BenchButton label="Zoom in" disabled={zoomIndex >= bench.zooms.length - 1} onClick={() => bench.api.setZoom(bench.zooms[zoomIndex + 1])}>
          +
        </BenchButton>
        <BenchButton label="Orbit right" onClick={() => bench.api.setView(state.view + 1)}>
          ⟳
        </BenchButton>
      </div>
    </div>
  );
}

function Controls({ bench, state }: { bench: ShineBench; state: ShineBenchSnapshot }) {
  return (
    <>
      <LightPanel bench={bench} state={state} />
      <div className={`${PANEL} flex flex-wrap gap-1`}>
        <span className="w-full text-(--bt-muted)">Camera</span>
        {TILTS.map((tilt) => (
          <Toggle key={tilt.label} on={state.tilt === tilt.degrees} onClick={() => bench.api.setTilt(tilt.degrees)}>
            {tilt.label} {tilt.degrees}°
          </Toggle>
        ))}
      </div>
      <div className={`${PANEL} flex flex-wrap gap-1`}>
        <Toggle on={state.shine} onClick={() => bench.api.setShine(!state.shine)}>
          {state.shine ? "Shine: on" : "Shine: off"}
        </Toggle>
        <Toggle on={state.frozen} onClick={() => bench.api.freezeClock(!state.frozen)}>
          {state.frozen ? "Flicker: frozen" : "Flicker: live"}
        </Toggle>
      </div>
      {state.selected !== null && <TunePanel bench={bench} state={state} swatch={bench.swatches[state.selected]} index={state.selected} />}
      <SwatchList bench={bench} state={state} />
    </>
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

/** A slider that shows its value as it moves and applies it when let go: each change re-bakes. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  const [moving, setMoving] = useState<number | null>(null);
  const shown = moving ?? value;
  const commit = () => {
    if (moving !== null) onCommit(moving);
    setMoving(null);
  };
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-20 text-(--bt-muted)">{label}</span>
      <input
        type="range"
        className="min-w-0 flex-1"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(event) => setMoving(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <span className="w-12 text-right tabular-nums">{shown}</span>
    </label>
  );
}

function LightPanel({ bench, state }: { bench: ShineBench; state: ShineBenchSnapshot }) {
  const [x, y, z] = state.at;
  const lamp = BENCH_LIGHTS.find((light) => light.id === state.light);
  return (
    <div className={`${PANEL} flex flex-col gap-1`}>
      <label className="flex items-center gap-2">
        <span className="text-(--bt-muted)">Light</span>
        <select className="flex-1 bg-(--bt-panel) text-(--bt-ink)" value={state.light} onChange={(event) => bench.api.setLight(event.target.value)}>
          {BENCH_LIGHTS.map((light) => (
            <option key={light.id} value={light.id}>
              {light.label}
            </option>
          ))}
          <option value={NO_LAMP}>No lamp</option>
        </select>
      </label>
      {lamp && (
        <span className="text-xs text-(--bt-muted)">
          {lamp.colour}, {lamp.intensity} cd, range {lamp.range} m{lamp.flicker > 0 ? `, flicker ${lamp.flicker}` : ""}
        </span>
      )}
      <Slider label="Across (x)" value={x} min={-3} max={3} step={0.05} onCommit={(value) => bench.api.setLightAt([value, y, z])} />
      <Slider label="Deep (z)" value={z} min={-3} max={3} step={0.05} onCommit={(value) => bench.api.setLightAt([x, y, value])} />
      <Slider label="Height" value={y} min={0.1} max={3} step={0.05} onCommit={(value) => bench.api.setLightAt([x, value, z])} />
      <span className="text-xs text-(--bt-muted)">Shift-click the floor to stand the light there.</span>
      <div className="flex flex-wrap gap-1">
        <Toggle on={state.moon} onClick={() => bench.api.setMoon(!state.moon)}>
          {state.moon ? "Moon: on (open sky)" : "Moon: off"}
        </Toggle>
        <Toggle on={state.explorerLight} onClick={() => bench.api.setExplorerLight(!state.explorerLight)}>
          {state.explorerLight ? "Explorer's light: on" : "Explorer's light: off"}
        </Toggle>
      </div>
    </div>
  );
}

/** Tries numbers on the selected swatch's mark, on every swatch that has it. */
function TunePanel({ bench, state, swatch, index }: { bench: ShineBench; state: ShineBenchSnapshot; swatch: Swatch; index: number }) {
  const own = swatch.mark === "none" ? null : SHINES[swatch.mark];
  const shine = swatchShine(swatch, state.overrides);
  const tried = swatch.mark in state.overrides;
  const set = (change: Partial<Shine>) => {
    if (!shine) return;
    bench.api.tune(swatch.mark, { ...shine, ...change });
  };
  return (
    <div className={`${PANEL} flex flex-col gap-1`}>
      <span>
        #{index + 1} {swatch.surface}: <b>{swatch.mark}</b>
      </span>
      <span className="text-xs text-(--bt-muted)">{swatch.rooms.join(", ")}</span>
      <span className="text-xs text-(--bt-muted)">Its own numbers: {numbers(own)}</span>
      {shine ? (
        <>
          <Slider label="Roughness" value={shine.roughness} min={0} max={1} step={0.01} onCommit={(value) => set({ roughness: value })} />
          <Slider label="Metalness" value={shine.metalness} min={0} max={1} step={0.01} onCommit={(value) => set({ metalness: value })} />
          <Slider label="Reflectance" value={shine.reflectance ?? 0.04} min={0} max={0.1} step={0.001} onCommit={(value) => set({ reflectance: value })} />
          <span className="text-xs text-(--bt-muted)">
            Applies to every swatch marked {swatch.mark}. Reflectance is how much it reflects head on: towards a grazing angle (a low camera, or a
            lamp low beside the surface) every non-metal reflects more, whatever its reflectance.
          </span>
        </>
      ) : (
        <button
          type="button"
          className="rounded border border-(--bt-line) px-2 py-0.5 text-xs"
          onClick={() => bench.api.tune(swatch.mark, { ...SHINES.floorSheen })}
        >
          Try floorSheen on every unmarked swatch
        </button>
      )}
      {tried && (
        <button type="button" className="rounded border border-(--bt-line) px-2 py-0.5 text-xs" onClick={() => bench.api.tune(swatch.mark, null)}>
          Put {swatch.mark}&apos;s own numbers back
        </button>
      )}
    </div>
  );
}

function SwatchList({ bench, state }: { bench: ShineBench; state: ShineBenchSnapshot }) {
  return (
    <ol className={`${PANEL} flex flex-col gap-0.5 text-xs`}>
      <li className="text-(--bt-muted)">Click a swatch, here or on the floor, to try its numbers.</li>
      {bench.swatches.map((swatch, index) => {
        const mark: ShineMark = swatch.mark;
        return (
          <li key={index}>
            <button
              type="button"
              onClick={() => bench.api.select(state.selected === index ? null : index)}
              className={`w-full rounded px-1 text-left ${state.selected === index ? "bg-(--bt-focus)" : ""}`}
            >
              <span className="tabular-nums">{index + 1}.</span> {swatch.surface !== "floor" && `${swatch.surface}, `}
              <span className={mark === "none" ? "text-(--bt-muted)" : "text-(--bt-door)"}>{mark}</span>
              {mark in state.overrides && " (trying)"} <span className="text-(--bt-muted)">· {numbers(swatchShine(swatch, state.overrides))}</span>
              <br />
              <span className="text-(--bt-muted)">{swatch.rooms.join(", ")}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
