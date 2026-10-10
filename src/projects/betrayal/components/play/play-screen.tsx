"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import { figureFor } from "../../art/explorers/by-character";
import { createHouseScene, type FigureSpec, type FloorChoice, type HouseScene, type SceneHook } from "../../art/house-scene";
import { markingsFromSearch } from "../../art/markings";
import { FLOOR_NAMES, FLOORS } from "../../engine/board";
import type { GameView } from "../../engine/view";
import type { Action } from "../../types";
import { ENGINE } from "../../game";
import { playChoices, type PlaceTarget } from "../../play/choices";
import { lookahead } from "../../play/lookahead";
import { costText, routeRooms, type RoutePreview } from "../../play/preview";
import { due } from "../../play/seat";
import type { PlayStore } from "../../play/store";
import { seatLabel } from "../describe";
import { GHOST, GhostHandles, useGhost, type GhostReadout } from "./ghost-placer";
import { figureColour, seatDot } from "./seat-colour";
import { boxPadButton } from "./box-pad";
import { StatusBox } from "./status-box";
import { paceOf, sceneTarget, slotOf, walkedRooms, type RouteWalk } from "./routes";
import { RaiseWallsButton } from "../raise-walls-button";

/*
 * The game on one device: the house, showing the seat holding the device
 * only what that seat may see, with the places the pending decision offers
 * glowing in it, and one status box: what just happened and why, and what
 * the player can do now, every other decision and ending the turn included.
 */

/** What the e2e tests read of the game, beside the scene's own hook. */
export interface PlayReadout {
  version: number;
  holder: number;
  due: number | null;
  status: GameView["status"];
  pending: { id: string; type: "decision" | "ready"; kind: string | null } | null;
  turnSeat: number | null;
  targets: { id: string; kind: PlaceTarget["kind"]; label: string }[];
  panel: string[];
  canEnd: boolean;
  /** Where each explorer stands, by figure id. */
  rooms: Record<string, string | null>;
  tiles: number;
  /** Each room's way round in the house, by tile id. */
  rotations: Record<string, number>;
  queued: number;
  problem: string | null;
  /** The room tile being placed, as its ghost shows it, or null. */
  ghost: GhostReadout | null;
  /** The focused target's route preview, or null. */
  preview: RoutePreview | null;
  /** The floor the house shows, and whether a figure is walking. */
  floor: FloorChoice;
  walking: boolean;
}

export type PlayHook = SceneHook & { play: () => PlayReadout };

declare global {
  interface Window {
    __betrayalPlay?: PlayHook;
  }
}

/** The pending decision's choices for the seat holding the device, with the turn's routes looked ahead. */
function choicesNow(store: PlayStore) {
  const { state, view, holder } = store.snapshot();
  return playChoices(view, lookahead(ENGINE, state, holder));
}

/** The explorers standing in the house, each with a place of its own in its room. */
function figuresOf(view: GameView): FigureSpec[] {
  const counts = new Map<string, number>();
  return Object.values(view.figures).flatMap((figure) => {
    const room = figure.place?.room;
    if (figure.kind !== "explorer" || !figure.alive || room === undefined) return [];
    const slot = counts.get(room) ?? 0;
    counts.set(room, slot + 1);
    const colour = figureColour(ENGINE, figure.definition);
    return [{ id: figure.id, build: figureFor(figure.definition, colour), colour, room, slot }];
  });
}

/** The figure whose turn it is: the one acting, or the turn's seat's explorer. */
function activeFigure(view: GameView): string | null {
  const turn = view.turn;
  if (!turn) return null;
  if (turn.acting !== null) return turn.acting;
  return Object.values(view.figures).find((figure) => figure.kind === "explorer" && figure.owner === turn.seat)?.id ?? null;
}

