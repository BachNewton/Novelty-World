"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { StandardButton } from "@/shared/lib/gamepad";
import { useThreeScene } from "@/shared/lib/three/use-three-scene";
import type { ThreeSceneContext, ThreeSceneHandlers } from "@/shared/lib/three/use-three-scene";
import { figureFor } from "../../art/explorers/by-character";
import { houseFloors, loadFloors } from "../../art/room-floor";
import type { HouseMood } from "../../art/house-mood";
import { createHouseScene, type FigureSpec, type FloorChoice, type HouseScene, type SceneHook } from "../../art/house-scene";
import { FLOOR_NAMES, FLOORS } from "../../engine/board";
import { eventsFor, type GameView } from "../../engine/view";
import type { Action, FigureId, FloorId } from "../../types";
import { ENGINE } from "../../game";
import { NO_CHOICES, playChoices, type PlaceTarget, type PlayChoices } from "../../play/choices";
import { lookahead } from "../../play/lookahead";
import { costText, type RoutePreview } from "../../play/preview";
import { explorerActions } from "../../play/sheet";
import type { Spots } from "../../play/spots";
import { due } from "../../play/seat";
import type { PlaySnapshot, PlayStore } from "../../play/store";
import { seatLabel } from "../describe";
import { FOCUS_A_MASK, PAD_FOCUS, Prompt } from "../prompts";
import { GHOST, GhostHandles, useGhost, type GhostReadout } from "./ghost-placer";
import { figureColour, seatDot, sideMark } from "./seat-colour";
import { controlsOf, enterLayer, layerHeight, leaveLayer, padFocused, padPress, topLayer } from "./pad-focus";
import { StatusBox } from "./status-box";
import { freedText, useSeatInputs, useSeatsGate } from "./seats-panel";
import { GameMenu } from "./game-menu";
import type { PadSeats } from "./use-pads";
import { sceneTarget } from "./routes";
import { createPresenting, skipOrAnswer, SPEEDS, type Presented, type Presenting, type Speed } from "./presenting";
import { RaiseWallsButton } from "../raise-walls-button";
import { CardBeat } from "./card-beat";
import { ExplorerSheet, FigureMarks, markedExplorers, StatsButton } from "./figure-marks";
import { TradeSheet } from "./trade-sheet";
import { ClusterCounts, ThingReader, ThingTag } from "./thing-reader";
import type { ShownThing } from "../../play/things";
import { useStatsHold } from "./stats-hold";
import { BakeDebug } from "../../art/bake-debug";
import { BakeIndicator } from "../../art/bake-indicator";
import { AimDebug } from "./aim-debug";

/*
 * The game on one device: the house, showing the seat holding the device
 * only what that seat may see, with the places the pending decision offers
 * glowing in it, and one status box: what just happened and why, and what
 * the player can do now, every other decision and ending the turn included.
 * Over it open the player's explorer, a trade being built, and the game menu.
 *
 * A controller has one focus: on a choice in the house, or on a button of
 * the box or of whatever is open over the house (`pad-focus.ts`). Each of
 * its controls means one thing everywhere (`input/controls.ts`).
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
  /** Each room's floor, by tile id. */
  floors: Record<string, FloorId>;
  queued: number;
  problem: string | null;
  /** The room tile being placed, as its ghost shows it, or null. */
  ghost: GhostReadout | null;
  /** The focused target's route preview, or null. */
  preview: RoutePreview | null;
  /** The floor the house shows, and whether a figure is walking. */
  floor: FloorChoice;
  walking: boolean;
  /** Whether a room a rule moved is being carried to its new cell. */
  moving: boolean;
  /** Where each explorer stands: its room, its side of a barrier room, and its place there, in the room's own frame. */
  spots: Spots;
  /** The status box's line held as a moment, by its event's id, or null. */
  moment: string | null;
  /** The house's light as a whole: the haunt's once it is revealed. */
  mood: HouseMood;
  /** Beats are playing, so the pending decision's choices wait. */
  playing: boolean;
  /** End turn is being held, its ring filling. */
  endHold: boolean;
  /** What is open over the house: an explorer's sheet (`explorer:<figure>`), a trade (`trade:<figure>`), a thing's reader (`thing:<id>`), or null. */
  sheet: string | null;
  /** The things living in the rooms, as they show. */
  things: { id: string; kind: ShownThing["kind"]; room: string; name: string; stands: readonly string[] }[];
  menu: boolean;
}

