"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { BETRAYAL_THEME } from "../components/theme";
import { FLOOR_NAMES, FLOORS } from "../engine/board";
import type { InputKind } from "../input/controls";
import { BenchButton } from "./bench-view";
import type { Layout } from "../engine/board";
import { CATALOG } from "../data";
import { HOUSE_FIXTURE, MARKINGS_LAYOUT, reviewHouse, SPILL_LAYOUTS } from "./house-layout";
import { createHouseDemo, FIXTURE_STARTS, type Phase } from "./house-demo";
import { markingsFromSearch } from "./markings";
import { RaiseWallsButton } from "../components/raise-walls-button";
import type { FloorChoice } from "./house-scene";
import { BENCH_ROOMS } from "./rooms";

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

/** What each control does, for the input the player last used: a
 *  controller's buttons, or the keys and mouse. A finger has the on-screen
 *  buttons, so it gets no hints. */
function Hints({ input, phase, walking, stopping }: { input: InputKind; phase: Phase; walking: boolean; stopping: boolean }) {
  const go = stopping ? "stop" : "walk";
  if (walking || input === "touch") return null;
  const pad = input === "pad";
  const hints =
    phase === "entering"
      ? [<Hint key="skip" glyphs={pad ? <Glyph round>A</Glyph> : <Glyph>Enter</Glyph>} does="go on" />]
      : pad
        ? [
            <Hint key="pan" glyphs={<Glyph round>L</Glyph>} does="look" />,
            <Hint key="go" glyphs={<Glyph round>A</Glyph>} does={go} />,
            <Hint key="back" glyphs={<Glyph round>B</Glyph>} does="back" />,
            <Hint key="next" glyphs={<><Glyph>LB</Glyph><Glyph>RB</Glyph></>} does="next" />,
            <Hint key="orbit" glyphs={<Glyph round>R</Glyph>} does="turn, tilt" />,
            <Hint key="zoom" glyphs={<><Glyph>LT</Glyph><Glyph>RT</Glyph></>} does="zoom" />,
            <Hint key="floor" glyphs={<Glyph>✚</Glyph>} does="floor" />,
            <Hint key="recentre" glyphs={<Glyph round>Y</Glyph>} does="recentre" />,
            <Hint key="walls" glyphs={<Glyph round>L3</Glyph>} does="hold: walls" />,
          ]
        : [
            <Hint key="pan" glyphs={<Glyph>WASD</Glyph>} does="look" />,
            <Hint key="go" glyphs={<Glyph>Click</Glyph>} does={go} />,
            <Hint key="next" glyphs={<Glyph>Tab</Glyph>} does="next" />,
            <Hint key="orbit" glyphs={<><Glyph>Q</Glyph><Glyph>E</Glyph></>} does="turn" />,
            <Hint key="tilt" glyphs={<><Glyph>T</Glyph><Glyph>G</Glyph></>} does="tilt" />,
            <Hint key="drag" glyphs={<Glyph>Right-drag</Glyph>} does="turn, tilt" />,
            <Hint key="zoom" glyphs={<Glyph>Wheel</Glyph>} does="zoom" />,
            <Hint key="floor" glyphs={<><Glyph>R</Glyph><Glyph>F</Glyph></>} does="floor" />,
            <Hint key="recentre" glyphs={<Glyph>C</Glyph>} does="recentre" />,
            <Hint key="walls" glyphs={<Glyph>V</Glyph>} does="hold: walls" />,
          ];
  return <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">{hints}</div>;
}

/** The named houses `?layout=` may ask for: light between rooms, and the cutaway markings. */
const LAYOUTS: Record<string, Layout> = { ...SPILL_LAYOUTS, markings: MARKINGS_LAYOUT };

/** The house `?layout=` asks for: `room:<room-id>`, a small house round that
 *  room for reviewing it (`reviewHouse`); one of `LAYOUTS`; or, without it,
 *  the fixture house. */
function chosenHouse(): { layout: Layout; starts: readonly [string, string] } {
  const name = new URLSearchParams(window.location.search).get("layout");
  if (name === null) return { layout: HOUSE_FIXTURE, starts: FIXTURE_STARTS };
  if (name.startsWith("room:")) return reviewHouse(name.slice("room:".length), CATALOG, new Set(BENCH_ROOMS.map((room) => room.id)));
  const layout = LAYOUTS[name] as Layout | undefined;
  if (!layout) throw new Error(`No house layout "${name}"; there are room:<room-id> and ${Object.keys(LAYOUTS).join(", ")}`);
  return { layout, starts: FIXTURE_STARTS };
}

