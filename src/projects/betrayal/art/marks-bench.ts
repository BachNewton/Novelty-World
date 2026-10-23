import type { ThreeSceneContext } from "@/shared/lib/three/use-three-scene";
import type { Layout } from "../engine/board";
import { ENGINE } from "../game";
import { tokenMood, tokenName, type ShownThing } from "../play/things";
import type { Edge } from "../types";
import { createHouseScene, type SceneHook } from "./house-scene";
import { placementHints, roomFloor } from "./room-floor";
import { primePlaces } from "./room";
import { definition } from "./house";
import { roomTile } from "./stage";
import { floorSpot, markSpot, takenBy, type EdgeSpot, type TakenStretch } from "./things/mark-spot";
import { FLOOR_MARK_REACH, floorMark, isFloorMark, isWallMark, wallMark, type MarkFace, type MarkKind } from "./things/marks";

/*
 * The marks bench (`?bench=marks`): the connection marks a card can put in
 * any room, under review before they go into the game, shown in a row of
 * awkward built rooms on the real house: walls crowded with furniture (the
 * Library, the Organ Room), a barrier room (the Chasm), an outdoor tile (the
 * Graveyard) and a basement room (the Wine Cellar). One kind at a time goes
 * on every wall of every room, or into every corner, or wherever the game
 * would put a mark it names no wall for, so the owner sees how its art fits
 * each wall and where it gives way to the icon alone.
 */

/** The rooms on the bench, in a row, a cell apart so none shares a wall. */
export const MARK_ROOMS = ["library", "organ-room", "chasm", "graveyard", "wine-cellar"] as const;

const LAYOUT: Layout = { tiles: MARK_ROOMS.map((tile, i) => ({ tile, floor: "ground", x: 2 * i, y: 0, rotation: 0 })) };

/** Where a wall kind goes on each room: one on each wall, one in each corner, or one wherever the game puts a mark it names no wall for. */
export type MarkWalls = "walls" | "corners" | "anywhere";
const WALL_SETS: Record<MarkWalls, (readonly Edge[] | null)[]> = {
  walls: [["top"], ["right"], ["bottom"], ["left"]],
  corners: [["top", "right"], ["right", "bottom"], ["bottom", "left"], ["left", "top"]],
  anywhere: [null],
};

export const BENCH_MARKS: readonly MarkKind[] = ["secret-passage", "secret-stairs", "wall-switch", "slide", "below-collapsed-room"];

export interface MarksBenchState {
  kind: MarkKind;
  walls: MarkWalls;
  face: MarkFace;
  /** The room shown close, or null for the row. */
  room: string | null;
  /** For each room, the walls whose stretch was too crowded for the art: only the icon shows there. */
  gaveWay: Readonly<Record<string, readonly string[]>>;
}

const wallName = (wall: readonly Edge[] | null, spot: EdgeSpot) => (wall === null ? `${spot.edge} wall` : wall.length === 1 ? `${wall[0]} wall` : `${wall.join("-")} corner`);

declare global {
  interface Window {
    /** The marks bench's scene, its state and its controls, for screenshots (`tools/marks-shots.mjs`). */
    __betrayalMarks?: SceneHook & { state: () => MarksBenchState } & MarksBenchApi;
  }
}

export interface MarksBenchApi {
  setKind: (kind: MarkKind) => void;
  setWalls: (walls: MarkWalls) => void;
  setFace: (face: MarkFace) => void;
  setRoom: (room: string | null) => void;
}

export function createMarksBench() {
  const params = new URLSearchParams(window.location.search);
  let state: MarksBenchState = {
    kind: BENCH_MARKS.find((kind) => kind === params.get("kind")) ?? "secret-passage",
    walls: (["walls", "corners", "anywhere"] as const).find((walls) => walls === params.get("walls")) ?? "walls",
    face: params.get("face") === "bone" ? "bone" : "ink",
    room: null,
    gaveWay: {},
  };
  const scene = createHouseScene(LAYOUT, {
    connections: (shown, colour) => {
      const kind = shown.token ?? "";
      if (shown.place.kind === "edge" && isWallMark(kind)) return wallMark(kind, colour, shown.place.spot, state.face, roomTile(shown.room).outside);
      if (shown.place.kind === "floor" && isFloorMark(kind)) return floorMark(kind, colour, [0, 0], state.face);
      throw new Error(`The marks bench has no mark for ${kind} on the ${shown.place.kind}`);
    },
  });
  const listeners = new Set<() => void>();

  /** Each room's floor, read on the spot (the bench may hold the main thread), with its hints for each side of a barrier room. */
  const floors = (room: string, side: Edge | null) => ({ floor: roomFloor(room), hints: placementHints(definition(room), side) });
  const sides = (room: string): (Edge | null)[] => (primePlaces(definition(room)).length > 1 ? roomTile(room).doors : [null]);

  function things(): { shown: ShownThing[]; gaveWay: Record<string, string[]> } {
    const { kind, walls, face } = state;
    const base = { kind: "connection" as const, name: `${tokenName(kind)} (${face})`, mood: tokenMood(ENGINE, kind), card: null, token: kind };
    const gaveWay: Record<string, string[]> = {};
    const shown = MARK_ROOMS.flatMap((room) =>
      sides(room).flatMap((side): ShownThing[] => {
        const id = (where: string) => `bench:${room}:${side ?? "room"}:${kind}:${where}:${face}`;
        if (isFloorMark(kind)) {
          const at = floorSpot(floors(room, side), FLOOR_MARK_REACH[kind]);
          return [{ ...base, id: id("floor"), room, things: [id("floor")], place: { kind: "floor", at } }];
        }
        const taken: TakenStretch[] = [];
        return WALL_SETS[walls].map((wall): ShownThing => {
          const spot = markSpot(floors(room, side), roomTile(room), kind, wall, taken);
          taken.push(takenBy(spot, kind));
          if (!spot.fits) (gaveWay[room] ??= []).push(wallName(wall, spot) + (side ? ` (${side} side)` : ""));
          const where = wall === null ? "anywhere" : wall.join("-");
          return { ...base, id: id(where), room, things: [id(where)], place: { kind: "edge", spot } };
        });
      }),
    );
    return { shown, gaveWay };
  }

  function show() {
    const { shown, gaveWay } = things();
    state = { ...state, gaveWay };
    scene.setThings(shown);
  }

  /** Shows a change, and keeps it in the page's address, so a link opens the bench as it is. */
  function publish(next: Partial<MarksBenchState>) {
    state = { ...state, ...next };
    show();
    const url = new URLSearchParams(window.location.search);
    url.set("kind", state.kind);
    url.set("walls", state.walls);
    url.set("face", state.face);
    window.history.replaceState(null, "", `?${url.toString()}`);
    for (const listener of listeners) listener();
  }

  show();

  const api: MarksBenchApi = {
    setKind: (kind) => publish({ kind }),
    setWalls: (walls) => publish({ walls }),
    setFace: (face) => publish({ face }),
    setRoom: (room) => {
      state = { ...state, room };
      scene.hook.setCloseUp(room);
      if (room === null) scene.hook.fit();
      for (const listener of listeners) listener();
    },
  };

  return {
    scene,
    mount: (ctx: ThreeSceneContext) => {
      const handlers = scene.mount(ctx);
      window.__betrayalMarks = { ...scene.hook, ...api, state: () => state };
      return {
        ...handlers,
        dispose: () => {
          delete window.__betrayalMarks;
          handlers.dispose?.();
        },
      };
    },
    api,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => state,
  };
}