export type PlayHook = SceneHook & { play: () => PlayReadout };

declare global {
  interface Window {
    __betrayalPlay?: PlayHook;
  }
}

/** The screen as last rendered, for the readout: the game, the presentation
 *  and the choices it showed, and its own state. A readout of the store or the
 *  presenter as they are now would run ahead of the screen, whose choices
 *  reach the house only once a render commits. */
interface ScreenReadout {
  game: { snapshot: PlaySnapshot; presented: Presented; choices: PlayChoices };
  ghost: GhostReadout | null;
  focused: string | null;
  endHold: boolean;
  sheet: string | null;
  menu: boolean;
  things: readonly ShownThing[];
}

/** The explorers standing in the house, each in its place. */
function figuresOf(view: GameView, spots: Spots): FigureSpec[] {
  return Object.values(view.figures).flatMap((figure) => {
    const spot = spots[figure.id];
    if (!spot) return [];
    const colour = figureColour(ENGINE, figure.definition);
    return [{ id: figure.id, build: figureFor(figure.definition, colour), colour, mark: sideMark(view, figure.owner), room: spot.room, at: [spot.x, spot.z] }];
  });
}

/** The events fed to the screen so far, as the seat holding the device may see them. */
function eventsNow(store: PlayStore) {
  const { state, holder, client } = store.snapshot();
  return eventsFor(ENGINE, state, holder, client.feed);
}

const SPEED_KEY = "nw:betrayal:speed";

const isSpeed = (value: string | null): value is Speed => value !== null && value in SPEEDS;

/** The beats' speed this device last chose. Storage may be unavailable (a private window): the speed is then normal. */
function savedSpeed(): Speed {
  try {
    const saved = localStorage.getItem(SPEED_KEY);
    return isSpeed(saved) ? saved : "normal";
  } catch {
    return "normal";
  }
}

function saveSpeed(speed: Speed) {
  try {
    localStorage.setItem(SPEED_KEY, speed);
  } catch {
    // Storage may be unavailable (a private window): the speed then lasts as long as the page.
  }
}

function readout(scene: HouseScene, screen: ScreenReadout): PlayReadout {
  const { snapshot, presented, choices } = screen.game;
  const { client, holder, view } = snapshot;
  const { targets, panel, end } = choices;
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
    floors: Object.fromEntries(view.board.tiles.map((tile) => [tile.tile, tile.floor])),
    queued: client.queue.length,
    problem: client.problem,
    ghost: screen.ghost,
    preview: targets.find((target) => target.id === screen.focused)?.preview ?? null,
    floor: scene.view().floor,
    walking: scene.view().walking,
    moving: scene.view().moving,
    spots: presented.spots,
    moment: presented.moment?.event ?? null,
    mood: scene.mood(),
    playing: presented.playing,
    endHold: screen.endHold,
    sheet: screen.sheet,
    menu: screen.menu,
    things: screen.things.map((thing) => ({ id: thing.id, kind: thing.kind, room: thing.room, name: thing.name, stands: thing.things })),
  };
}

function createScreen(store: PlayStore): {
  scene: HouseScene;
  presenting: Presenting;
  mount: (ctx: ThreeSceneContext) => ThreeSceneHandlers;
  /** The screen's own state as last rendered, for the readout. */
  screenRef: { current: ScreenReadout };
} {
  const scene = createHouseScene({ tiles: store.snapshot().view.board.tiles });
  const presenting = createPresenting(scene, figuresOf, { place: houseFloors, load: loadFloors });
  const screenRef: { current: ScreenReadout } = {
    current: { game: { snapshot: store.snapshot(), presented: presenting.snapshot(), choices: NO_CHOICES }, ghost: null, focused: null, endHold: false, sheet: null, menu: false, things: [] },
  };
  function mount(ctx: ThreeSceneContext): ThreeSceneHandlers {
    const handlers = scene.mount(ctx);
    window.__betrayalPlay = { ...scene.hook, play: () => readout(scene, screenRef.current) };
    return {
      ...handlers,
      dispose: () => {
        handlers.dispose?.();
        delete window.__betrayalPlay;
      },
    };
  }
  return { scene, presenting, mount, screenRef };
}

