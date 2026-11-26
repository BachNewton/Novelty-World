"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Clapperboard, Footprints, MoveUp, Hand as HandIcon, LoaderCircle, Rotate3d, Sword, ZoomIn } from "lucide-react";
import { ControlGlyph } from "@/shared/components/prompts";
import { useFrameStats } from "@/shared/lib/three/frame-stats";
import { characterOrThrow } from "../characters";
import { BINDINGS, keyLabel } from "../input/controls";
import { CharacterViewer, type Backend } from "../scene/character-viewer";
import { BENCH } from "../bench";
import { BUILDINGS, TREES } from "../town";
import { PLAYER_CHARACTER, VILLAGERS } from "../villagers";
import { HANDS, WEAPONS, weaponOrThrow, type Hand } from "../weapons";

const DEFAULT_CLIP = "idle";

/** What a character holds: a weapon's id, or none, and in which hand. */
interface Holding {
  weapon: string | null;
  hand: Hand;
}

/** What the address asks for: `?clip=walk&weapon=sword&hand=left` opens on exactly that. */
function fromAddress(): { clip: string; holding: Holding } {
  const search = new URLSearchParams(window.location.search);
  const weapon = search.get("weapon");
  const hand = search.get("hand");
  return {
    clip: search.get("clip") ?? DEFAULT_CLIP,
    holding: {
      weapon: WEAPONS.find((w) => w.id === weapon)?.id ?? null,
      hand: HANDS.find((h) => h === hand) ?? "right",
    },
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
  useFrameStats();

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const viewer = new CharacterViewer(container, setFailure, (clip) => {
      setShowing((now) => now && { ...now, clip });
    });
    viewerRef.current = viewer;
    // The probe for tools: they drive the camera to exact views. Never in a production build.
    if (process.env.NODE_ENV === "development") Object.assign(window, { __adventure: { lookFrom: viewer.lookFrom.bind(viewer) } });
    viewer.start().then(
      (got) => {
        if (got === null) return;
        setBackend(got);
        // `?view=pieces` is the piece bench: every piece of the town kit, named, in place of the town.
        const bench = new URLSearchParams(window.location.search).get("view") === "pieces";
        viewer.placeTown(bench ? BENCH : [...TREES, ...BUILDINGS], bench).catch((error: unknown) => setFailure(String(error)));
        if (!bench) viewer.placeVillagers(VILLAGERS).catch((error: unknown) => setFailure(String(error)));
        const asked = fromAddress();
        viewer.show(characterOrThrow(PLAYER_CHARACTER), asked.clip).then(
          (shown) => {
            // Null when the viewer closed first.
            if (shown === null) return;
            setShowing({ clips: shown.clips, clip: shown.playing });
            toAddress({ clip: shown.playing });
          },
          (error: unknown) => setFailure(String(error)),
        );
        setHolding(asked.holding);
        hold(viewer, asked.holding, setFailure);
      },
      (error: unknown) => setFailure(String(error)),
    );
    return () => {
      viewerRef.current = null;
      viewer.dispose();
    };
  }, []);

  function pickClip(clip: string): void {
    const viewer = viewerRef.current;
    if (viewer === null || showing === null) return;
    viewer.play(clip);
    setShowing({ ...showing, clip });
    toAddress({ clip });
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
      <div className="absolute inset-x-3 top-3 flex flex-col gap-2 sm:right-auto sm:w-80">
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
      <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-3 text-xs text-text-muted">
        <span className="flex items-center gap-0.5" title="Walk">
          <span className="sr-only">Walk:</span>
          {[BINDINGS.ahead, BINDINGS.left, BINDINGS.back, BINDINGS.right].map(([code]) => (
            <ControlGlyph key={code} control={{ key: keyLabel(code) }} />
          ))}
        </span>
        <span className="flex items-center gap-1" title="Sprint, with a walking key">
          <span className="sr-only">Sprint:</span>
          <ControlGlyph control={{ key: keyLabel(BINDINGS.sprint[0]) }} />
          <Footprints aria-hidden className="size-4" />
        </span>
        <span className="flex items-center gap-0.5" title="Turn the camera">
          <span className="sr-only">Turn the camera:</span>
          {[BINDINGS.turnLeft, BINDINGS.tiltUp, BINDINGS.tiltDown, BINDINGS.turnRight].map(([code]) => (
            <ControlGlyph key={code} control={{ key: keyLabel(code) }} />
          ))}
          <Rotate3d aria-hidden className="ml-0.5 size-4" />
        </span>
        <span className="flex items-center gap-0.5" title="Zoom">
          <span className="sr-only">Zoom:</span>
          {[BINDINGS.zoomIn, BINDINGS.zoomOut].map(([code]) => (
            <ControlGlyph key={code} control={{ key: keyLabel(code) }} />
          ))}
          <ZoomIn aria-hidden className="ml-0.5 size-4" />
        </span>
        <span className="flex items-center gap-1" title="Jump">
          <span className="sr-only">Jump:</span>
          <ControlGlyph control={{ key: keyLabel(BINDINGS.jump[0]) }} />
          <MoveUp aria-hidden className="size-4" />
        </span>
      </div>
      {failure !== null && (
        <div role="alert" className="absolute inset-x-3 bottom-10 rounded-md border border-brand-pink bg-surface-elevated p-3 text-sm text-text-primary">
          {failure}
        </div>
      )}
    </div>
  );
}
