"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpToLine,
  BrickWall,
  Castle,
  Cog,
  Download,
  Droplets,
  Fence,
  Move,
  Grid2x2,
  House,
  Layers,
  Map as MapIcon,
  Mountain,
  Redo2,
  Rotate3d,
  RotateCcw,
  RotateCw,
  Route,
  Search,
  Shapes,
  Sprout,
  Tent,
  Trash,
  Triangle,
  TreePine,
  Undo2,
  Upload,
  Wheat,
  X,
  type LucideIcon,
} from "lucide-react";
import { ControlGlyph, type Control } from "@/shared/components/prompts";
import { BINDINGS, keyLabel } from "../input/controls";
import { EDIT_KEYS, FINE_RAISE_STEP, RAISE_STEP, type EditAction } from "../editor/keys";
import { codeMap, parseMap, serializeMap, type MapDocument } from "../editor/map";
import { kitOf, matches, PALETTE, type Group } from "../editor/palette";
import { discardSavedMap, savedMap, saveMap } from "../editor/saved";
import type { KitPiece } from "../kit";
import type { CharacterViewer } from "../scene/character-viewer";
import type { EditorView, MapEditor } from "../scene/map-editor";

const GROUP_ICON: Record<Group, LucideIcon> = {
  walls: BrickWall,
  "timber walls": House,
  roofs: Triangle,
  "building parts": Castle,
  stairs: Layers,
  paving: Grid2x2,
  water: Droplets,
  "hedges and fences": Fence,
  trees: TreePine,
  plants: Sprout,
  crops: Wheat,
  rocks: Mountain,
  cliffs: Mountain,
  ground: Grid2x2,
  "bridges and paths": Route,
  mills: Cog,
  things: Tent,
};

/** Each kit's mark beside its pieces, a dot in a colour of its own. */
const KIT_MARK = { town: { className: "bg-brand-orange", name: "Fantasy Town Kit" }, nature: { className: "bg-brand-green", name: "Nature Kit" } } as const;

const BUTTON =
  "flex items-center gap-1.5 rounded-md border border-border-default bg-surface-elevated px-2 py-1 text-sm text-text-primary hover:border-border-hover disabled:opacity-40 disabled:hover:border-border-default";

const key = (action: EditAction): Control => ({ key: EDIT_KEYS[action].label });

/** A button with its icon and its key's glyph; what it does is its accessible name and tooltip. */
function Action({ label, icon: Icon, keys, disabled, onClick }: { label: string; icon: LucideIcon; keys: readonly Control[]; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={BUTTON} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      <Icon aria-hidden className="size-4" />
      <span className="flex items-center gap-0.5 text-xs">
        {keys.map((control, i) => (
          <ControlGlyph key={i} control={control} />
        ))}
      </span>
    </button>
  );
}

/** Download a text file the browser saves. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** The map this browser shows on opening: the one saved here, or the code's town; and why a saved one can't be read. */
function openingMap(): { map: MapDocument; saved: boolean; problem: string | null } {
  try {
    const saved = savedMap();
    return { map: saved ?? codeMap(), saved: saved !== null, problem: null };
  } catch (error) {
    return { map: codeMap(), saved: true, problem: String(error) };
  }
}

/** Each viewer's map, drawn once: React runs an effect twice over in development, and a second map would be drawn over the first. */
const placed = new WeakMap<CharacterViewer, { opening: ReturnType<typeof openingMap>; editor: Promise<MapEditor | null> }>();

/**
 * The map editor's page side: draws the map the browser saved (or the code's
 * town), toggles the editor, and while it is open shows the palette, the
 * actions with their keys, Save and Load, and a way back to the code's town.
 * Every change is saved to the browser as it happens.
 */
