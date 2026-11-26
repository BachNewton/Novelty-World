"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Crosshair, Footprints, Grid3x3, MoveUp, LoaderCircle, Rotate3d, Tags, UserMinus, UserPlus, ZoomIn } from "lucide-react";
import { ControlGlyph, type PadGlyph } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import { useFrameStats } from "@/shared/lib/three/frame-stats";
import { characterOrThrow } from "../characters";
import { BINDINGS, keyLabel, PAD_BINDINGS } from "../input/controls";
import { ALONE, type Input, type Lineup } from "../input/lineup";
import { CharacterViewer, type Whereabouts } from "../scene/character-viewer";
import { bench as benchOf } from "../bench";
import { PLAYER_CHARACTER, VILLAGERS } from "../villagers";
import { FAUNA } from "../fauna";
import { MapEditorPanel } from "./map-editor-panel";
import { StagePanel } from "./stage-panel";

const DEFAULT_CLIP = "idle";
/** The sky over the village: Kenney's day sky. */
const DAY_SKY = "/adventure/skyboxes/skybox-day.png";

/** How an input is shown: a pad's buttons, or the keys. */
const kindOf = (input: Input): InputKind => (input === "keys" ? "keyboard-mouse" : "pad");

/** An action's glyphs: its pad controls while a pad was the last thing used, its keys otherwise. */
function Glyphs({ input, keys, pad }: { input: InputKind; keys: readonly (readonly string[])[]; pad: readonly PadGlyph[] }) {
  return input === "pad"
    ? pad.map((glyph) => <ControlGlyph key={glyph} control={{ pad: glyph }} />)
    : keys.map(([code]) => <ControlGlyph key={code} control={{ key: keyLabel(code) }} />);
}

