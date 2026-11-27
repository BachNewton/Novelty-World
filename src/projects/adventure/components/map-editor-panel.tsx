"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowBigDown,
  ArrowBigUp,
  ArrowLeftRight,
  ArrowUpToLine,
  BrickWall,
  Castle,
  Cog,
  Download,
  Eraser,
  Droplets,
  Fence,
  Footprints,
  Move,
  Grid2x2,
  House,
  Layers,
  Leaf,
  Link2,
  Map as MapIcon,
  Mountain,
  Paintbrush,
  Pipette,
  Redo2,
  Rotate3d,
  RotateCcw,
  RotateCw,
  Route,
  Search,
  Shapes,
  Shuffle,
  Sprout,
  Tent,
  Trash,
  Triangle,
  TriangleRight,
  TreePine,
  Undo2,
  Upload,
  Waves,
  Wheat,
  X,
  type LucideIcon,
} from "lucide-react";
import { ControlGlyph, type Control } from "@/shared/components/prompts";
import type { Cliff, Face } from "../cliffs";
import { BINDINGS, keyLabel } from "../input/controls";
import { EDIT_KEYS, FINE_RAISE_STEP, RAISE_STEP, type EditAction } from "../editor/keys";
import { codeMap, parseMap, serializeMap, type MapDocument } from "../editor/map";
import { entryName, kitOf, matches, PALETTE, TEXTURE_MARK, type Group, type PaletteEntry } from "../editor/palette";
import { discardSavedMap, savedMap, saveMap } from "../editor/saved";
import type { TownTexture } from "../fantasy-town";
import type { Kit, KitPiece } from "../kit";
import { tilePiece } from "../ways";
import type { CharacterViewer } from "../scene/character-viewer";
import { BRUSH_FACES, type Brush, type EditMode, type EditorView, type MapEditor } from "../scene/map-editor";
import type { Thumbnails } from "../scene/thumbnails";
import { BUTTON, letGo, PRESSED, SidePanel, Tile, TilePicture } from "./side-panel";

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