export function MapEditorPanel({ viewer, onEditing, onFailure }: { viewer: CharacterViewer; onEditing: (editing: boolean) => void; onFailure: (message: string) => void }) {
  const [editor, setEditor] = useState<MapEditor | null>(null);
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<EditorView | null>(null);
  const [saved, setSaved] = useState(false);
  /** Why the last load, or the saved map, couldn't be read. A saved map that can't be read keeps the editor shut until it is discarded. */
  const [problem, setProblem] = useState<{ message: string; blocks: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const map = useRef<MapDocument | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const toggle = useRef<() => void>(() => undefined);

  useEffect(() => {
    let town = placed.get(viewer);
    if (town === undefined) {
      const opening = openingMap();
      const editor = viewer.placeTown(opening.map, {
        changed: (changed) => {
          map.current = changed;
          saveMap(changed);
          setSaved(true);
        },
        view: setView,
        toggle: () => toggle.current(),
        failed: onFailure,
      });
      town = { opening, editor };
      placed.set(viewer, town);
    }
    const { opening } = town;
    map.current = opening.map;
    setSaved(opening.saved);
    if (opening.problem !== null) setProblem({ message: opening.problem, blocks: true });
    town.editor.then(setEditor, (error: unknown) => onFailure(String(error)));
  }, [viewer, onFailure]);

  const blocked = problem?.blocks === true;
  function setOpen(open: boolean): void {
    if (editor === null || (open && blocked)) return;
    viewer.edit(open);
    setEditing(open);
    onEditing(open);
  }
  useEffect(() => {
    toggle.current = () => setOpen(!editing);
  });

  function discard(): void {
    if (editor === null || !window.confirm("Throw away the map saved in this browser, and go back to the town as the code places it?")) return;
    editor.replace(codeMap());
    discardSavedMap();
    setSaved(false);
    setProblem(null);
  }

  async function load(chosen: File): Promise<void> {
    if (editor === null) return;
    try {
      editor.replace(parseMap(JSON.parse(await chosen.text())));
      setProblem(null);
    } catch (error) {
      setProblem({ message: `${chosen.name}: ${String(error)}`, blocks: false });
    }
  }

  if (editor === null) return null;

  const discardButton = saved && (
    <button type="button" className={BUTTON} title="This browser's saved map is shown: throw it away and go back to the code's town" aria-label="Back to the code's town" onClick={discard}>
      <RotateCcw aria-hidden className="size-4" />
    </button>
  );
  const problemNote = problem !== null && (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-brand-pink bg-surface-elevated p-2 text-xs text-text-primary">
      <span className="min-w-0 flex-1 break-words">{problem.message}</span>
      {!problem.blocks && (
        <button type="button" aria-label="Dismiss" onClick={() => setProblem(null)}>
          <X aria-hidden className="size-4 text-text-secondary" />
        </button>
      )}
    </div>
  );

  if (!editing) {
    return (
      <div className="absolute bottom-9 left-3 flex max-w-80 flex-col items-start gap-2">
        {problemNote}
        <div className="flex items-center gap-2">
          <Action label="Edit the map" icon={MapIcon} keys={[key("toggle")]} disabled={blocked} onClick={() => setOpen(true)} />
          {discardButton}
        </div>
      </div>
    );
  }

  const selected = view?.selected ?? null;
  const acting = selected !== null || (view?.armed ?? null) !== null;
  return (
    <>
      <div className="absolute inset-y-3 left-3 flex w-72 flex-col gap-2 rounded-md border border-border-default bg-surface-primary/90 p-2">
        <div className="flex items-center gap-1.5">
          <MapIcon aria-label="Map editor" className="size-5 text-brand-blue" />
          <span className="flex-1" />
          <button type="button" className={BUTTON} title="Save the map to a JSON file" aria-label="Save to a file" onClick={() => map.current && download("adventure-map.json", serializeMap(map.current))}>
            <Download aria-hidden className="size-4" />
          </button>
          <button type="button" className={BUTTON} title="Load a map from a JSON file, in this one's place" aria-label="Load from a file" onClick={() => file.current?.click()}>
            <Upload aria-hidden className="size-4" />
          </button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const chosen = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (chosen !== undefined) void load(chosen);
            }}
          />
          {discardButton}
          <Action label="Back to play" icon={X} keys={[key("toggle")]} onClick={() => setOpen(false)} />
        </div>
        {problemNote}
        <div className="flex flex-wrap gap-1">
          <Action label="Turn a quarter (Shift: the other way)" icon={RotateCw} keys={[key("turn")]} disabled={!acting} onClick={() => editor.turn()} />
          <Action label="Mirror" icon={ArrowLeftRight} keys={[key("mirror")]} disabled={!acting} onClick={() => editor.mirror()} />
          <Action label={`Raise by ${RAISE_STEP} (Shift: by ${FINE_RAISE_STEP})`} icon={ArrowUpToLine} keys={[key("raise")]} disabled={!acting} onClick={() => editor.raise(RAISE_STEP)} />
          <Action label={`Lower by ${RAISE_STEP} (Shift: by ${FINE_RAISE_STEP})`} icon={ArrowDownToLine} keys={[key("lower")]} disabled={!acting} onClick={() => editor.raise(-RAISE_STEP)} />
          <Action label="Delete" icon={Trash} keys={[key("remove")]} disabled={selected === null} onClick={() => editor.remove()} />
          <Action label="Undo" icon={Undo2} keys={[{ key: "Ctrl" }, key("undo")]} disabled={view?.canUndo !== true} onClick={() => editor.undo()} />
          <Action label="Redo" icon={Redo2} keys={[{ key: "Ctrl" }, key("redo")]} disabled={view?.canRedo !== true} onClick={() => editor.redo()} />
        </div>
        <Selection view={view} onDrop={() => editor.drop()} />
        <label className="flex items-center gap-2 rounded-md border border-border-default bg-surface-elevated px-2 py-1">
          <Search aria-hidden className="size-4 shrink-0 text-text-secondary" />
          <input
            type="search"
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            placeholder="wood door"
            aria-label="Find a piece"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") event.currentTarget.blur();
            }}
          />
        </label>
        <Palette search={search} armed={view?.armed ?? null} onArm={(piece) => editor.arm(piece)} />
      </div>
      <EditHints />
    </>
  );
}

