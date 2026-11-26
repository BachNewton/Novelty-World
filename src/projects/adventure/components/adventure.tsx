"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Clapperboard, Crosshair, Footprints, Grid3x3, MoveUp, Hand as HandIcon, LoaderCircle, Rotate3d, Sword, Tags, UserMinus, UserPlus, ZoomIn } from "lucide-react";
import { ControlGlyph, type PadGlyph } from "@/shared/components/prompts";
import type { InputKind } from "@/shared/lib/input";
import { useFrameStats } from "@/shared/lib/three/frame-stats";
import { characterOrThrow } from "../characters";
import { BINDINGS, keyLabel, PAD_BINDINGS } from "../input/controls";
import { ALONE, type Input, type Lineup } from "../input/lineup";
import { CharacterViewer, type Backend, type Whereabouts } from "../scene/character-viewer";
import { bench as benchOf } from "../bench";
import { groundOf } from "../ground";
import { PATHS } from "../town";
import { PLAYER_CHARACTER, VILLAGERS } from "../villagers";
import { HANDS, WEAPONS, weaponOrThrow, type Hand } from "../weapons";
import { MapEditorPanel } from "./map-editor-panel";

const DEFAULT_CLIP = "idle";
/** The sky over the village: Kenney's day sky. */
const DAY_SKY = "/adventure/skyboxes/skybox-day.png";

/** What a character holds: a weapon's id, or none, and in which hand. */
interface Holding {
  weapon: string | null;
  hand: Hand;
}

/** What the address asks for: `?weapon=sword&hand=left` opens holding exactly that. */
function fromAddress(): Holding {
  const search = new URLSearchParams(window.location.search);
  const weapon = search.get("weapon");
  const hand = search.get("hand");
  return {
    weapon: WEAPONS.find((w) => w.id === weapon)?.id ?? null,
    hand: HANDS.find((h) => h === hand) ?? "right",
  };
}

function toAddress(changes: Record<string, string | null>): void {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  window.history.replaceState(null, "", url);
}

function hold(viewer: CharacterViewer, holding: Holding, failure: (message: string) => void): void {
  viewer.hold(holding.weapon === null ? null : weaponOrThrow(holding.weapon), holding.hand).catch((error: unknown) => failure(String(error)));
  toAddress({ weapon: holding.weapon, hand: holding.weapon === null ? null : holding.hand });
}

interface Showing {
  clips: readonly string[];
  clip: string;
}

/** A picker's choice. The picker lets go of the keyboard once it is made, so WASD walks again rather than choosing an option. */
function chosen(event: ChangeEvent<HTMLSelectElement>): string {
  event.currentTarget.blur();
  return event.currentTarget.value;
}

/** How an input is shown: a pad's buttons, or the keys. */
const kindOf = (input: Input): InputKind => (input === "keys" ? "keyboard-mouse" : "pad");

/** An action's glyphs: its pad controls while a pad was the last thing used, its keys otherwise. */
function Glyphs({ input, keys, pad }: { input: InputKind; keys: readonly (readonly string[])[]; pad: readonly PadGlyph[] }) {
  return input === "pad"
    ? pad.map((glyph) => <ControlGlyph key={glyph} control={{ pad: glyph }} />)
    : keys.map(([code]) => <ControlGlyph key={code} control={{ key: keyLabel(code) }} />);
}

const SELECT_CLASS =
  "min-w-0 flex-1 rounded-md border border-border-default bg-surface-elevated px-2 py-1.5 text-sm text-text-primary hover:border-border-hover disabled:opacity-50";

