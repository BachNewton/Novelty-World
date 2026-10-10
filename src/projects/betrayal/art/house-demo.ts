import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import { CATALOG } from "../data";
import type { Layout } from "../engine/board";
import type { FloorId } from "../types";
import { figureFor } from "./explorers/by-character";
import { candle, carrying } from "./explorers/props";
import { HOUSE_FIXTURE } from "./house-layout";
import { DEFAULT_MARKINGS, type Markings } from "./markings";
import { createHouseScene, type FigureSpec, type SceneHook, type SceneView, type Target } from "./house-scene";
import { afterLeg, moveIsOver, nextLegs } from "./house-demo-moves";
import { pawn } from "./kit/pawn";
import type { PaletteKey } from "./palette";
import { roomTile, type ExplorerBuilder } from "./stage";

/*
 * A stand-in game on the house scene, for `?house` until the real engine
 * drives it: two explorers take turns, each moving in legs on a budget of
 * spaces, up and down the stairs, and the camera pans to a room entered for
 * the first time, with its walls up. It drives the scene only through its API, as the engine's
 * presentation will. Committing a choice moves the game on at once, and the
 * walk plays while the next choice is offered: input during a walk
 * fast-forwards it and then acts.
 */

/** The stand-in decision: how many spaces an explorer may move. */
const MOVEMENT = 4;
/** How long a room an explorer enters for the first time is shown with its walls up. */
const ENTERING_SECONDS = 2.5;
/** The id of the choice that stops the move where the explorer stands. */
const STOP = "stop";

interface CastMember {
  id: string;
  name: string;
  build: ExplorerBuilder;
  colour: PaletteKey;
}

const scalePawn: ExplorerBuilder = () => pawn({ colour: "bone" });

/** Two explorers for the prototype, taking turns: Longfellow, carrying a candle, and a recoloured scale pawn. */
const CAST: readonly CastMember[] = [
  // He carries a lit candle, its light moving with him through the dark rooms.
  { id: "longfellow", name: "Professor Longfellow", build: carrying(figureFor("professor-longfellow", "amber"), candle), colour: "amber" },
  { id: "pawn", name: "The scale pawn", build: scalePawn, colour: "verdigrisLight" },
];

/** Where the fixture house's explorers start: Longfellow in the Library, the pawn in the Foyer. */
export const FIXTURE_STARTS: readonly [string, string] = ["library", "foyer"];

/** What the stand-in decision offers: a room to walk to, or stopping in the
 *  room the explorer stands in, which ends the turn. */
export interface Choice {
  id: string;
  room: string;
  name: string;
  /** Spaces of movement it takes. */
  steps: number;
  floor: FloorId;
  stop: boolean;
}

/** Choosing where to go, or a room entered for the first time, shown with
 *  its walls up until the player goes on or the moment passes. */
export type Phase = "choosing" | "entering";

export interface DemoState {
  explorers: { id: string; name: string; room: string; slot: number }[];
  /** Whose turn it is, by index into `explorers`. */
  active: number;
  /** The active explorer's movement this turn, and the spaces of it left. */
  movement: number;
  left: number;
  phase: Phase;
  choices: Choice[];
  /** The choice the player has focused, by pointing, tapping or the reticle; null for none. */
  focused: string | null;
}

export type HouseSnapshot = SceneView & DemoState;

export interface HouseApi extends SceneHook {
  state: () => HouseSnapshot;
  /** Commits a choice by id. */
  choose: (id: string) => void;
  /** Commits the focused choice, or goes on from a room being entered. */
  confirm: () => void;
}

declare global {
  interface Window {
    __betrayalHouse?: HouseApi;
  }
}