/** The debug view: walk the player about the village, and look at every character and animal on a stage of its own. */
export function Adventure() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Whether the player has loaded. */
  const [shown, setShown] = useState(false);
  /** Where each player stands, while the debug overlay is open: told every frame a player moves, so only the readouts hear it, not the page. */
  const [whereabouts] = useState(whereaboutsStore);
  /** Who plays with what, which each player's hints follow. */
  const [lineup, setLineup] = useState<Lineup>(ALONE);
  /** The viewer once it draws the town, which the map editor edits, and whether the editor is open. */
  const [townViewer, setTownViewer] = useState<CharacterViewer | null>(null);
  const [editing, setEditing] = useState(false);
  /** Whether the character and animal viewer is open. */
  const [viewing, setViewing] = useState(false);
  useFrameStats();

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const viewer = new CharacterViewer(container, setFailure, whereabouts.set, setLineup);
    // The probe for tools: they drive the camera to exact views, count and price the frame. Never in a production build.
    if (process.env.NODE_ENV === "development") {
      Object.assign(window, {
        __adventure: {
          lookFrom: viewer.lookFrom.bind(viewer),
          players: viewer.players.bind(viewer),
          drawn: viewer.drawn.bind(viewer),
          loaded: viewer.loaded.bind(viewer),
          leaveOut: viewer.leaveOut.bind(viewer),
          gpuTime: viewer.gpuTime.bind(viewer),
        },
      });
    }
    viewer.start().then(
      (got) => {
        if (got === null) return;
        // `?view=pieces` is a kit's piece bench, every piece named, in place of the town: the town kit's, or with `&kit=nature` the Nature Kit's.
        const search = new URLSearchParams(window.location.search);
        const bench = search.get("view") === "pieces";
        const kit = search.get("kit") === "nature" ? "nature" : "town";
        if (bench) viewer.placeBench(benchOf(kit)).catch((error: unknown) => setFailure(String(error)));
        else setTownViewer(viewer);
        if (!bench) {
          viewer.showSky(DAY_SKY).catch((error: unknown) => setFailure(String(error)));
          viewer.placeVillagers(VILLAGERS).catch((error: unknown) => setFailure(String(error)));
          viewer.placeAnimals(FAUNA).catch((error: unknown) => setFailure(String(error)));
        }
        viewer.show(characterOrThrow(PLAYER_CHARACTER), DEFAULT_CLIP).then(
          () => setShown(true),
          (error: unknown) => setFailure(String(error)),
        );
      },
      (error: unknown) => setFailure(String(error)),
    );
    return () => {
      setTownViewer(null);
      viewer.dispose();
    };
    // The store is made once, with the page.
  }, [whereabouts]);

  const loading = failure === null && !shown;

  return (
    <div className="fixed inset-0 bg-surface-primary">
      <div ref={containerRef} className="absolute inset-0" />
      {townViewer !== null && (
        <>
          <div className={viewing ? "hidden" : "contents"}>
            <MapEditorPanel viewer={townViewer} onEditing={setEditing} onFailure={setFailure} />
          </div>
          <StagePanel viewer={townViewer} input={kindOf(lineup.first)} lineup={lineup} editing={editing} onOpen={setViewing} onFailure={setFailure} />
        </>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 text-xs text-text-muted">
        {loading && <LoaderCircle aria-label="Loading" className="size-4 animate-spin" />}
      </div>
      <div className={`pointer-events-none absolute inset-0 flex ${editing || viewing ? "hidden" : ""}`}>
        {(lineup.second === null ? [lineup.first] : [lineup.first, lineup.second]).map((input, player) => (
          <div key={player} className={`relative flex-1 ${player === 1 ? "border-l-2 border-border-default" : ""}`}>
            <Hints input={kindOf(input)} join={lineup.second === null ? (lineup.first === "keys" ? "pad" : "either") : player === 1 ? "leave" : null} />
            <Readout store={whereabouts} player={player} split={lineup.second !== null} />
          </div>
        ))}
      </div>
      {failure !== null && (
        <div role="alert" className="absolute inset-x-3 bottom-10 rounded-md border border-brand-pink bg-surface-elevated p-3 text-sm text-text-primary">
          {failure}
        </div>
      )}
    </div>
  );
}

/**
 * One player's hints, in the bottom right of their part of the screen, with
 * how a second player joins while one plays alone (on a pad while the first
 * plays on the keyboard; on the keyboard or another pad while they play on a
 * pad), and how the second leaves, in their half.
 */
function Hints({ input, join }: { input: InputKind; join: "pad" | "either" | "leave" | null }) {
  return (
    <div className="absolute right-3 bottom-3 flex flex-wrap items-center justify-end gap-3 text-xs text-text-muted">
      <span className="flex items-center gap-0.5" title="Walk">
        <span className="sr-only">Walk:</span>
        <Glyphs input={input} keys={[BINDINGS.ahead, BINDINGS.left, BINDINGS.back, BINDINGS.right]} pad={[PAD_BINDINGS.walk]} />
      </span>
      <span className="flex items-center gap-1" title="Sprint, while walking">
        <span className="sr-only">Sprint:</span>
        <Glyphs input={input} keys={[BINDINGS.sprint]} pad={[PAD_BINDINGS.sprint]} />
        <Footprints aria-hidden className="size-4" />
      </span>
      <span className="flex items-center gap-0.5" title="Turn the camera">
        <span className="sr-only">Turn the camera:</span>
        <Glyphs input={input} keys={[BINDINGS.turnLeft, BINDINGS.tiltUp, BINDINGS.tiltDown, BINDINGS.turnRight]} pad={[PAD_BINDINGS.camera]} />
        <Rotate3d aria-hidden className="ml-0.5 size-4" />
      </span>
      <span className="flex items-center gap-0.5" title="Zoom">
        <span className="sr-only">Zoom:</span>
        <Glyphs input={input} keys={[BINDINGS.zoomIn, BINDINGS.zoomOut]} pad={[PAD_BINDINGS.zoomIn, PAD_BINDINGS.zoomOut]} />
        <ZoomIn aria-hidden className="ml-0.5 size-4" />
      </span>
      <span className="flex items-center gap-1" title="Name what's near, as the code does, and number the cells: press to show or hide">
        <span className="sr-only">Debug overlay:</span>
        <Glyphs input={input} keys={[BINDINGS.overlay]} pad={[PAD_BINDINGS.overlay]} />
        <Tags aria-hidden className="size-4" />
      </span>
      <span className="flex items-center gap-1" title="Jump">
        <span className="sr-only">Jump:</span>
        <Glyphs input={input} keys={[BINDINGS.jump]} pad={[PAD_BINDINGS.jump]} />
        <MoveUp aria-hidden className="size-4" />
      </span>
      {(join === "pad" || join === "either") && (
        <span className="flex items-center gap-1" title={join === "pad" ? "A second player joins: press on another controller" : "A second player joins: press on the keyboard, or on another controller"}>
          <span className="sr-only">Second player joins:</span>
          {join === "either" && <ControlGlyph control={{ key: keyLabel(BINDINGS.join[0]) }} />}
          <ControlGlyph control={{ pad: PAD_BINDINGS.join }} />
          <UserPlus aria-hidden className="size-4" />
        </span>
      )}
      {join === "leave" && (
        <span className="flex items-center gap-1" title="Leave the game">
          <span className="sr-only">Leave:</span>
          <Glyphs input={input} keys={[BINDINGS.join]} pad={[PAD_BINDINGS.join]} />
          <UserMinus aria-hidden className="size-4" />
        </span>
      )}
    </div>
  );
}

/** Where the players stand, held outside React: the viewer tells it, and each readout listens for its own player. */
interface WhereaboutsStore {
  get: () => Whereabouts[] | null;
  set: (where: Whereabouts[] | null) => void;
  subscribe: (listener: () => void) => () => void;
}

function whereaboutsStore(): WhereaboutsStore {
  let now: Whereabouts[] | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => now,
    set: (where) => {
      now = where;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Where a player stands, while the debug overlay is open: at the top of the screen alone, and over their hints on half of it. */
function Readout({ store, player, split }: { store: WhereaboutsStore; player: number; split: boolean }) {
  const where = useSyncExternalStore(store.subscribe, () => store.get()?.[player], () => undefined);
  if (where === undefined) return null;
  return (
    <div
      className={`absolute flex items-center gap-3 rounded-md border border-border-default bg-surface-elevated px-3 py-1.5 font-mono text-sm text-text-primary ${
        split ? "right-3 bottom-12" : "top-3 left-1/2 -translate-x-1/2"
      }`}
    >
      <span className="flex items-center gap-1.5" title="The cell you stand in, by its −x, −z corner, as the code names cells">
        <Grid3x3 aria-label="Cell" className="size-4 text-text-secondary" />
        {where.cell.join(", ")}
      </span>
      <span className="flex items-center gap-1.5" title="Exactly where you stand, x and z">
        <Crosshair aria-label="Position" className="size-4 text-text-secondary" />
        {where.at.map((v) => v.toFixed(2)).join(", ")}
      </span>
    </div>
  );
}