function readout(store: PlayStore, scene: HouseScene, ghost: GhostReadout | null, focused: string | null): PlayReadout {
  const { client, holder, view } = store.snapshot();
  const { targets, panel, end } = choicesNow(store);
  const pending = view.pending;
  return {
    version: client.confirmed?.version ?? -1,
    holder,
    due: due(view),
    status: view.status,
    pending: pending && { id: pending.id, type: pending.type, kind: pending.type === "decision" ? pending.kind : null },
    turnSeat: view.turn?.seat ?? null,
    targets: targets.map(({ id, kind, label }) => ({ id, kind, label })),
    panel: panel.map((choice) => choice.label),
    canEnd: end !== null,
    rooms: Object.fromEntries(Object.values(view.figures).filter((f) => f.kind === "explorer").map((f) => [f.id, f.place?.room ?? null])),
    tiles: view.board.tiles.length,
    rotations: Object.fromEntries(view.board.tiles.map((tile) => [tile.tile, tile.rotation])),
    queued: client.queue.length,
    problem: client.problem,
    ghost,
    preview: targets.find((target) => target.id === focused)?.preview ?? null,
    floor: scene.view().floor,
    walking: scene.view().walking,
  };
}

function createScreen(store: PlayStore): {
  scene: HouseScene;
  mount: (ctx: ThreeSceneContext) => ThreeSceneHandlers;
  /** The ghost as last rendered, for the readout: which way round it shows is the screen's own state. */
  ghostRef: { current: GhostReadout | null };
  /** The target in focus as last rendered, for the readout. */
  focusRef: { current: string | null };
} {
  const scene = createHouseScene({ tiles: store.snapshot().view.board.tiles }, { markings: markingsFromSearch(window.location.search) });
  const ghostRef: { current: GhostReadout | null } = { current: null };
  const focusRef: { current: string | null } = { current: null };
  function mount(ctx: ThreeSceneContext): ThreeSceneHandlers {
    const handlers = scene.mount(ctx);
    window.__betrayalPlay = { ...scene.hook, play: () => readout(store, scene, ghostRef.current, focusRef.current) };
    return {
      ...handlers,
      dispose: () => {
        handlers.dispose?.();
        delete window.__betrayalPlay;
      },
    };
  }
  return { scene, mount, ghostRef, focusRef };
}

