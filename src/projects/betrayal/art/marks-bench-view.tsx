"use client";

import { useState, useSyncExternalStore } from "react";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import { BETRAYAL_THEME } from "../components/theme";
import { tokenName } from "../play/things";
import { BenchButton } from "./bench-view";
import { BakeIndicator } from "./bake-indicator";
import { BENCH_MARKS, createMarksBench, MARK_ROOMS, type MarkWalls } from "./marks-bench";
import { roomTile } from "./stage";
import { isWallMark } from "./things/marks";

const WALLS: Record<MarkWalls, string> = { walls: "Every wall", corners: "Every corner", anywhere: "Where the game puts it" };
const MARK_WALLS = Object.keys(WALLS) as MarkWalls[];

/** The marks bench (`?bench=marks`, optionally `&kind=`, `&walls=` and `&face=`): the connection marks in a row of awkward rooms, to judge before they go into the game. */
export function MarksBenchView() {
  const [bench] = useState(createMarksBench);
  const state = useSyncExternalStore(bench.subscribe, bench.snapshot, bench.snapshot);
  const containerRef = useThreeScene(bench.mount, { antialias: false, maxPixelRatio: 4 });
  const [raised, setRaised] = useState(false);
  const panel = "pointer-events-auto flex items-center gap-2 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-sm";
  const gaveWay = Object.entries(state.gaveWay);

  return (
    <div style={BETRAYAL_THEME} className="fixed inset-0 bg-(--bt-bg) text-(--bt-ink)">
      <div ref={containerRef} className="absolute inset-0" />
      <BakeIndicator bakes={bench.scene.bakes} className="absolute top-30 right-2" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-3">
        <label className={panel}>
          <span className="text-(--bt-muted)">Mark</span>
          <select className="bg-(--bt-panel) text-(--bt-ink)" value={state.kind} onChange={(event) => bench.api.setKind(BENCH_MARKS.find((kind) => kind === event.target.value) ?? state.kind)}>
            {BENCH_MARKS.map((kind) => (
              <option key={kind} value={kind}>
                {tokenName(kind)}
              </option>
            ))}
          </select>
        </label>
        <label className={panel}>
          <span className="text-(--bt-muted)">On</span>
          <select
            className="bg-(--bt-panel) text-(--bt-ink)"
            value={isWallMark(state.kind) ? state.walls : "floor"}
            disabled={!isWallMark(state.kind)}
            onChange={(event) => bench.api.setWalls(MARK_WALLS.find((walls) => walls === event.target.value) ?? state.walls)}
          >
            {isWallMark(state.kind) ? (
              Object.entries(WALLS).map(([walls, name]) => (
                <option key={walls} value={walls}>
                  {name}
                </option>
              ))
            ) : (
              <option value="floor">The floor</option>
            )}
          </select>
        </label>
        <label className={panel}>
          <span className="text-(--bt-muted)">Plate</span>
          <select className="bg-(--bt-panel) text-(--bt-ink)" value={state.face} onChange={(event) => bench.api.setFace(event.target.value === "bone" ? "bone" : "ink")}>
            <option value="ink">Ink</option>
            <option value="bone">Bone</option>
          </select>
        </label>
        <label className={panel}>
          <span className="text-(--bt-muted)">Room</span>
          <select className="bg-(--bt-panel) text-(--bt-ink)" value={state.room ?? ""} onChange={(event) => bench.api.setRoom(event.target.value || null)}>
            <option value="">All five</option>
            {MARK_ROOMS.map((room) => (
              <option key={room} value={room}>
                {roomTile(room).name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-pressed={raised}
          className={panel}
          onClick={() => {
            bench.scene.hook.raiseWalls(!raised);
            setRaised(!raised);
          }}
        >
          {raised ? "Walls: raised" : "Walls: cut"}
        </button>
        <span className="rounded border border-(--bt-danger) px-2 text-xs font-semibold tracking-wide text-(--bt-danger) uppercase">Marks bench</span>
      </div>
      {gaveWay.length > 0 && (
        <div className="pointer-events-none absolute bottom-20 left-3 max-w-72 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 text-xs">
          <p className="text-(--bt-muted)">No clear stretch, so only the icon shows:</p>
          {gaveWay.map(([room, walls]) => (
            <p key={room}>
              {roomTile(room).name}: {walls.join(", ")}
            </p>
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <BenchButton label="Orbit left" onClick={() => bench.scene.hook.turn(-1)}>
          ⟲
        </BenchButton>
        <BenchButton label="Fit the view" onClick={() => bench.scene.hook.fit()}>
          ⤢
        </BenchButton>
        <BenchButton label="Orbit right" onClick={() => bench.scene.hook.turn(1)}>
          ⟳
        </BenchButton>
      </div>
    </div>
  );
}