/** The debug view: walk the player about the village, and pick their animation and what they hold. */
export function Adventure() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CharacterViewer | null>(null);
  const [backend, setBackend] = useState<Backend | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** The player's clips and the one playing, once their character has loaded. */
  const [showing, setShowing] = useState<Showing | null>(null);
  const [holding, setHolding] = useState<Holding>({ weapon: null, hand: "right" });
  /** Where each player stands, while the debug overlay is open. */
  const [whereabouts, setWhereabouts] = useState<Whereabouts[] | null>(null);
  /** Who plays with what, which each player's hints follow. */
  const [lineup, setLineup] = useState<Lineup>(ALONE);
  /** The viewer once it draws the town, which the map editor edits, and whether the editor is open. */
  const [townViewer, setTownViewer] = useState<CharacterViewer | null>(null);
  const [editing, setEditing] = useState(false);
  useFrameStats();

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const viewer = new CharacterViewer(
      container,
      setFailure,
      (clip) => {
        setShowing((now) => now && { ...now, clip });
      },
      setWhereabouts,
      setLineup,
    );
    viewerRef.current = viewer;
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
        setBackend(got);
        // `?view=pieces` is a kit's piece bench, every piece named, in place of the town: the town kit's, or with `&kit=nature` the Nature Kit's.
        const search = new URLSearchParams(window.location.search);
        const bench = search.get("view") === "pieces";
        const kit = search.get("kit") === "nature" ? "nature" : "town";
        if (bench) viewer.placeBench(benchOf(kit)).catch((error: unknown) => setFailure(String(error)));
        else setTownViewer(viewer);
        if (!bench) {
          viewer.showSky(DAY_SKY).catch((error: unknown) => setFailure(String(error)));
          viewer.placeGround(groundOf(PATHS)).catch((error: unknown) => setFailure(String(error)));
          viewer.placeVillagers(VILLAGERS).catch((error: unknown) => setFailure(String(error)));
        }
        viewer.show(characterOrThrow(PLAYER_CHARACTER), DEFAULT_CLIP).then(
          (shown) => {
            // Null when the viewer closed first.
            if (shown === null) return;
            setShowing({ clips: shown.clips, clip: shown.playing });
          },
          (error: unknown) => setFailure(String(error)),
        );
        const asked = fromAddress();
        setHolding(asked);
        hold(viewer, asked, setFailure);
      },
      (error: unknown) => setFailure(String(error)),
    );
    return () => {
      viewerRef.current = null;
      setTownViewer(null);
      viewer.dispose();
    };
  }, []);

  function pickClip(clip: string): void {
    const viewer = viewerRef.current;
    if (viewer === null || showing === null) return;
    viewer.play(clip);
    setShowing({ ...showing, clip });
  }

  function pickHolding(next: Holding): void {
    const viewer = viewerRef.current;
    if (viewer === null) return;
    setHolding(next);
    hold(viewer, next, setFailure);
  }

  const loading = failure === null && showing === null;

  return (
    <div className="fixed inset-0 bg-surface-primary">
      <div ref={containerRef} className="absolute inset-0" />
      {townViewer !== null && <MapEditorPanel viewer={townViewer} onEditing={setEditing} onFailure={setFailure} />}
      <div className={`absolute inset-x-3 top-3 flex flex-col gap-2 sm:right-auto sm:w-80 ${editing ? "hidden" : ""}`}>
        <label className="flex items-center gap-2">
          <Clapperboard aria-hidden className="size-5 shrink-0 text-text-secondary" />
          <span className="sr-only">Animation</span>
          <select
            className={SELECT_CLASS}
            value={showing?.clip ?? ""}
            disabled={loading}
            onChange={(event) => pickClip(chosen(event))}
          >
            {showing?.clips.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <Sword aria-hidden className="size-5 shrink-0 text-text-secondary" />
            <span className="sr-only">Weapon</span>
            <select
              className={SELECT_CLASS}
              value={holding.weapon ?? ""}
              disabled={showing === null}
              onChange={(event) => {
                const weapon = chosen(event);
                pickHolding({ ...holding, weapon: weapon === "" ? null : weapon });
              }}
            >
              <option value="">None</option>
              {WEAPONS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <HandIcon aria-hidden className="size-5 shrink-0 text-text-secondary" />
            <span className="sr-only">Hand</span>
            <select
              className={SELECT_CLASS}
              value={holding.hand}
              disabled={showing === null || holding.weapon === null}
              onChange={(event) => pickHolding({ ...holding, hand: HANDS.find((h) => h === chosen(event)) ?? "right" })}
            >
              {HANDS.map((h) => (
                <option key={h} value={h}>
                  {h === "right" ? "Right" : "Left"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 text-xs text-text-muted">
        {loading && <LoaderCircle aria-label="Loading" className="size-4 animate-spin" />}
        {backend !== null && <span title="The renderer's backend">{backend}</span>}
      </div>
      <div className={`pointer-events-none absolute inset-0 flex ${editing ? "hidden" : ""}`}>
        {(lineup.second === null ? [lineup.first] : [lineup.first, lineup.second]).map((input, player) => (
          <div key={player} className={`relative flex-1 ${player === 1 ? "border-l-2 border-border-default" : ""}`}>
            <Hints input={kindOf(input)} join={lineup.second === null ? (lineup.first === "keys" ? "pad" : "either") : player === 1 ? "leave" : null} />
            {whereabouts?.[player] !== undefined && <Readout where={whereabouts[player]} split={lineup.second !== null} />}
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

/** Where a player stands, while the debug overlay is open: at the top of the screen alone, and over their hints on half of it. */
function Readout({ where, split }: { where: Whereabouts; split: boolean }) {
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