/** The house view prototype (`?house`): a whole house of rooms, full screen,
 *  with two explorers taking turns to walk where the player chooses. */
export function HouseScreen() {
  const [view] = useState(() => {
    const { layout, starts } = chosenHouse();
    return createHouseDemo(layout, starts, markingsFromSearch(window.location.search));
  });
  const state = useSyncExternalStore(view.subscribe, view.snapshot, view.snapshot);
  const shown = useSyncExternalStore(view.scene.subscribe, view.scene.view, view.scene.view);
  const containerRef = useThreeScene(view.mount, {
    antialias: false,
    maxPixelRatio: 4,
    stats: true,
    statsCorner: "top-right",
  });
  const floors: FloorChoice[] = [...view.api.floors(), "all"];
  const rooms = shown.floor === "all" ? [] : view.api.rooms(shown.floor);
  const explorer = state.explorers[state.active];
  const focused = state.choices.find((choice) => choice.id === state.focused);
  /** A focused room on another floor shows here as the stair to it, so its tag says which way the stair goes. */
  const stair =
    focused && shown.floor !== "all" && focused.floor !== shown.floor ? (FLOORS.indexOf(focused.floor) > FLOORS.indexOf(shown.floor) ? "Up to the " : "Down to the ") : "";
  const [minZoom, maxZoom] = view.scene.zoomRange;
  const labelRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    view.scene.setLabel(labelRef.current);
    view.scene.setReticle(reticleRef.current);
    return () => {
      view.scene.setLabel(null);
      view.scene.setReticle(null);
    };
  }, [view]);

  const status =
    shown.walking
      ? `${explorer.name} is walking…`
      : state.phase === "entering"
        ? `${explorer.name} enters the ${view.roomName(explorer.room)}.`
        : `${explorer.name} · ${state.left} of ${state.movement} spaces left`;

  return (
    <div style={BETRAYAL_THEME} className="fixed inset-0 bg-(--bt-bg) text-(--bt-ink)">
      <div ref={containerRef} className="absolute inset-0" />
      <div
        ref={reticleRef}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 h-8 w-8 rounded-full border-2 border-(--bt-muted) data-[snapped=true]:border-(--bt-accent)"
      />
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
            className={`pointer-events-auto rounded border px-2 py-1 text-sm ${shown.floor === floor ? "border-(--bt-accent) bg-(--bt-room)" : "border-(--bt-line) bg-(--bt-panel)"}`}
          >
            {floor === "all" ? "All floors" : FLOOR_NAMES[floor]}
          </button>
        ))}
        <label className="pointer-events-auto flex items-center gap-2 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm">
          <span className="text-(--bt-muted)">Room</span>
          <select
            className="bg-(--bt-panel) text-(--bt-ink)"
            value={shown.closeUp ?? ""}
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
            value={shown.resolution ?? "native"}
            onChange={(event) => view.api.setResolution(event.target.value === "native" ? null : Number(event.target.value))}
          >
            {view.scene.resolutions.map((resolution) => (
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
          {state.phase === "entering" && !shown.walking && (
            <button type="button" onClick={() => view.api.confirm()} className="min-h-11 rounded border border-(--bt-line) bg-(--bt-room) px-3 py-1">
              Go on
            </button>
          )}
          <Hints input={shown.input} phase={state.phase} walking={shown.walking} stopping={focused?.stop === true} />
        </section>
        <div className="flex justify-center gap-2">
          <BenchButton label="Floor down" disabled={shown.floor === floors[0]} onClick={() => view.api.stepFloor(-1)}>
            ▼
          </BenchButton>
          <BenchButton label="Floor up" disabled={shown.floor === floors[floors.length - 2]} onClick={() => view.api.stepFloor(1)}>
            ▲
          </BenchButton>
          <BenchButton label="Recentre" onClick={() => view.api.recentre()}>
            ◎
          </BenchButton>
          <RaiseWallsButton
            raised={shown.wallsRaised}
            raise={view.scene.hook.raiseWalls}
            className="pointer-events-auto h-12 w-12 rounded border border-(--bt-line) bg-(--bt-panel) text-xl text-(--bt-ink) aria-pressed:border-(--bt-accent)"
          >
            ▥
          </RaiseWallsButton>
          <BenchButton label="Zoom out" disabled={shown.zoom <= minZoom} onClick={() => view.api.setZoom(shown.zoom / 1.5)}>
            −
          </BenchButton>
          <BenchButton label="Zoom in" disabled={shown.zoom >= maxZoom} onClick={() => view.api.setZoom(shown.zoom * 1.5)}>
            +
          </BenchButton>
        </div>
      </div>
    </div>
  );
}
