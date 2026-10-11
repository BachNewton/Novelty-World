"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { BETRAYAL_THEME } from "../components/theme";
import { CLOTH_MODES } from "./explorers/cloth-sim";
import { FIGURE_STATES, STATE_LABELS } from "./figure-motion";
import {
  CAMERA_LABELS,
  CAMERAS,
  createFigureViewer,
  FRAME,
  HOLDINGS,
  LIGHT_LABELS,
  LIGHTS,
  LINE_UP_STATES,
  SPEEDS,
  VIEWER_FIGURES,
  type CameraPreset,
  type Holding,
  type LightPreset,
} from "./figure-viewer";
import { BENCH_ROOMS } from "./rooms";

const PANEL = "pointer-events-auto rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm";
const SELECT = "min-w-0 flex-1 bg-(--bt-panel) text-(--bt-ink)";

/** The figure viewer (`?bench=figures`): one figure or the line-up on a plain floor, every state, burst, light and
 *  camera a button, key or pad press away. */
export function FigureViewer() {
  const [viewer] = useState(() => createFigureViewer(window.location.search));
  const state = useSyncExternalStore(viewer.subscribe, viewer.snapshot, viewer.snapshot);
  const containerRef = useThreeScene(viewer.mount, { antialias: true, maxPixelRatio: 2 });
  // On a phone the controls start folded away, so the figure shows first.
  const [open, setOpen] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const { api } = viewer;
  const states = state.lineUp ? LINE_UP_STATES : FIGURE_STATES;
  const startSpeed = VIEWER_FIGURES.find((figure) => figure.id === state.figure)?.speed?.start;

  return (
    <div style={BETRAYAL_THEME} className="fixed inset-0 bg-(--bt-bg) text-(--bt-ink)">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-3">
        <div className="pointer-events-auto flex w-full items-center gap-1 sm:w-auto">
          <IconButton label="Previous figure ([, LB)" onClick={() => api.stepFigure(-1)} disabled={state.lineUp}>
            ‹
          </IconButton>
          <select
            aria-label="Figure"
            className={`${PANEL} h-10 min-w-0 flex-1 sm:w-64 sm:flex-none`}
            value={state.lineUp ? "" : state.figure}
            onChange={(event) => api.setFigure(event.target.value)}
          >
            {state.lineUp && <option value="">Every explorer, side by side</option>}
            {VIEWER_FIGURES.map((figure) => (
              <option key={figure.id} value={figure.id}>
                {figure.name}
              </option>
            ))}
          </select>
          <IconButton label="Next figure (], RB)" onClick={() => api.stepFigure(1)} disabled={state.lineUp}>
            ›
          </IconButton>
        </div>
        <Toggle on={state.lineUp} onClick={() => api.setLineUp(!state.lineUp)} label="Line-up (u, Menu)">
          Line-up
        </Toggle>
        {state.building && <span className={PANEL}>Building…</span>}
        <a href={`?bench=${BENCH_ROOMS[0].id}`} className={`${PANEL} hidden sm:inline`}>
          Room bench
        </a>
        <span className="hidden rounded border border-(--bt-danger) px-2 text-xs font-semibold tracking-wide text-(--bt-danger) uppercase sm:inline">
          Figure viewer
        </span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-stretch gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:inset-x-auto md:top-16 md:right-0 md:w-80 md:justify-end">
        <div className="flex justify-end">
          <button type="button" className={PANEL} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Hide controls" : "Controls"}
          </button>
        </div>
        {open && (
          <div className="pointer-events-auto flex max-h-[46vh] flex-col gap-3 overflow-y-auto rounded border border-(--bt-line) bg-(--bt-panel) p-3 text-sm md:max-h-none">
            <Section title="Playback">
              <div className="flex flex-wrap items-center gap-1">
                <IconButton label="Back one frame (,  D-pad left)" onClick={() => api.stepFrames(-1)}>
                  ⏮
                </IconButton>
                <IconButton label={state.paused ? "Play (space, A)" : "Pause (space, A)"} onClick={() => api.setPaused(!state.paused)}>
                  {state.paused ? "▶" : "⏸"}
                </IconButton>
                <IconButton label="Forward one frame (.  D-pad right)" onClick={() => api.stepFrames(1)}>
                  ⏭
                </IconButton>
                {SPEEDS.map((speed) => (
                  <Toggle key={speed} on={state.speed === speed} onClick={() => api.setSpeed(speed)} label={`Speed ${speed}× (v, B)`}>
                    {speed === 1 ? "1×" : speed === 0.5 ? "½×" : "¼×"}
                  </Toggle>
                ))}
              </div>
              {state.paused && (
                <p className="text-xs text-(--bt-muted)">
                  Paused at {state.clock.toFixed(3)} s (frame {Math.round(state.clock / FRAME)})
                </p>
              )}
            </Section>

            <Section title="Moving">
              <select aria-label="State (s, D-pad)" className={SELECT} value={state.state} onChange={(event) => api.setState(states[states.findIndex((one) => one === event.target.value)])}>
                {states.map((one) => (
                  <option key={one} value={one}>
                    {STATE_LABELS[one]}
                  </option>
                ))}
              </select>
            </Section>

            {state.stats.length > 0 && (
              <Section title="Speed (p)">
                <div className="flex flex-wrap gap-1">
                  <Toggle on={state.stat === null} onClick={() => api.setStat(null)} label={state.lineUp ? "Each explorer at their starting Speed" : "At the starting Speed"}>
                    {state.lineUp ? "Each one's start" : `Start (${String(startSpeed)})`}
                  </Toggle>
                  {state.stats.map((stat) => (
                    <Toggle key={stat} on={state.stat === stat} onClick={() => api.setStat(stat)} label={`Speed ${stat}`}>
                      {stat}
                    </Toggle>
                  ))}
                </div>
              </Section>
            )}

            {state.bursts.length > 0 && (
              <Section title="Idle bursts (1–9, X)">
                <div className="flex flex-wrap gap-1">
                  <Toggle on={state.burst === null} onClick={() => api.playBurst(null)} label="The seeded idle (0)">
                    Seeded idle
                  </Toggle>
                  {state.bursts.map(({ name }, i) => (
                    <Toggle key={name} on={state.burst === name} onClick={() => api.playBurst(name)} label={`Play ${name} now (${i + 1})`}>
                      {name}
                    </Toggle>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-(--bt-muted)">
                  <input type="checkbox" checked={state.loop} onChange={(event) => api.setLoop(event.target.checked)} />
                  Repeat the burst
                </label>
              </Section>
            )}

            <Section title="Light (l, View)">
              <select aria-label="Light" className={SELECT} value={state.light} onChange={(event) => api.setLight(LIGHTS[LIGHTS.indexOf(event.target.value as LightPreset)])}>
                {LIGHTS.map((light) => (
                  <option key={light} value={light}>
                    {LIGHT_LABELS[light]}
                  </option>
                ))}
              </select>
            </Section>

            <Section title="Camera (c, Y)">
              <div className="flex flex-wrap gap-1">
                {CAMERAS.map((camera: CameraPreset) => (
                  <Toggle key={camera} on={state.camera === camera} onClick={() => api.setCamera(camera)} label={CAMERA_LABELS[camera]}>
                    {CAMERA_LABELS[camera]}
                  </Toggle>
                ))}
                {state.camera === "free" && <span className="px-1 text-xs text-(--bt-muted)">Free: drag, pinch or the sticks</span>}
              </div>
              <div className="flex gap-1">
                <IconButton label="Orbit left (q)" onClick={() => api.orbit(-1)}>
                  ⟲
                </IconButton>
                <IconButton label="Zoom out (-, left trigger)" onClick={() => api.zoom(1 / 1.25)}>
                  −
                </IconButton>
                <IconButton label="Zoom in (=, right trigger)" onClick={() => api.zoom(1.25)}>
                  +
                </IconButton>
                <IconButton label="Orbit right (e)" onClick={() => api.orbit(1)}>
                  ⟳
                </IconButton>
              </div>
            </Section>

            <Section title="Show">
              <div className="flex flex-wrap gap-1">
                <Toggle on={state.backlight} onClick={() => api.setBacklight(!state.backlight)} label="The backlight's rim">
                  Backlight
                </Toggle>
                {state.canRing && (
                  <Toggle on={state.ring} onClick={() => api.setRing(!state.ring)} label="The seat-colour ring">
                    Seat ring
                  </Toggle>
                )}
                {state.canStun && (
                  <Toggle on={state.stunned} onClick={() => api.setStunned(!state.stunned)} label="Stunned">
                    Stunned
                  </Toggle>
                )}
              </div>
              <label className="flex items-center gap-2">
                <span className="text-(--bt-muted)">Cloth</span>
                <select aria-label="Cloth" className={SELECT} value={state.cloth} onChange={(event) => api.setCloth(CLOTH_MODES[CLOTH_MODES.indexOf(event.target.value as (typeof CLOTH_MODES)[number])])}>
                  {CLOTH_MODES.map((cloth) => (
                    <option key={cloth} value={cloth}>
                      {cloth}
                    </option>
                  ))}
                </select>
              </label>
              {state.canHold && (
                <label className="flex items-center gap-2">
                  <span className="text-(--bt-muted)">Holding</span>
                  <select aria-label="Holding" className={SELECT} value={state.holding} onChange={(event) => api.setHolding(HOLDINGS[HOLDINGS.indexOf(event.target.value as Holding)])}>
                    {HOLDINGS.map((holding) => (
                      <option key={holding} value={holding}>
                        {holding}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </Section>

            <p className="hidden text-xs text-(--bt-muted) md:block">
              Keys: [ ] figure, space play, , . frame, v speed, p Speed, s state, 1–9 bursts, 0 idle, l light, c camera, q e orbit, − = zoom, u line-up. Pad: LB RB
              figure, A play, D-pad frames and state, X next burst, B speed, Y camera, View light, Menu line-up, sticks and triggers the camera.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold tracking-wide text-(--bt-muted) uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={label}
      onClick={onClick}
      className="pointer-events-auto min-h-10 rounded border border-(--bt-line) bg-(--bt-panel) px-2 text-sm text-(--bt-ink) aria-pressed:border-(--bt-accent) aria-pressed:text-(--bt-accent)"
    >
      {children}
    </button>
  );
}

function IconButton({ label, onClick, disabled = false, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="pointer-events-auto h-10 w-10 shrink-0 rounded border border-(--bt-line) bg-(--bt-panel) text-lg text-(--bt-ink) disabled:opacity-40"
    >
      {children}
    </button>
  );
}
