"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { BETRAYAL_THEME } from "../components/theme";
import { FLOOR_NAMES, FLOORS } from "../engine/board";
import type { InputKind } from "../input/controls";
import { BenchButton } from "./bench-view";
import type { Layout } from "../engine/board";
import { HOUSE_FIXTURE, SPILL_LAYOUTS } from "./house-layout";
import { createHouseView, type FloorChoice, type HouseSnapshot } from "./house-view";

/** A key or button name, drawn as the thing pressed: a keycap, or a controller's round button. */
function Glyph({ children, round = false }: { children: ReactNode; round?: boolean }) {
  return (
    <kbd
      className={`inline-flex h-6 min-w-6 items-center justify-center border border-(--bt-line) bg-(--bt-room) px-1 font-sans text-xs text-(--bt-ink) ${round ? "rounded-full" : "rounded"}`}
    >
      {children}
    </kbd>
  );
}

function Hint({ glyphs, does }: { glyphs: ReactNode; does: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {glyphs}
      <span className="text-(--bt-muted)">{does}</span>
    </span>
  );
}

/** What each control does, for the input the player last used. A mouse and a
 *  finger point at what they want, so they get no hints. */
function Hints({ input, phase, stopping }: { input: InputKind; phase: HouseSnapshot["phase"]; stopping: boolean }) {
  const go = stopping ? "stop" : "walk";
  if (phase === "walking" || input === "mouse" || input === "touch") return null;
  const pad = input === "pad";
  const hints =
    phase === "entering"
      ? [<Hint key="skip" glyphs={pad ? <Glyph round>A</Glyph> : <Glyph>Enter</Glyph>} does="go on" />]
      : pad
        ? [
            <Hint key="move" glyphs={<><Glyph round>L</Glyph><Glyph>✚</Glyph></>} does="choose" />,
            <Hint key="go" glyphs={<Glyph round>A</Glyph>} does={go} />,
            <Hint key="orbit" glyphs={<><Glyph round>R</Glyph><Glyph>LB</Glyph><Glyph>RB</Glyph></>} does="turn" />,
            <Hint key="zoom" glyphs={<><Glyph>LT</Glyph><Glyph>RT</Glyph></>} does="zoom" />,
          ]
        : [
            <Hint key="move" glyphs={<><Glyph>←↑↓→</Glyph><Glyph>WASD</Glyph></>} does="choose" />,
            <Hint key="go" glyphs={<Glyph>Enter</Glyph>} does={go} />,
            <Hint key="orbit" glyphs={<><Glyph>Q</Glyph><Glyph>E</Glyph></>} does="turn" />,
            <Hint key="zoom" glyphs={<><Glyph>+</Glyph><Glyph>−</Glyph></>} does="zoom" />,
          ];
  return <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">{hints}</div>;
}

/** The layout `?layout=<name>` asks for (one of `SPILL_LAYOUTS`, for judging
 *  light between rooms), or the fixture house. */
function chosenLayout(): Layout {
  const name = new URLSearchParams(window.location.search).get("layout");
  if (name === null) return HOUSE_FIXTURE;
  const layout = SPILL_LAYOUTS[name] as Layout | undefined;
  if (!layout) throw new Error(`No house layout "${name}"; there are: ${Object.keys(SPILL_LAYOUTS).join(", ")}`);
  return layout;
}

/** The house view prototype (`?house`): a whole house of rooms, full screen,
 *  with two explorers taking turns to walk where the player chooses. */
export function HouseScreen() {
  const [view] = useState(() => createHouseView(chosenLayout()));
  const state = useSyncExternalStore(view.subscribe, view.snapshot, view.snapshot);
  const containerRef = useThreeScene(view.mount, {
    antialias: false,
    maxPixelRatio: 4,
    stats: true,
    statsCorner: "top-right",
  });
  const floors: FloorChoice[] = [...view.floors, "all"];
  const rooms = state.floor === "all" ? [] : view.api.rooms(state.floor);
  const explorer = state.explorers[state.active];
  const focused = state.choices.find((choice) => choice.room === state.focused);
  /** A focused room on another floor shows here as the stair to it, so its tag says which way the stair goes. */
  const stair =
    focused && state.floor !== "all" && focused.floor !== state.floor ? (FLOORS.indexOf(focused.floor) > FLOORS.indexOf(state.floor) ? "Up to the " : "Down to the ") : "";
  const [minZoom, maxZoom] = view.zoomRange;
  const labelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    view.setLabel(labelRef.current);
    return () => view.setLabel(null);
  }, [view]);

  const status =
    state.phase === "walking"
      ? `${explorer.name} is walking…`
      : state.phase === "entering"
        ? `${explorer.name} enters the ${view.roomName(explorer.room)}.`
        : `${explorer.name} · ${state.left} of ${state.movement} spaces left`;

  return (
    <div style={BETRAYAL_THEME} className="fixed inset-0 bg-(--bt-bg) text-(--bt-ink)">
      <div ref={containerRef} className="absolute inset-0" />
      <div
        ref={labelRef}
        className="pointer-events-none invisible absolute top-0 left-0 rounded border border-(--bt-accent) bg-(--bt-panel) px-2 py-0.5 text-sm whitespace-nowrap"
      >
        {focused && (
          <>
            {stair}
            {focused.name}
            {!focused.stop && (
              <span className="text-(--bt-muted)">
                {" "}
                · {focused.steps} of {state.left} {state.left === 1 ? "space" : "spaces"}
              </span>
            )}
          </>
        )}
      </div>
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
            value={state.closeUp ?? ""}
            disabled={rooms.length === 0}
            onChange={(event) => view.api.setCloseUp(event.target.value || null)}
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-end sm:justify-between">
        <section
          aria-label="Turn"
          className="pointer-events-auto flex flex-col gap-2 rounded border border-(--bt-line) bg-(--bt-panel) p-2 text-sm sm:w-80"
        >
          <p>{status}</p>
          {state.phase === "entering" && (
            <button type="button" onClick={() => view.api.confirm()} className="min-h-11 rounded border border-(--bt-line) bg-(--bt-room) px-3 py-1">
              Go on
            </button>
          )}
          <Hints input={state.input} phase={state.phase} stopping={focused?.stop === true} />
        </section>
        <div className="flex justify-center gap-2">
          <BenchButton label="Orbit left" onClick={() => view.api.turn(-1)}>
            ⟲
          </BenchButton>
          <BenchButton label="Zoom out" disabled={state.zoom <= minZoom} onClick={() => view.api.setZoom(state.zoom / 1.5)}>
            −
          </BenchButton>
          <BenchButton label="Zoom in" disabled={state.zoom >= maxZoom} onClick={() => view.api.setZoom(state.zoom * 1.5)}>
            +
          </BenchButton>
          <BenchButton label="Orbit right" onClick={() => view.api.turn(1)}>
            ⟳
          </BenchButton>
        </div>
      </div>
    </div>
  );
}