/** What the editor holds: the piece about to be placed, or the one selected and exactly where it stands. */
function Selection({ view, onDrop }: { view: EditorView | null; onDrop: () => void }) {
  const selected = view?.selected ?? null;
  const armed = view?.armed ?? null;
  let body: ReactNode;
  if (armed !== null) body = <span className="truncate font-mono" title="Click a cell to place it">+ {armed}</span>;
  else if (selected !== null) {
    const { piece, x, z, y, turn, mirror } = selected.placement;
    body = (
      <span className="min-w-0 truncate font-mono" title={`${piece} in ${selected.place}: x, z, y; quarter turns; mirrored`}>
        {piece} <span className="text-text-muted">{selected.place}</span> {x}, {z}
        {y !== undefined && y !== 0 && `, ↑${y}`} {turn !== undefined && turn !== 0 && `↻${turn}`} {mirror === true && "⇋"}
      </span>
    );
  } else return <div className="flex h-7 items-center gap-1.5 px-1 text-xs text-text-muted" title="Click a piece to select it, drag it to move it; or pick a piece below and click a cell to place it"><Shapes aria-hidden className="size-4" />—</div>;
  return (
    <div className="flex h-7 items-center gap-1.5 rounded-md bg-surface-elevated px-2 text-xs text-text-primary">
      <span className="min-w-0 flex-1 truncate">{body}</span>
      <button type="button" title="Let go" aria-label="Let go" onClick={onDrop} className="flex items-center gap-0.5">
        <ControlGlyph control={key("drop")} />
      </button>
    </div>
  );
}

/** Every piece of both kits by group, filtered by the search; picking one arms it to place. */
function Palette({ search, armed, onArm }: { search: string; armed: KitPiece | null; onArm: (piece: KitPiece | null) => void }) {
  const groups = useMemo(
    () => PALETTE.map(({ group, pieces }) => ({ group, pieces: pieces.filter((piece) => matches(piece, search)) })).filter(({ pieces }) => pieces.length > 0),
    [search],
  );
  const searching = search.trim() !== "";
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      {groups.map(({ group, pieces }) => {
        const Icon = GROUP_ICON[group];
        return (
          <details key={`${group}${searching ? "?" : ""}`} open={searching} className="group mb-1">
            <summary className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-text-secondary hover:text-text-primary">
              <Icon aria-hidden className="size-4" />
              <span className="flex-1 first-letter:uppercase">{group}</span>
              <span className="text-xs text-text-muted">{pieces.length}</span>
            </summary>
            <ul className="flex flex-col">
              {pieces.map((piece) => {
                const kit = KIT_MARK[kitOf(piece)];
                return (
                  <li key={piece}>
                    <button
                      type="button"
                      aria-pressed={armed === piece}
                      className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-left font-mono text-xs text-text-primary hover:bg-surface-elevated aria-pressed:bg-brand-blue aria-pressed:text-surface-primary"
                      onClick={(event) => {
                        // Let go of the keyboard, so the editor's keys and WASD work at once.
                        event.currentTarget.blur();
                        onArm(armed === piece ? null : piece);
                      }}
                    >
                      <span title={kit.name} className={`size-2 shrink-0 rounded-full ${kit.className}`} />
                      <span className="truncate">{piece}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

/** The camera's controls while editing, as glyphs. */
function EditHints() {
  return (
    <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-3 text-xs text-text-muted">
      <span className="flex items-center gap-0.5" title="Slide the camera over the map (Shift: faster; or drag with the middle button)">
        <span className="sr-only">Slide the camera:</span>
        {[BINDINGS.ahead, BINDINGS.left, BINDINGS.back, BINDINGS.right].map(([code]) => (
          <ControlGlyph key={code} control={{ key: keyLabel(code) }} />
        ))}
        <Move aria-hidden className="ml-0.5 size-4" />
      </span>
      <span className="flex items-center gap-0.5" title="Turn the camera: drag with the right button, or the arrow keys">
        <span className="sr-only">Turn the camera:</span>
        <ControlGlyph control={{ mouse: "right" }} />
        <Rotate3d aria-hidden className="ml-0.5 size-4" />
      </span>
      <span className="flex items-center gap-0.5" title="Select a piece, drag it to move it, or place the piece picked">
        <span className="sr-only">Select, move or place:</span>
        <ControlGlyph control={{ mouse: "left" }} />
        <MapIcon aria-hidden className="ml-0.5 size-4" />
      </span>
    </div>
  );
}