export function createHouseDemo(layout: Layout = HOUSE_FIXTURE, starts: readonly [string, string] = FIXTURE_STARTS, markings: Markings | null = DEFAULT_MARKINGS) {
  const scene = createHouseScene(layout, { readout: true, markings });
  const floorOf = (room: string) => {
    const tile = layout.tiles.find((placed) => placed.tile === room);
    if (!tile) throw new Error(`The house has no room "${room}"`);
    return tile.floor;
  };
  const roomName = (id: string) => roomTile(id).name;

  let state: DemoState = {
    explorers: CAST.map(({ id, name }, i) => ({ id, name, room: starts[i], slot: 0 })),
    active: 0,
    movement: MOVEMENT,
    left: MOVEMENT,
    phase: "choosing",
    choices: [],
    focused: null,
  };
  /** Each choice's route of rooms, from the active explorer's room. */
  let routes = new Map<string, string[]>();
  const visited = new Set(starts);
  /** The arrival being framed close, while one is: a count, so a later one never ends an earlier one's moment. */
  let entering: number | null = null;
  let arrivals = 0;
  const listeners = new Set<() => void>();

  const activeId = () => state.explorers[state.active].id;
  const figures = (): FigureSpec[] =>
    state.explorers.map((explorer, i) => {
      const { id, build, colour } = CAST[i];
      return { id, build, colour, room: explorer.room, slot: explorer.slot };
    });
  const targets = (): Target[] =>
    state.phase === "choosing"
      ? state.choices.map((choice) => {
          const route = routes.get(choice.id);
          return route
            ? { id: choice.id, kind: "room", room: choice.room, route: { figure: activeId(), rooms: route, slot: slotIn(choice.room, activeId()) } }
            : { id: choice.id, kind: "room", room: choice.room };
        })
      : [];

  function publish(next: DemoState) {
    state = next;
    scene.setFigures(figures());
    scene.setTargets(targets(), state.focused);
    for (const listener of listeners) listener();
  }

  /** The place in a room an explorer walking there takes: the pawn spot, or beside it when someone already stands there. */
  function slotIn(room: string, explorer: string): number {
    return state.explorers.some((other) => other.id !== explorer && other.room === room) ? 1 : 0;
  }

  /** The active explorer's next leg: every room within the movement left, and stopping where they stand. */
  function offer(next: DemoState): DemoState {
    const explorer = next.explorers[next.active];
    const reaches = nextLegs(layout, CATALOG, { room: explorer.room, left: next.left });
    routes = new Map(reaches.map((reach) => [`walk:${reach.room}`, reach.route]));
    const choices: Choice[] = [
      ...reaches.map((reach) => ({ id: `walk:${reach.room}`, room: reach.room, name: roomName(reach.room), steps: reach.route.length - 1, floor: floorOf(reach.room), stop: false })),
      { id: STOP, room: explorer.room, name: "Stop here", steps: 0, floor: floorOf(explorer.room), stop: true },
    ];
    return { ...next, phase: "choosing", choices, focused: null };
  }

  function nextTurn(from: DemoState) {
    entering = null;
    const next = offer({ ...from, active: (from.active + 1) % from.explorers.length, left: from.movement });
    scene.setActive(next.explorers[next.active].id);
    publish(next);
  }

  /** After a leg: the next leg, or, when the move is over, the next explorer's turn. */
  function continueTurn(from: DemoState) {
    entering = null;
    if (scene.view().closeUp !== null) void scene.play({ kind: "frame", framing: null });
    const explorer = from.explorers[from.active];
    if (moveIsOver(layout, CATALOG, { room: explorer.room, left: from.left })) nextTurn(from);
    else publish(offer(from));
  }

  /** A room entered for the first time: shown with its walls up once the walk there is over, until the player goes on or the moment passes. */
  function enter(room: string, walked: Promise<void>) {
    const arrival = ++arrivals;
    entering = arrival;
    void walked.then(async () => {
      if (entering !== arrival) return;
      void scene.play({ kind: "frame", framing: { closeUp: room } });
      await scene.play({ kind: "pause", seconds: ENTERING_SECONDS });
      if (entering === arrival) continueTurn(state);
    });
  }

  function focus(id: string) {
    if (state.phase !== "choosing" || state.focused === id || !state.choices.some((choice) => choice.id === id)) return;
    publish({ ...state, focused: id });
  }

  function unfocus() {
    if (state.focused !== null) publish({ ...state, focused: null });
  }

  function choose(id: string) {
    // Nothing waits on an animation: whatever is playing completes at once, and the choice is acted on.
    scene.finish();
    if (state.phase === "entering") {
      continueTurn(state);
      return;
    }
    const choice = state.choices.find((candidate) => candidate.id === id);
    if (!choice) return;
    if (choice.stop) {
      nextTurn(state);
      return;
    }
    const route = routes.get(id);
    if (!route) throw new Error(`${id} has no route`);
    const explorer = activeId();
    const slot = slotIn(choice.room, explorer);
    const { left } = afterLeg({ room: route[0], left: state.left }, { room: choice.room, route });
    const explorers = state.explorers.map((member) => (member.id === explorer ? { ...member, room: choice.room, slot } : member));
    const walked = scene.play({ kind: "walk", figure: explorer, route, slot });
    if (visited.has(choice.room)) {
      continueTurn({ ...state, explorers, left });
      return;
    }
    visited.add(choice.room);
    enter(choice.room, walked);
    publish({ ...state, explorers, left, phase: "entering", choices: [], focused: null });
  }

  function confirm() {
    if (state.phase === "entering") {
      scene.finish();
      continueTurn(state);
    } else if (state.focused !== null) {
      choose(state.focused);
    }
  }

  scene.setInput({ focus, commit: choose, confirm, back: unfocus, blur: unfocus });
  scene.setFigures(figures());
  scene.setActive(activeId());
  publish(offer(state));

  const api: HouseApi = {
    ...scene.hook,
    state: () => ({ ...scene.view(), ...state }),
    choose,
    confirm,
  };

  function mount(ctx: ThreeSceneContext): ThreeSceneHandlers {
    const handlers = scene.mount(ctx);
    window.__betrayalHouse = api;
    return {
      ...handlers,
      dispose: () => {
        handlers.dispose?.();
        delete window.__betrayalHouse;
      },
    };
  }

  return {
    mount,
    api,
    scene,
    roomName,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => state,
  };
}

export type HouseDemo = ReturnType<typeof createHouseDemo>;