/** Each kit's mark beside its pieces: a shape of its own, in the row's own colour, since a colour alone reads as a status. */
const KIT_MARK: Record<Kit, { icon: LucideIcon; name: string }> = { town: { icon: House, name: "Fantasy Town Kit" }, nature: { icon: Leaf, name: "Nature Kit" } };

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
  /** The kits the palette is narrowed to: none, or both, shows every piece. */
  const [kits, setKits] = useState<ReadonlySet<Kit>>(new Set());
  const map = useRef<MapDocument | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const toggle = useRef<() => void>(() => undefined);
  /** One function for the palette's whole life with this editor, so picking leaves its hundreds of buttons as they are. */
  const arm = useCallback((entry: PaletteEntry | null) => editor?.arm(entry), [editor]);
  const thumbnails = useMemo(() => (editor === null ? null : viewer.thumbnails()), [editor, viewer]);
  const revealed = view?.revealed ?? 0;
  /** The eyedropper's last pick the palette was cleared for: a piece it picks up is shown whatever the palette was narrowed to. */
  const [cleared, setCleared] = useState(0);
  if (revealed !== cleared) {
    setCleared(revealed);
    setSearch("");
    setKits(new Set());
  }

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

  if (editor === null || thumbnails === null) return null;

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
  const mode = view?.mode ?? "pieces";
  const armed = view?.armed ?? null;
  const armedName = armed === null ? null : entryName({ piece: armed, texture: view?.armedTexture });
  return (
    <>
      <SidePanel
        label="Map editor"
        top={
          <>
            <div className="flex items-center gap-1.5">
              <MapIcon aria-hidden className="size-5 text-brand-blue" />
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
            <div role="group" aria-label="The left button" className="flex gap-1">
              {MODES.map(({ mode: shown, label, icon: Icon }) => (
                <button
                  key={shown}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={mode === shown}
                  className={`${BUTTON} flex-1 justify-center ${PRESSED}`}
                  onClick={(event) => {
                    letGo(event);
                    editor.setMode(shown);
                  }}
                >
                  <Icon aria-hidden className="size-4" />
                  {shown === "ground" && <ControlGlyph control={key("ground")} />}
                </button>
              ))}
            </div>
            {mode === "ground" ? (
              <GroundTools editor={editor} view={view} thumbnails={thumbnails} onFailure={onFailure} />
            ) : (
              <>
                <div className="flex flex-wrap gap-1">
                  <Action label="Turn a quarter anticlockwise" icon={RotateCcw} keys={[key("turn")]} disabled={!acting} onClick={() => editor.turn()} />
                  <Action label="Turn a quarter clockwise" icon={RotateCw} keys={[key("turnBack")]} disabled={!acting} onClick={() => editor.turn(true)} />
                  <Action label="Handles: move, or turn" icon={Move} keys={[key("handles")]} disabled={selected === null} onClick={() => editor.switchHandles()} />
                  <Action label="Mirror" icon={ArrowLeftRight} keys={[key("mirror")]} disabled={!acting} onClick={() => editor.mirror()} />
                  <Action label={`Raise by ${RAISE_STEP} (Shift: by ${FINE_RAISE_STEP})`} icon={ArrowUpToLine} keys={[key("raise")]} disabled={!acting} onClick={() => editor.raise(RAISE_STEP)} />
                  <Action label={`Lower by ${RAISE_STEP} (Shift: by ${FINE_RAISE_STEP})`} icon={ArrowDownToLine} keys={[key("lower")]} disabled={!acting} onClick={() => editor.raise(-RAISE_STEP)} />
                  <Action label="Delete" icon={Trash} keys={[key("remove")]} disabled={selected === null} onClick={() => editor.remove()} />
                  <Eyedropper editor={editor} view={view} />
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
                <div role="group" aria-label="Only the pieces of" className="flex gap-1">
                  {(["town", "nature"] as const).map((shown) => {
                    const { icon: Icon, name } = KIT_MARK[shown];
                    return (
                      <button
                        key={shown}
                        type="button"
                        title={`Only the ${name}'s pieces`}
                        aria-pressed={kits.has(shown)}
                        className={`${BUTTON} flex-1 justify-center ${PRESSED}`}
                        onClick={(event) => {
                          letGo(event);
                          setKits((now) => {
                            const next = new Set(now);
                            if (!next.delete(shown)) next.add(shown);
                            return next;
                          });
                        }}
                      >
                        <Icon aria-label={name} className="size-4" />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        }
      >
        {mode === "pieces" && <Palette search={search} kits={kits} armed={armedName} revealed={revealed} onArm={arm} thumbnails={thumbnails} onFailure={onFailure} />}
      </SidePanel>
      <EditHints mode={mode} />
    </>
  );
}

/** What the left button does, each a button of its own. */
const MODES: readonly { mode: EditMode; label: string; icon: LucideIcon }[] = [
  { mode: "pieces", label: "Place and select pieces", icon: Shapes },
  { mode: "ground", label: "Paint the ground", icon: Paintbrush },
];

interface BrushButton {
  brush: Brush;
  label: string;
  icon: LucideIcon;
}

/** Each kind of ground the brush paints, at whatever height each cell has, with its key: grass rubs dirt and water out, and empty takes the ground away. */
const KIND_BRUSHES: readonly BrushButton[] = [
  { brush: "grass", label: "Grass: rubs dirt and water out", icon: Sprout },
  { brush: "dirt", label: "Dirt: a track, or a patch where it is two cells or more across", icon: Footprints },
  { brush: "water", label: "Water: a stream, or a pond where it is two cells or more across", icon: Waves },
  { brush: "empty", label: "Empty: no ground at all, where nothing is drawn and no one stands", icon: Eraser },
];

/** The brushes that raise and lower the ground, the cliffs following, and the one that gives a cell a face. */
const HEIGHT_BRUSHES: readonly BrushButton[] = [
  { brush: "up", label: "Raise each cell crossed a storey (Shift as the stroke starts: half a storey), the cliffs round it following", icon: ArrowBigUp },
  { brush: "down", label: "Lower each cell crossed a storey (Shift as the stroke starts: half a storey)", icon: ArrowBigDown },
  { brush: "face", label: "Give each cell crossed a face at its foot, against the rise beside it (again: the next face)", icon: TriangleRight },
];

/** The ways the raise brush makes the faces of the cells it raises, each by its picture. */
const CLIFFS: readonly { cliff: Cliff; piece: KitPiece; label: string }[] = [
  { cliff: { rock: "stone", edge: "plain" }, piece: "cliff_stone", label: "Grey stone, plain" },
  { cliff: { rock: "stone", edge: "large" }, piece: "cliff_large_stone", label: "Grey stone, large below its top storey" },
  { cliff: { rock: "stone", edge: "steps" }, piece: "cliff_steps_stone", label: "Grey stone, steps all round" },
  { cliff: { rock: "rock", edge: "plain" }, piece: "cliff_rock", label: "Red rock, plain" },
  { cliff: { rock: "rock", edge: "large" }, piece: "cliff_large_rock", label: "Red rock, large below its top storey" },
  { cliff: { rock: "rock", edge: "steps" }, piece: "cliff_steps_rock", label: "Red rock, steps all round" },
];

/** Each face the face brush gives, by its picture. */
const FACE_CHOICES: Record<Face, { piece: KitPiece; label: string }> = {
  steps: { piece: "cliff_steps_stone", label: "Steps up to the cell it faces" },
  ramp: { piece: "cliff_blockSlopeWalls_stone", label: "A walled ramp (up half a storey, the half ramp)" },
  cave: { piece: "cliff_cave_stone", label: "A cave's mouth" },
  cut: { piece: "cliff_diagonal_stone", label: "The corner of a rise cut on the diagonal" },
};

const sameCliff = (a: Cliff | null, b: Cliff | null): boolean => a === b || (a !== null && b !== null && a.rock === b.rock && a.edge === b.edge);

/** A row of brushes, the one in hand pressed. */
function Brushes({ label, brushes, editor, view }: { label: string; brushes: readonly BrushButton[]; editor: MapEditor; view: EditorView | null }) {
  return (
    <div role="group" aria-label={label} className="flex w-full gap-1">
      {brushes.map(({ brush, label: name, icon: Icon }) => (
        <button
          key={brush}
          type="button"
          title={name}
          aria-label={name}
          aria-pressed={view?.brush === brush}
          className={`${BUTTON} flex-1 justify-center ${PRESSED}`}
          onClick={(event) => {
            letGo(event);
            editor.setBrush(brush);
          }}
        >
          <Icon aria-hidden className="size-4" />
          <ControlGlyph control={key(brush)} />
        </button>
      ))}
    </div>
  );
}

/** The eyedropper's button: the next click picks up what it is on. Its key picks up what is under the pointer at once. */
function Eyedropper({ editor, view }: { editor: MapEditor; view: EditorView | null }) {
  const on = view?.eyedropping === true;
  const label = "Eyedropper: pick up what is under the pointer, to make more of it, by its key or a middle click (the button: what the next click is on)";
  return (
    <button
      type="button"
      className={`${BUTTON} ${PRESSED}`}
      title={label}
      aria-label={label}
      aria-pressed={on}
      onClick={(event) => {
        letGo(event);
        editor.setEyedropping(!on);
      }}
    >
      <Pipette aria-hidden className="size-4" />
      <span className="text-xs">
        <ControlGlyph control={key("eyedropper")} />
      </span>
    </button>
  );
}

/** One of a brush's own choices, shown by its picture, or by an icon where it has none. */
function BrushChoice({ name, pressed, onPick, children }: { name: string; pressed: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <li>
      <Tile name={name} pressed={pressed} onPick={onPick}>
        {children}
      </Tile>
    </li>
  );
}

/** What the brush in hand makes: the cliff the raise brush gives, the face the face brush gives, or the tile a kind's brush chooses. */
function BrushMakes({ editor, view, thumbnails, onFailure }: { editor: MapEditor; view: EditorView | null; thumbnails: Thumbnails; onFailure: (message: string) => void }) {
  const brush = view?.brush;
  const picture = (piece: KitPiece) => <PieceImage thumbnails={thumbnails} piece={piece} onFailure={onFailure} className="size-full" />;
  const tile = view?.tile ?? null;
  if (brush === "up") {
    return (
      <ul aria-label="The faces it raises" className="grid w-full grid-cols-7 gap-1">
        <BrushChoice name="In the stone of the rise beside" pressed={view?.cliff === null} onPick={() => editor.setCliff(null)}>
          <Link2 aria-hidden className="m-auto size-5" />
        </BrushChoice>
        {CLIFFS.map(({ cliff, piece, label }) => (
          <BrushChoice key={piece} name={label} pressed={sameCliff(view?.cliff ?? null, cliff)} onPick={() => editor.setCliff(cliff)}>
            {picture(piece)}
          </BrushChoice>
        ))}
      </ul>
    );
  }
  if (brush === "face") {
    return (
      <ul aria-label="The face it gives" className="grid w-full grid-cols-7 gap-1">
        {BRUSH_FACES.map((face) => (
          <BrushChoice
            key={face ?? "none"}
            name={face === null ? "No face: the plain one, rubbing a face out" : FACE_CHOICES[face].label}
            pressed={view?.face === face}
            onPick={() => editor.setFace(face)}
          >
            {face === null ? <Eraser aria-hidden className="m-auto size-5" /> : picture(FACE_CHOICES[face].piece)}
          </BrushChoice>
        ))}
      </ul>
    );
  }
  if (tile === null || (brush !== "dirt" && brush !== "water")) return null;
  return (
    <div className="flex h-10 w-full items-center gap-1.5 rounded-md bg-surface-elevated px-2 text-xs text-text-primary" title="The tile the brush chooses for each cell whose shape the kit makes it for">
      <span className="size-8 shrink-0">{picture(tilePiece(brush === "dirt" ? "path" : "river", tile))}</span>
      <span className="flex-1 truncate font-mono">{tile}</span>
      <button type="button" title="Let go: plain tiles" aria-label="Let go of the tile" onClick={() => editor.drop()} className="flex items-center gap-0.5">
        <ControlGlyph control={key("drop")} />
      </button>
    </div>
  );
}

/** The ground's brushes and what the one in hand makes, the variant key, the eyedropper, and undo and redo. */
function GroundTools({ editor, view, thumbnails, onFailure }: { editor: MapEditor; view: EditorView | null; thumbnails: Thumbnails; onFailure: (message: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Brushes label="Paint with" brushes={KIND_BRUSHES} editor={editor} view={view} />
      <Brushes label="Raise, lower or give a face" brushes={HEIGHT_BRUSHES} editor={editor} view={view} />
      <BrushMakes editor={editor} view={view} thumbnails={thumbnails} onFailure={onFailure} />
      <Action label="The cell under the pointer: the next tile the kit makes for its shape (rocks in a straight, a wide bank round a bend, an end open or closed)" icon={Shuffle} keys={[key("variant")]} onClick={() => editor.cycleVariant()} />
      <Eyedropper editor={editor} view={view} />
      <Action label="Undo" icon={Undo2} keys={[{ key: "Ctrl" }, key("undo")]} disabled={view?.canUndo !== true} onClick={() => editor.undo()} />
      <Action label="Redo" icon={Redo2} keys={[{ key: "Ctrl" }, key("redo")]} disabled={view?.canRedo !== true} onClick={() => editor.redo()} />
    </div>
  );
}

/** A piece's name, marked with the colour map it wears where it wears another than the kit's own. */
function PieceName({ piece, texture }: { piece: KitPiece; texture: TownTexture | undefined }) {
  return (
    <>
      {piece}
      {texture !== undefined && (
        <span title={`In the kit's ${texture} colours`} className="ml-1 rounded-sm border border-current px-0.5">
          {TEXTURE_MARK[texture]}
        </span>
      )}
    </>
  );
}

/**
 * What the editor holds: the piece about to be placed, or the one selected
 * and exactly where it stands. Always two lines high, so nothing under it
 * moves as a piece is picked or selected.
 */
function Selection({ view, onDrop }: { view: EditorView | null; onDrop: () => void }) {
  const selected = view?.selected ?? null;
  const armed = view?.armed ?? null;
  let body: ReactNode;
  if (armed !== null) {
    body = (
      <span className="truncate font-mono" title="Click a cell to place it">
        + <PieceName piece={armed} texture={view?.armedTexture} />
      </span>
    );
  } else if (selected !== null) {
    const { piece, x, z, y, turn, mirror, texture } = selected.placement;
    body = (
      <span className="flex min-w-0 flex-col font-mono" title={`${piece}${texture === undefined ? "" : ` in ${texture}`}, in the place ${selected.place}; x, z and height; quarter turns; mirrored`}>
        <span className="truncate">
          <PieceName piece={piece} texture={texture} /> <span className="text-text-muted">{selected.place}</span>
        </span>
        <span className="truncate">
          {x}, {z}
          {y !== undefined && y !== 0 && `, ↑${y}`} {turn !== undefined && turn !== 0 && `↻${turn}`} {mirror === true && "⇋"}
        </span>
      </span>
    );
  } else {
    return (
      <div className="flex h-10 shrink-0 items-center gap-1.5 px-1 text-xs text-text-muted" title="Click a piece to select it, then move or turn it by its handles; or pick a piece below and click a cell to place it">
        <Shapes aria-hidden className="size-4" />—
      </div>
    );
  }
  return (
    <div className="flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-surface-elevated px-2 text-xs text-text-primary">
      <span className="flex min-w-0 flex-1">{body}</span>
      <button type="button" title="Let go" aria-label="Let go" onClick={onDrop} className="flex items-center gap-0.5">
        <ControlGlyph control={key("drop")} />
      </button>
    </div>
  );
}

/** One watcher for every picture in the editor: each is drawn the first time its row comes into view, which a closed group's never do. */
const watched = new Map<Element, () => void>();
let watcher: IntersectionObserver | null = null;

/** Call `then` once an element first comes into view; the returned function stops watching it. */
function whenSeen(element: Element, then: () => void): () => void {
  watcher ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const seen = watched.get(entry.target);
      watcher?.unobserve(entry.target);
      watched.delete(entry.target);
      seen?.();
    }
  });
  watched.set(element, then);
  watcher.observe(element);
  return () => {
    watcher?.unobserve(element);
    watched.delete(element);
  };
}

/** A piece's picture, drawn once it is first in view, with an empty square of its size until then. */
function PieceImage({
  thumbnails,
  piece,
  texture,
  onFailure,
  className,
}: {
  thumbnails: Thumbnails;
  piece: KitPiece;
  texture?: TownTexture;
  onFailure: (message: string) => void;
  className: string;
}) {
  const [url, setUrl] = useState(() => thumbnails.ready(piece, texture));
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = box.current;
    if (url !== undefined || element === null) return;
    let live = true;
    const stop = whenSeen(element, () => {
      thumbnails.of(piece, texture).then(
        (made) => {
          if (live) setUrl(made);
        },
        (error: unknown) => onFailure(String(error)),
      );
    });
    return () => {
      live = false;
      stop();
    };
  }, [thumbnails, piece, texture, url, onFailure]);
  return (
    <span ref={box} className={`block ${className}`}>
      <TilePicture url={url} className="size-full" />
    </span>
  );
}

/**
 * Every piece of both kits, or of one, by group, filtered by the search, each
 * as its picture with its name under it, and a town piece another colour map
 * changes again in that map; picking one arms it to place. Hundreds of
 * buttons, so it draws again only when what it shows changes.
 */
const Palette = memo(function Palette({
  search,
  kits,
  armed,
  revealed,
  onArm,
  thumbnails,
  onFailure,
}: {
  search: string;
  kits: ReadonlySet<Kit>;
  /** The entry armed, by its name. */
  armed: string | null;
  /** How many pieces the eyedropper has picked up: each time it picks one up, the armed entry is shown, its group opened and scrolled to. */
  revealed: number;
  onArm: (entry: PaletteEntry | null) => void;
  thumbnails: Thumbnails;
  onFailure: (message: string) => void;
}) {
  const groups = useMemo(
    () =>
      PALETTE.map(({ group, entries }) => ({ group, entries: entries.filter((entry) => (kits.size === 0 || kits.has(kitOf(entry.piece))) && matches(entry, search)) })).filter(
        ({ entries }) => entries.length > 0,
      ),
    [search, kits],
  );
  const searching = search.trim() !== "";
  const root = useRef<HTMLDivElement>(null);
  /** The pick last shown. The panel clears the search and the kits in the same change, so a pick is shown once its entry is there. */
  const shown = useRef(0);
  useEffect(() => {
    if (revealed === shown.current || armed === null) return;
    const entry = root.current?.querySelector(`[data-entry="${CSS.escape(armed)}"]`);
    if (entry === null || entry === undefined) return;
    shown.current = revealed;
    const group = entry.closest("details");
    if (group !== null) group.open = true;
    entry.scrollIntoView({ block: "center" });
  }, [revealed, armed, groups]);
  return (
    <div ref={root} className="flex flex-col gap-1">
      {groups.map(({ group, entries }) => {
        const Icon = GROUP_ICON[group];
        return (
          <details key={`${group}${searching ? "?" : ""}`} open={searching} className="group">
            <summary className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-text-secondary hover:text-text-primary">
              <Icon aria-hidden className="size-4" />
              <span className="flex-1 first-letter:uppercase">{group}</span>
              <span className="text-xs text-text-muted">{entries.length}</span>
            </summary>
            <ul className="grid grid-cols-4 gap-1">
              {entries.map((entry) => {
                const name = entryName(entry);
                const kit = KIT_MARK[kitOf(entry.piece)];
                return (
                  <li key={name} data-entry={name}>
                    <Tile
                      name={name}
                      pressed={armed === name}
                      caption={<PieceName piece={entry.piece} texture={entry.texture} />}
                      badges={
                        <span title={kit.name} className="absolute top-1 left-1 opacity-60">
                          <kit.icon aria-label={kit.name} className="size-3" />
                        </span>
                      }
                      onPick={() => onArm(armed === name ? null : entry)}
                    >
                      <PieceImage thumbnails={thumbnails} piece={entry.piece} texture={entry.texture} onFailure={onFailure} className="aspect-square w-full" />
                    </Tile>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
});

/** The camera's controls while editing, and what the left button does, as glyphs. */
function EditHints({ mode }: { mode: EditMode }) {
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
      {mode === "ground" ? (
        <span className="flex items-center gap-0.5" title="Paint the ground: click a cell, or drag across cells">
          <span className="sr-only">Paint:</span>
          <ControlGlyph control={{ mouse: "left" }} />
          <Paintbrush aria-hidden className="ml-0.5 size-4" />
        </span>
      ) : (
        <span className="flex items-center gap-0.5" title="Select a piece, drag it to move it, or place the piece picked">
          <span className="sr-only">Select, move or place:</span>
          <ControlGlyph control={{ mouse: "left" }} />
          <MapIcon aria-hidden className="ml-0.5 size-4" />
        </span>
      )}
    </div>
  );
}