export function PlayScreen({ store, onLeave }: { store: PlayStore; onLeave: () => void }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const { view, holder, client } = snapshot;
  const [{ scene, mount, ghostRef, focusRef }] = useState(() => createScreen(store));
  const shown = useSyncExternalStore(scene.subscribe, scene.view, scene.view);
  const containerRef = useThreeScene(mount, { antialias: false, maxPixelRatio: 4 });
  const labelRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLElement>(null);
  const [focused, setFocused] = useState<string | null>(null);
  // Input fast-forwards whatever is playing: nothing waits on an animation.
  const act = useCallback(
    (action: Action) => {
      scene.finish();
      store.act(action);
    },
    [scene, store],
  );

  const choices = playChoices(view, lookahead(ENGINE, snapshot.state, holder));
  const { targets, ghost: placing } = choices;
  const ghost = useGhost(view, placing, act);
  const ghostTargets = ghost?.targets ?? [];
  // The ghost holds the focus unless another of its cells has it.
  const live = [...targets, ...ghostTargets].some((target) => target.id === focused) ? focused : ghost ? GHOST : null;

  // The scene keeps the handlers it was given, so they read the latest choices and focus through a ref.
  const end = choices.end;
  const latest = useRef({ targets, live, ghost, end });
  useEffect(() => {
    latest.current = { targets, live, ghost, end };
    ghostRef.current = ghost?.readout ?? null;
    focusRef.current = live;
  });
  const layoutKey = useRef("");
  /** A route just committed, walked once the state it led to shows. */
  const walking = useRef<RouteWalk | null>(null);

  useEffect(() => {
    const commit = (id: string | null) => {
      // Input fast-forwards whatever is playing: nothing waits on an animation.
      scene.finish();
      if (id !== null && latest.current.ghost?.commit(id)) return;
      const target = latest.current.targets.find((candidate) => candidate.id === id);
      if (!target) return;
      walking.current = target.preview && { figure: target.preview.figure, rooms: routeRooms(target.preview) };
      if (store.commit(target.actions) === 0) walking.current = null;
    };
    scene.setInput({
      focus: setFocused,
      commit,
      confirm: () => {
        commit(latest.current.live);
      },
      rotate: (step) => latest.current.ghost?.rotate(step),
      padButton: (button) => {
        const ending = latest.current.end;
        return boxPadButton(boxRef.current, button, ending && (() => act(ending.action)));
      },
    });
    scene.setLabel(labelRef.current);
    scene.setGhostHandles(handlesRef.current);
    return () => {
      scene.setLabel(null);
      scene.setGhostHandles(null);
    };
  }, [scene, store, act]);

  useEffect(() => {
    const key = JSON.stringify(view.board.tiles);
    if (key !== layoutKey.current) {
      layoutKey.current = key;
      scene.setLayout({ tiles: view.board.tiles });
    }
    // The walk starts before the figures are set, so the explorer walks to where the state already has it rather than standing there at once.
    const walk = walking.current;
    walking.current = null;
    const rooms = walk && walkedRooms(walk, view);
    if (walk && rooms) void scene.play({ kind: "walk", figure: walk.figure, route: rooms, slot: slotOf(view, walk.figure, rooms[rooms.length - 1]), pace: paceOf(view, walk.figure) });
    scene.setFigures(figuresOf(view));
    scene.setActive(activeFigure(view));
  }, [scene, view]);

  // After the layout, so a room just placed is in the house before its ghost goes.
  const ghostKey = ghost ? JSON.stringify(ghost.readout) : "";
  useEffect(() => {
    scene.setTargets([...latest.current.targets.map((target) => sceneTarget(target, view)), ...(latest.current.ghost?.targets ?? [])], live);
  }, [scene, view, live, ghostKey]);

  const holderExplorer = Object.values(view.figures).find((figure) => figure.kind === "explorer" && figure.owner === holder);
  const dot = holderExplorer ? seatDot(ENGINE, holderExplorer.definition) : undefined;
  const floors = FLOORS.filter((floor) => view.board.tiles.some((tile) => tile.floor === floor));
  const focusedTarget = [...targets, ...ghostTargets].find((target) => target.id === live);
  const preview = targets.find((target) => target.id === live)?.preview ?? null;

  return (
    <div className="fixed inset-0 bg-(--bt-bg) text-(--bt-ink)">
      <div ref={containerRef} className="absolute inset-0" />
      <div
        ref={labelRef}
        className="pointer-events-none invisible absolute top-0 left-0 rounded border border-(--bt-accent) bg-(--bt-panel) px-2 py-0.5 text-sm whitespace-nowrap"
      >
        {focusedTarget?.label}
        {preview && <span className="ml-1.5 text-xs text-(--bt-muted)">· {costText(preview)}</span>}
      </div>
      <GhostHandles handlesRef={handlesRef} ghost={ghost} />

      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-1.5 p-3 pr-28 text-xs sm:text-sm">
        <span className="pointer-events-auto flex items-center gap-1.5 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 font-semibold">
          {dot && <span className={`inline-block size-2.5 rounded-full ${dot}`} />}
          {seatLabel(view, holder)}
        </span>
        {floors.map((floor) => (
          <button
            key={floor}
            type="button"
            onClick={() => {
              scene.hook.setFloor(floor);
            }}
            className={`pointer-events-auto min-h-10 rounded border px-2 py-1 ${shown.floor === floor ? "border-(--bt-accent) bg-(--bt-room)" : "border-(--bt-line) bg-(--bt-panel)"}`}
          >
            {FLOOR_NAMES[floor]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            scene.camera.recentre();
          }}
          className="pointer-events-auto min-h-10 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1"
        >
          Recentre
        </button>
        <RaiseWallsButton
          raised={shown.wallsRaised}
          raise={scene.hook.raiseWalls}
          className="pointer-events-auto min-h-10 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1 aria-pressed:border-(--bt-accent) aria-pressed:bg-(--bt-room)"
        >
          Walls
        </RaiseWallsButton>
        <button type="button" onClick={onLeave} className="pointer-events-auto min-h-10 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1">
          Leave game
        </button>
      </header>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-start">
        <StatusBox boxRef={boxRef} view={view} holder={holder} problem={client.problem} choices={choices} ghost={ghost} input={shown.input} act={act} preview={preview} />
      </div>
    </div>
  );
}