/** What is open over the house, on the decision it was opened on: it closes when the decision changes. */
type Sheet =
  | { kind: "explorer"; tab: FigureId; decision: string | null }
  | { kind: "trade"; with: FigureId; decision: string | null }
  | { kind: "thing"; id: string; decision: string | null };

/** The pad's d-pad, A and B: what a panel over the house takes from it. */
const NAVIGATION = new Set<StandardButton>(["DpadUp", "DpadDown", "DpadLeft", "DpadRight", "A", "B"]);
/** The game menu's layer, over everything: any pad works it. */
const MENU_LAYER = 3;

export function PlayScreen({ store, pads, onLeave }: { store: PlayStore; pads: PadSeats; onLeave: () => void }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const { view, holder, client } = snapshot;
  const [{ scene, presenting, mount, screenRef }] = useState(() => createScreen(store));
  const shown = useSyncExternalStore(scene.subscribe, scene.view, scene.view);
  const presented = useSyncExternalStore(presenting.subscribe, presenting.snapshot, presenting.snapshot);
  const [speed, setSpeed] = useState(savedSpeed);
  useEffect(() => {
    presenting.setSpeed(speed);
  }, [presenting, speed]);
  // Several pads on one device: only the acting seat's pads act, and each seat's hints follow its own last input.
  const gate = useSeatsGate(pads, holder);
  const { padMay, padActs, setMenuOpen } = gate;
  useSeatInputs(holder, shown.input, pads, scene.setInputKind);
  const containerRef = useThreeScene(mount, { antialias: false, maxPixelRatio: 4 });
  const rootRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLElement>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const stats = useStatsHold(padMay);
  // Input fast-forwards whatever is playing: nothing waits on an animation.
  const act = useCallback(
    (action: Action) => {
      skipOrAnswer(presenting, () => {
        store.act(action);
      });
    },
    [presenting, store],
  );

  // The pending decision's choices show once the beats leading to them are over.
  const choices = presented.playing ? NO_CHOICES : playChoices(view, lookahead(ENGINE, snapshot.state, holder));
  const { targets, ghost: placing } = choices;
  const ghost = useGhost(view, placing, act);
  const ghostTargets = ghost?.targets ?? [];
  // The things in the rooms, as presented: pointing at one names it, and choosing it reads it.
  const { inRooms, things } = presented;
  // The ghost holds the focus unless another of its cells, or a thing, has it.
  const live = [...targets, ...ghostTargets, ...things].some((target) => target.id === focused) ? focused : ghost ? GHOST : null;
  const end = choices.end;

  // What is open over the house, while the decision it was opened on stands.
  const decision = view.pending?.id ?? null;
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const open = sheet !== null && sheet.decision === decision ? sheet : null;
  const explorers = markedExplorers(view, presented.spots);
  const yours = explorers.find((figure) => figure.owner === holder) ?? null;
  // The turn's actions are the acting explorer's, on its own tab.
  const acting = view.pending?.type === "decision" && view.pending.kind === "turn" && yours !== null && view.turn?.acting === yours.id ? yours : null;
  const actions = acting ? { figure: acting.id, rows: explorerActions(acting.cards, choices.panel) } : null;
  const tab = open?.kind === "explorer" ? (explorers.find((figure) => figure.id === open.tab) ?? null) : null;
  const trade = open?.kind === "trade" ? (actions?.rows.trades.find((row) => row.with === open.with) ?? null) : null;
  const reading = open?.kind === "thing" ? (things.find((thing) => thing.id === open.id) ?? null) : null;
  const pickUps = new Map((actions?.rows.floor ?? []).map(({ card, pickUp }) => [card, pickUp]));
  const openTab = (figure: FigureId | null) => {
    setSheet(figure === null ? null : { kind: "explorer", tab: figure, decision });
  };

  // End turn is a hold: X, Backspace. Let go too soon, it says so.
  const [ending, setEnding] = useState(false);
  const [tapped, setTapped] = useState<string | null>(null);
  const held = useRef(false);
  const endHold = {
    holding: ending && end !== null,
    tapped: tapped !== null && tapped === decision,
    // One hold ends one turn: the next turn's End turn waits for a new press.
    onHeld: () => {
      held.current = true;
      setEnding(false);
      if (end) act(end.action);
    },
  };

  // The scene keeps the handlers it was given, so they read the latest state through a ref.
  const latest = useRef({ targets, live, ghost, end, decision, yours, open, things });
  useEffect(() => {
    latest.current = { targets, live, ghost, end, decision, yours, open, things };
    screenRef.current = {
      game: { snapshot, presented, choices },
      ghost: ghost?.readout ?? null,
      focused: live,
      endHold: endHold.holding,
      sheet: open === null ? null : open.kind === "explorer" ? `explorer:${open.tab}` : open.kind === "trade" ? `trade:${open.with}` : `thing:${open.id}`,
      menu: gate.menuOpen,
      things,
    };
  });
  const layoutKey = useRef("");

  useEffect(() => {
    const commit = (id: string | null) => {
      // An input while beats play only skips them.
      skipOrAnswer(presenting, () => {
        if (id !== null && latest.current.ghost?.commit(id)) return;
        // Choosing a thing reads it: its reader opens over it.
        if (id !== null && latest.current.things.some((thing) => thing.id === id)) {
          setSheet({ kind: "thing", id, decision: latest.current.decision });
          return;
        }
        const target = latest.current.targets.find((candidate) => candidate.id === id);
        if (target) store.commit(target.actions);
      });
    };
    /** The highest panel open over the house, if any. */
    const over = () => {
      const layer = rootRef.current && topLayer(rootRef.current);
      return layer && layerHeight(layer) > 0 ? layer : null;
    };
    scene.setInput({
      focus: setFocused,
      commit,
      confirm: () => {
        commit(latest.current.live);
      },
      back: () => {
        const layer = over();
        if (layer) padPress(layer, "B");
      },
      cycle: (step) => {
        const placer = latest.current.ghost;
        if (!placer) return false;
        placer.step(step);
        return true;
      },
      explorer: () => {
        const { yours: mine, open: was, decision: now } = latest.current;
        if (was) setSheet(null);
        else if (mine) setSheet({ kind: "explorer", tab: mine.id, decision: now });
      },
      menu: () => {
        setMenuOpen(!gate.menuOpen);
      },
      endTurn: (on) => {
        if (on) {
          held.current = false;
          setEnding(true);
          return;
        }
        setEnding(false);
        if (!held.current && latest.current.end) setTapped(latest.current.decision);
      },
      covered: () => over() !== null,
      padMay,
      padButton: (button, pad) => {
        const root = rootRef.current;
        if (!root) return false;
        const layer = topLayer(root);
        if (layer && layerHeight(layer) >= MENU_LAYER) {
          padPress(layer, button);
          return true;
        }
        // An idle pad does nothing but open the menu.
        if (!padActs(pad)) return true;
        if (layer && layerHeight(layer) > 0) {
          if (!NAVIGATION.has(button)) return false;
          padPress(layer, button);
          return true;
        }
        const box = boxRef.current;
        if (box && padFocused(box)) {
          if (!NAVIGATION.has(button)) return false;
          padPress(box, button, () => {
            leaveLayer(box);
          });
          return true;
        }
        if (button === "DpadDown") {
          if (box) enterLayer(box, "[data-now]");
          return true;
        }
        return button === "DpadUp";
      },
    });
    scene.setLabel(labelRef.current);
    scene.setGhostHandles(handlesRef.current);
    return () => {
      scene.setLabel(null);
      scene.setGhostHandles(null);
    };
  }, [scene, presenting, store, act, padMay, padActs, setMenuOpen, gate.menuOpen, screenRef]);

  // Over the house, Tab goes round the panel's own buttons.
  useEffect(() => {
    const tab = (event: KeyboardEvent) => {
      const root = rootRef.current;
      const layer = root && topLayer(root);
      if (event.code !== "Tab" || !layer || layerHeight(layer) === 0) return;
      event.preventDefault();
      const controls = controlsOf(layer);
      if (controls.length === 0) return;
      const at = controls.findIndex((control) => control === document.activeElement);
      const step = event.shiftKey ? -1 : 1;
      controls[at < 0 ? 0 : (at + step + controls.length) % controls.length].focus();
    };
    window.addEventListener("keydown", tab);
    return () => {
      window.removeEventListener("keydown", tab);
    };
  }, []);

  useEffect(() => {
    const key = JSON.stringify(view.board.tiles);
    if (key !== layoutKey.current) {
      layoutKey.current = key;
      scene.setLayout({ tiles: view.board.tiles });
    }
    presenting.show(view, eventsNow(store));
  }, [scene, presenting, store, view]);

  // After the layout, so a room just placed is in the house before its ghost goes.
  const ghostKey = ghost ? JSON.stringify(ghost.readout) : "";
  useEffect(() => {
    scene.setTargets([...latest.current.targets.map((target) => sceneTarget(target, presented.spots, houseFloors, presented.clusters)), ...(latest.current.ghost?.targets ?? [])], live);
    // The choices show once the beats leading to them are over.
  }, [scene, view, live, ghostKey, presented.spots, presented.clusters, presented.playing]);

  const toldIds = new Set(presented.told);
  const told = eventsFor(ENGINE, snapshot.state, holder, client.feed).filter((event) => toldIds.has(event.id));
  const dot = yours ? seatDot(ENGINE, yours.definition) : undefined;
  const floors = FLOORS.filter((floor) => view.board.tiles.some((tile) => tile.floor === floor));
  const focusedTarget = [...targets, ...ghostTargets].find((target) => target.id === live);
  const focusedThing = things.find((thing) => thing.id === live);
  const preview = targets.find((target) => target.id === live)?.preview ?? null;
  const input = shown.input;
  const button = "pointer-events-auto inline-flex min-h-10 items-center gap-1.5 rounded border border-(--bt-line) bg-(--bt-panel) px-2 py-1";

  return (
    <div ref={rootRef} style={{ "--bt-focus-a": FOCUS_A_MASK } as CSSProperties} className={`fixed inset-0 bg-(--bt-bg) text-(--bt-ink) ${input === "pad" ? PAD_FOCUS : ""}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {/* In the corner the header leaves clear. */}
      <BakeIndicator bakes={scene.bakes} className="absolute top-3 right-2" />
      <BakeDebug bakes={scene.bakes} />
      <div
        ref={labelRef}
        role="tooltip"
        className="pointer-events-none invisible absolute top-0 left-0 rounded border border-(--bt-accent) bg-(--bt-panel) px-2 py-0.5 text-sm w-max max-w-[calc(100%-1rem)]"
      >
        {focusedTarget?.label}
        {focusedThing && <ThingTag thing={focusedThing} input={shown.input} />}
        {preview && <span className="ml-1.5 text-xs text-(--bt-muted)">· {costText(preview)}</span>}
      </div>
      <GhostHandles handlesRef={handlesRef} ghost={ghost} />
      <ClusterCounts scene={scene} clusters={presented.clusters} shown={things} />
      <AimDebug scene={scene} named={[...targets, ...ghostTargets, ...things]} />
      <FigureMarks scene={scene} view={view} spots={presented.spots} told={told} statsHeld={stats.held} tab={tab?.id ?? null} openTab={openTab} />

      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-1.5 p-3 pr-28 text-xs sm:text-sm">
        {/* The seat holding the device: its explorer's character card, as the mark on the figure opens it. */}
        <button
          type="button"
          aria-label={`${seatLabel(view, holder)}: character card`}
          aria-expanded={yours !== null && tab?.id === yours.id}
          disabled={yours === null}
          onClick={() => {
            if (yours) openTab(tab?.id === yours.id ? null : yours.id);
          }}
          className={`${button} font-semibold aria-expanded:border-(--bt-accent)`}
        >
          {dot && <span className={`inline-block size-2.5 rounded-full ${dot}`} />}
          {seatLabel(view, holder)}
        </button>
        <span className="flex items-center gap-1">
          <Prompt meaning="floor-down" input={input} size={18} />
          {floors.map((floor) => (
            <button
              key={floor}
              type="button"
              onClick={() => {
                scene.hook.setFloor(floor);
              }}
              className={`${button} ${shown.floor === floor ? "border-(--bt-accent) bg-(--bt-room)" : ""}`}
            >
              {FLOOR_NAMES[floor]}
            </button>
          ))}
          <Prompt meaning="floor-up" input={input} size={18} />
        </span>
        <button
          type="button"
          onClick={() => {
            scene.camera.recentre();
          }}
          className={button}
        >
          Recentre
          <Prompt meaning="recentre" input={input} size={16} />
        </button>
        <RaiseWallsButton raised={shown.wallsRaised} raise={scene.hook.raiseWalls} className={`${button} aria-pressed:border-(--bt-accent) aria-pressed:bg-(--bt-room)`}>
          Walls
          <Prompt meaning="walls" input={input} size={16} />
        </RaiseWallsButton>
        <StatsButton held={stats.held} hold={stats.hold} input={input} className={`${button} aria-pressed:border-(--bt-accent) aria-pressed:bg-(--bt-room)`} />
        <button
          type="button"
          aria-expanded={gate.menuOpen}
          onClick={() => {
            setMenuOpen(!gate.menuOpen);
          }}
          className={button}
        >
          Menu
          <Prompt meaning="menu" input={input} size={16} />
        </button>
      </header>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-start">
        <StatusBox
          boxRef={boxRef}
          view={view}
          told={told}
          moment={presented.moment}
          playing={presented.playing}
          skip={presenting.skip}
          holder={holder}
          problem={client.problem}
          choices={choices}
          ghost={ghost}
          input={input}
          act={act}
          preview={preview}
          notice={freedText(view, pads)}
          openMenu={() => {
            setMenuOpen(true);
          }}
          endHold={endHold}
          explorer={yours && { count: actions?.rows.count ?? 0 }}
          openExplorer={() => {
            if (yours) openTab(yours.id);
          }}
          openTrade={(figure) => {
            setSheet({ kind: "trade", with: figure, decision });
          }}
        />
      </div>
      <CardBeat scene={scene} moment={presented.moment} told={told} spots={presented.spots} input={input} playing={presented.playing} goOn={presenting.goOn} />
      {tab && (
        <ExplorerSheet
          scene={scene}
          view={view}
          explorers={explorers}
          tab={tab}
          setTab={openTab}
          actions={actions}
          act={act}
          openTrade={(figure) => {
            setSheet({ kind: "trade", with: figure, decision });
          }}
          input={input}
          close={() => {
            setSheet(null);
          }}
        />
      )}
      {reading && (
        <ThingReader
          key={reading.id}
          scene={scene}
          thing={reading}
          things={inRooms}
          pickUps={pickUps}
          act={act}
          input={input}
          close={() => {
            setSheet(null);
          }}
        />
      )}
      {trade && (
        <TradeSheet
          key={trade.with}
          view={view}
          row={trade}
          act={act}
          input={input}
          close={() => {
            setSheet(null);
          }}
        />
      )}
      {gate.menuOpen && (
        <GameMenu
          view={view}
          pads={pads}
          speed={speed}
          setSpeed={(next) => {
            setSpeed(next);
            saveSpeed(next);
          }}
          onLeave={onLeave}
          input={input}
          close={() => {
            setMenuOpen(false);
          }}
        />
      )}
    </div>
  );
}
