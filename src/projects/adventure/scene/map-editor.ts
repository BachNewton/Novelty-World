import * as THREE from "three/webgpu";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import { isTextEntryTarget } from "@/shared/lib/utils";
import { added, piecesOf, placeOf, replaced, withGround, type MapDocument } from "../editor/map";
import { editActionOf, FINE_RAISE_STEP, RAISE_STEP, type EditAction } from "../editor/keys";
import type { PaletteEntry } from "../editor/palette";
import type { TownTexture } from "../fantasy-town";
import { cycled, painted, type Cell, type GroundKind, type GroundLayer } from "../ground";
import type { ControlState } from "../input/controls";
import type { KitPiece } from "../kit";
import type { Placement } from "../town";
import type { GroundTiles } from "./ground-tiles";
import { placementMatrix } from "./merged";
import type { TownLayer } from "./town-layer";

/** How many changes back undo reaches. */
const UNDO_DEPTH = 200;
/** How far a press may move, in pixels, and still be a click rather than a drag. */
const CLICK_SLOP = 4;
/** How fast WASD slides the camera over the map, in its distance from what it looks at each second; Shift trebles it. */
const PAN_SPEED = 1.2;
const SPRINT_PAN = 3;
/** The camera's reach while editing: further out than play's, to look over the whole map. */
const EDIT_DISTANCE = { min: 1, max: 30 };
/** Where the camera goes on entering the editor: above and behind what it looks at, looking down over the map. */
const EDIT_EYE = new THREE.Vector3(0, 9, 7);
/** How see-through a piece about to be placed or moved is drawn. */
const GHOST_OPACITY = 0.55;
/** How far above its level the cell under the pointer is outlined, so the ground never hides it. */
const MARK_LIFT = 0.02;
/** How far a piece's up handle moves it a step: as the raise key does, and with Shift, as Shift with it does. */
const HEIGHT_SNAP = { coarse: RAISE_STEP, fine: FINE_RAISE_STEP } as const;
/** How strongly what a click would select is lightened under the pointer: well short of the selection's outline. */
const HOVER_LIGHT = 0.08;

/** What the left button does: place and select pieces, or paint the ground. */
export type EditMode = "pieces" | "ground";

/** What the editor's panel shows: the piece selected and where it stands, the piece about to be placed and its texture, whether undo and redo reach anything, and what the left button does. */
export interface EditorView {
  selected: { placement: Placement; place: string } | null;
  armed: KitPiece | null;
  armedTexture: TownTexture | undefined;
  canUndo: boolean;
  canRedo: boolean;
  mode: EditMode;
  brush: GroundKind;
}

export interface EditorListeners {
  /** The map changed: an edit, an undo or redo, or a map loaded in its place. */
  changed: (map: MapDocument) => void;
  /** A changed map is drawn, so where each of its pieces stands is known. */
  shown: (map: MapDocument) => void;
  view: (view: EditorView) => void;
  /** The editor's key was pressed, to go into the editor or out of it. */
  toggle: () => void;
  failed: (message: string) => void;
}

/** The piece about to be placed, in the colour map it was picked in, and how it will stand. */
interface Armed {
  piece: KitPiece;
  turn: number;
  mirror: boolean;
  y: number;
  texture?: TownTexture;
}

interface Saved {
  eye: THREE.Vector3;
  target: THREE.Vector3;
  buttons: OrbitControls["mouseButtons"];
  pan: boolean;
  distance: { min: number; max: number };
}

/**
 * The map editor, in the scene: click a piece to select it, and move it by its
 * handles (three.js's transform gizmo: an arrow along each way, snapped to
 * whole cells across the map and to a twentieth of a storey up, or a ring that
 * turns it a quarter at a time), or turn, mirror, raise, lower or delete it
 * from the keys or the panel; pick a piece from the palette and click a cell
 * to place it. In ground mode the left button paints cells instead, a stroke
 * at a time, each stroke one change. What a click would select is lightened
 * under the pointer, picked at most once a frame. The left button
 * is the editor's while it is open: the right drags the camera round, the
 * middle slides it, the wheel zooms, and WASD slides it over the map. Every
 * change is a new map, never one changed in place, so undo is the map before,
 * and the map's drawing rebuilds only the chunks the change touched.
 */
export class MapEditor {
  private readonly group = new THREE.Group();
  private readonly ray = new THREE.Raycaster();
  private readonly cellMark: THREE.LineSegments;
  private readonly selectionBox: THREE.Box3Helper;
  /** Each piece's ghost in each texture, by `ghostName`. */
  private readonly ghosts = new Map<string, Promise<THREE.Object3D>>();
  private ghost: THREE.Object3D | null = null;
  /** The ghost asked for last: one that loads after another was asked for is never shown. */
  private ghostWanted: string | null = null;
  private readonly undone: MapDocument[] = [];
  private readonly redone: MapDocument[] = [];
  private selected: Placement | null = null;
  private armed: Armed | null = null;
  /** The cell under the pointer, at the height of what is being placed or moved. */
  private hover: readonly [number, number] | null = null;
  private press: { x: number; y: number } | null = null;
  /** The selected piece's handles, on a stand-in at its origin which they move; the piece is redrawn where they leave it. */
  private readonly handles: TransformControls;
  private readonly handle = new THREE.Object3D();
  /** What the panel was last told, so it is told again only when that changes: a pointer's every move redraws nothing there. */
  private told: EditorView | null = null;
  /** Where the handles have the selected piece while they are dragged, or null while they aren't. */
  private moving: Placement | null = null;
  /** Whether Shift was held at the pointer's last move, for the up handle's finer step. */
  private fine = false;
  private saved: Saved | null = null;
  private mode: EditMode = "pieces";
  private brush: GroundKind = "dirt";
  /** The ground a stroke has painted so far, and the cell it reached last: drawn as it goes, and one change when the button comes up. */
  private stroke: { ground: GroundLayer; last: Cell } | null = null;
  /** The map's pieces, found once for each map. */
  private pieces: readonly Placement[];
  /** Where the pointer is over the canvas, in the camera's terms, and the buttons it holds: what it hovers over is picked from these once a frame. */
  private pointer: THREE.Vector2 | null = null;
  private buttons = 0;
  /** Whether what the pointer hovers over is to be picked again: the pointer, the map or what a click does changed. A moved camera is seen by its matrix. */
  private hoverStale = true;
  private readonly hoverRay = new THREE.Raycaster();
  private readonly hoverView = new THREE.Matrix4();
  /** What a click would select under the pointer, and its copy drawn lightened over it. */
  private hovered: Placement | null = null;
  private hoverMark: THREE.Object3D | null = null;
  private readonly hoverMaterial: THREE.MeshBasicMaterial;
  active = false;

  constructor(
    private map: MapDocument,
    private readonly layer: TownLayer,
    private readonly ground: GroundTiles,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly orbit: OrbitControls,
    private readonly canvas: HTMLElement,
    private readonly listeners: EditorListeners,
  ) {
    const square = new THREE.BufferGeometry().setFromPoints(
      [[0, 0], [1, 0], [1, 0], [1, 1], [1, 1], [0, 1], [0, 1], [0, 0]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    );
    this.cellMark = new THREE.LineSegments(square, overlayLine("--color-brand-blue"));
    this.selectionBox = new THREE.Box3Helper(new THREE.Box3(), themeColor("--color-brand-pink"));
    Object.assign(this.selectionBox.material, { depthTest: false, transparent: true });
    this.cellMark.renderOrder = this.selectionBox.renderOrder = 2;
    this.cellMark.visible = this.selectionBox.visible = false;
    this.group.add(this.cellMark, this.selectionBox, this.handle);
    this.handles = new TransformControls(camera, canvas);
    this.handles.setSpace("world");
    this.handles.setRotationSnap(Math.PI / 2);
    this.handles.enabled = false;
    // Snapped as they go, by the piece's own cell rather than the world's units, since a piece's origin is its cell's middle.
    this.handles.addEventListener("objectChange", () => {
      if (this.selected === null) return;
      this.moving = this.fromHandle(this.selected);
      this.handle.position.copy(origin(this.moving));
      this.refresh();
    });
    this.handles.addEventListener("dragging-changed", ({ value }) => {
      this.orbit.enabled = !value;
      if (value === true) return;
      const moving = this.moving;
      const selected = this.selected;
      this.moving = null;
      if (moving === null || selected === null || same(moving, selected)) {
        this.refresh();
        return;
      }
      this.selected = moving;
      this.commit(replaced(this.map, selected, moving));
    });
    this.group.add(this.handles.getHelper());
    this.pieces = piecesOf(map);
    // Added over the piece's own faces, at their very depth, so it only lightens what is seen of it.
    this.hoverMaterial = new THREE.MeshBasicMaterial({
      color: themeColor("--color-text-primary"),
      transparent: true,
      opacity: HOVER_LIGHT,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
    });
    window.addEventListener("keydown", this.key);
  }

  /** Go into the editor, looking down over the map round `focus`, or back out to the view as it was. */
  setActive(on: boolean, focus: THREE.Vector3): void {
    if (on === this.active) return;
    this.active = on;
    if (on) {
      this.saved = {
        eye: this.camera.position.clone(),
        target: this.orbit.target.clone(),
        buttons: { ...this.orbit.mouseButtons },
        pan: this.orbit.enablePan,
        distance: { min: this.orbit.minDistance, max: this.orbit.maxDistance },
      };
      this.orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
      this.orbit.enablePan = true;
      this.orbit.screenSpacePanning = false;
      this.orbit.minDistance = EDIT_DISTANCE.min;
      this.orbit.maxDistance = EDIT_DISTANCE.max;
      this.orbit.target.set(focus.x, 0, focus.z);
      this.camera.position.copy(this.orbit.target).add(EDIT_EYE);
      this.canvas.addEventListener("pointerdown", this.down);
      this.canvas.addEventListener("pointermove", this.moveOver);
      this.canvas.addEventListener("pointerleave", this.leave);
      window.addEventListener("pointerup", this.up);
      this.scene.add(this.group);
    } else {
      const saved = this.saved;
      if (saved === null) throw new Error("adventure: the editor closed without having opened");
      this.camera.position.copy(saved.eye);
      this.orbit.target.copy(saved.target);
      this.orbit.mouseButtons = saved.buttons;
      this.orbit.enablePan = saved.pan;
      this.orbit.minDistance = saved.distance.min;
      this.orbit.maxDistance = saved.distance.max;
      this.canvas.removeEventListener("pointerdown", this.down);
      this.canvas.removeEventListener("pointermove", this.moveOver);
      this.canvas.removeEventListener("pointerleave", this.leave);
      window.removeEventListener("pointerup", this.up);
      this.group.removeFromParent();
      this.armed = null;
      this.selected = null;
      this.moving = null;
      this.press = null;
      this.hover = null;
      this.stroke = null;
      this.pointer = null;
      this.setHovered(null);
    }
    this.hoverStale = true;
    this.orbit.update();
    this.refresh();
  }

  /** A frame of the editor: the camera slid as WASD ask, and what the pointer hovers over picked again if anything moved. */
  frame(controls: ControlState, dt: number): void {
    this.slide(controls, dt);
    this.pickHover();
  }

  /** Slide the camera over the map as WASD ask, relative to the way it looks; Shift slides faster. */
  private slide({ ahead, right, sprint }: ControlState, dt: number): void {
    if (ahead === 0 && right === 0) return;
    const look = this.camera.getWorldDirection(new THREE.Vector3());
    const forward = new THREE.Vector2(look.x, look.z).normalize();
    const speed = this.camera.position.distanceTo(this.orbit.target) * PAN_SPEED * (sprint ? SPRINT_PAN : 1) * dt;
    const shift = new THREE.Vector3(forward.x * ahead - forward.y * right, 0, forward.y * ahead + forward.x * right).multiplyScalar(speed);
    this.camera.position.add(shift);
    this.orbit.target.add(shift);
  }

  /** Pick a piece to place, in the colour map it was picked in, or none. */
  arm(entry: PaletteEntry | null): void {
    this.armed = entry === null ? null : { piece: entry.piece, texture: entry.texture, turn: this.armed?.turn ?? 0, mirror: false, y: this.armed?.y ?? 0 };
    if (entry !== null) {
      this.selected = null;
      this.setMode("pieces");
    }
    this.hoverStale = true;
    this.refresh();
  }

  /** Have the left button place and select pieces, or paint the ground. */
  setMode(mode: EditMode): void {
    if (mode === this.mode) return;
    this.setHovered(null);
    this.mode = mode;
    if (mode === "ground") {
      this.armed = null;
      this.selected = null;
    }
    this.stroke = null;
    this.hoverStale = true;
    this.refresh();
  }

  /** Paint with a kind of ground: grass, which also rubs out, dirt or water. */
  setBrush(kind: GroundKind): void {
    this.brush = kind;
    this.setMode("ground");
    this.refresh();
  }

  /** Give the cell under the pointer the next of the tiles the kit makes for its shape. */
  cycleVariant(): void {
    if (this.mode !== "ground" || this.hover === null || this.stroke !== null) return;
    const ground = cycled(this.map.ground, this.hover[0], this.hover[1], this.ground.ramps());
    if (ground !== this.map.ground) this.commit(withGround(this.map, ground));
  }

  /** Put another map in this one's place, as one change that undo takes back. */
  replace(map: MapDocument): void {
    this.selected = null;
    this.commit(map);
  }

  undo(): void {
    this.step(this.undone, this.redone);
  }

  redo(): void {
    this.step(this.redone, this.undone);
  }

  /** Turn the selected piece, or the one about to be placed, a quarter anticlockwise seen from above (or back with `back`). */
  turn(back = false): void {
    const by = back ? 3 : 1;
    this.alter((p) => ({ ...p, turn: ((p.turn ?? 0) + by) % 4 }), (a) => ({ ...a, turn: (a.turn + by) % 4 }));
  }

  mirror(): void {
    this.alter(
      ({ mirror, ...p }) => (mirror === true ? p : { ...p, mirror: true }),
      (a) => ({ ...a, mirror: !a.mirror }),
    );
  }

  /** Raise the selected piece, or the one about to be placed, by `by` storeys; lower it by a negative step. */
  raise(by: number): void {
    const up = (y: number | undefined): number => Math.round(((y ?? 0) + by) * 100) / 100;
    this.alter((p) => ({ ...p, y: up(p.y) }), (a) => ({ ...a, y: up(a.y) }));
  }

  remove(): void {
    const selected = this.selected;
    if (selected === null) return;
    this.selected = null;
    this.commit(replaced(this.map, selected, null));
  }

  /** Have the handles move the selected piece, or turn it. */
  switchHandles(): void {
    this.handles.setMode(this.handles.mode === "translate" ? "rotate" : "translate");
    this.refresh();
  }

  /** Let go of the piece about to be placed, or else of the selection. */
  drop(): void {
    if (this.armed !== null) this.armed = null;
    else this.selected = null;
    this.refresh();
  }

  dispose(): void {
    if (this.active) this.setActive(false, this.orbit.target);
    window.removeEventListener("keydown", this.key);
    this.handles.dispose();
    this.hoverMaterial.dispose();
  }

  private alter(placed: (p: Placement) => Placement, armed: (a: Armed) => Armed): void {
    if (this.selected !== null) {
      const next = placed(this.selected);
      const map = replaced(this.map, this.selected, next);
      this.selected = next;
      this.commit(map);
    } else if (this.armed !== null) {
      this.armed = armed(this.armed);
      this.refresh();
    }
  }

  private commit(map: MapDocument): void {
    this.undone.push(this.map);
    if (this.undone.length > UNDO_DEPTH) this.undone.shift();
    this.redone.length = 0;
    this.show(map);
  }

  private step(from: MapDocument[], to: MapDocument[]): void {
    const map = from.pop();
    if (map === undefined) return;
    to.push(this.map);
    this.show(map);
  }

  /** Make a map the editor's, tell the page, and draw it. */
  private show(map: MapDocument): void {
    if (map.places !== this.map.places) this.pieces = piecesOf(map);
    this.map = map;
    if (this.selected !== null && placeOf(map, this.selected) === null) this.selected = null;
    this.hoverStale = true;
    this.listeners.changed(map);
    this.refresh();
    Promise.all([this.layer.show(this.pieces), this.ground.show(map.ground, this.pieces)]).then(
      () => {
        // A later change may have been asked for while this one was drawn: only the editor's map now is told of.
        if (this.map !== map) return;
        this.listeners.shown(map);
        this.hoverStale = true;
        this.refresh();
      },
      (error: unknown) => this.listeners.failed(String(error)),
    );
  }

  private readonly key = (event: KeyboardEvent): void => {
    if (isTextEntryTarget(event.target)) return;
    const action = editActionOf(event);
    if (action === null || (!this.active && action !== "toggle")) return;
    event.preventDefault();
    if (event.repeat && (action === "toggle" || action === "undo" || action === "redo" || action === "remove" || action === "variant")) return;
    this.act(action, event.shiftKey);
  };

  private act(action: EditAction, shift: boolean): void {
    switch (action) {
      case "toggle":
        this.listeners.toggle();
        return;
      case "turn":
        this.turn();
        return;
      case "turnBack":
        this.turn(true);
        return;
      case "handles":
        this.switchHandles();
        return;
      case "mirror":
        this.mirror();
        return;
      case "raise":
        this.raise(shift ? FINE_RAISE_STEP : RAISE_STEP);
        return;
      case "lower":
        this.raise(-(shift ? FINE_RAISE_STEP : RAISE_STEP));
        return;
      case "remove":
        this.remove();
        return;
      case "undo":
        this.undo();
        return;
      case "redo":
        this.redo();
        return;
      case "drop":
        this.drop();
        return;
      case "ground":
        this.setMode(this.mode === "ground" ? "pieces" : "ground");
        return;
      case "grass":
      case "dirt":
      case "water":
        this.setBrush(action);
        return;
      case "variant":
        this.cycleVariant();
        return;
    }
  }

  /** Aim the ray from the camera through the pointer, and keep where the pointer is for the hover. */
  private aim(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
  }

  /** The cell the ray meets at a height, or null when it looks away from that height. */
  private cellAt(height: number): [number, number] | null {
    return cellOn(this.ray, height);
  }

  /** The nearest drawn piece the ray meets. */
  private pick(): Placement | null {
    return this.layer.pick(this.ray);
  }

  /** Pick what a click would select under the pointer: at most once a frame, and only when the pointer, the camera or the map moved since the last pick. */
  private pickHover(): void {
    if (!this.active || (!this.hoverStale && this.camera.matrixWorld.equals(this.hoverView))) return;
    this.hoverStale = false;
    this.hoverView.copy(this.camera.matrixWorld);
    this.setHovered(this.hoverTarget());
  }

  /** What a click would select: in ground mode the cell a stroke would paint, else the nearest piece. Nothing over a handle, while a drag moves the camera or a handle, or while a piece is picked to place, whose ghost shows where it goes. */
  private hoverTarget(): Placement | null {
    // Any button but the left is the camera's.
    if (this.pointer === null || this.armed !== null || this.handles.dragging || this.handles.axis !== null || (this.buttons & ~1) !== 0) return null;
    this.hoverRay.setFromCamera(this.pointer, this.camera);
    if (this.mode === "ground") {
      const cell = cellOn(this.hoverRay, 0);
      return cell === null ? null : (this.ground.tileAt(cell[0], cell[1]) ?? null);
    }
    const picked = this.layer.pick(this.hoverRay);
    return picked === this.selected ? null : picked;
  }

  /** Lighten what a click would select, or nothing. */
  private setHovered(target: Placement | null): void {
    if (target === this.hovered) return;
    this.hovered = target;
    this.hoverMark?.removeFromParent();
    this.hoverMark =
      target === null ? null : this.mode === "ground" ? this.ground.highlightOf(target, this.hoverMaterial) : this.layer.highlightOf(target, this.hoverMaterial);
    if (this.hoverMark !== null) this.group.add(this.hoverMark);
  }

  /** Paint cells with the brush as part of the stroke under way, drawing the ground as it goes. */
  private paint(cells: readonly Cell[]): void {
    const stroke = this.stroke;
    if (stroke === null) return;
    const ground = painted(stroke.ground, cells, this.brush);
    if (ground === stroke.ground) return;
    stroke.ground = ground;
    this.hoverStale = true;
    this.ground.show(ground, this.pieces).then(
      () => {
        this.hoverStale = true;
      },
      (error: unknown) => this.listeners.failed(String(error)),
    );
  }

  /** The height the pointer's cell is found at: what is about to be placed's, or the ground's. */
  private level(): number {
    return this.armed?.y ?? 0;
  }

  /** Where the handles have put a piece: its cell from their stand-in's place, its height to the finest step, and its turn to a quarter. */
  private fromHandle(from: Placement): Placement {
    const { position, rotation } = this.handle;
    const quarter = ((Math.round(rotation.y / (Math.PI / 2)) % 4) + 4) % 4;
    const step = this.fine ? HEIGHT_SNAP.fine : HEIGHT_SNAP.coarse;
    // Stepped from where the piece stood, so a piece hung between steps keeps its height until it is moved.
    const start = from.y ?? 0;
    const y = Math.round((start + Math.round((position.y - start) / step) * step) * 100) / 100;
    const { y: _y, turn: _turn, ...rest } = from;
    // Moved by whole cells from where it stood, so a piece set off its cell's middle (a wall drawn in to its footprint's edge) keeps its offset.
    const x = from.x + Math.round(position.x - origin(from).x);
    const z = from.z + Math.round(position.z - origin(from).z);
    return { ...rest, x, z, ...(y === 0 ? {} : { y }), ...(quarter === 0 ? {} : { turn: quarter }) };
  }

  private readonly down = (event: PointerEvent): void => {
    this.buttons = event.buttons;
    this.hoverStale = true;
    // A press on a handle is the handles'.
    if (event.button !== 0 || this.handles.dragging || this.handles.axis !== null) return;
    this.aim(event);
    if (this.mode === "ground") {
      const cell = this.cellAt(0);
      if (cell === null) return;
      this.stroke = { ground: this.map.ground, last: cell };
      this.paint([cell]);
      return;
    }
    this.press = { x: event.clientX, y: event.clientY };
  };

  private readonly moveOver = (event: PointerEvent): void => {
    this.fine = event.shiftKey;
    this.buttons = event.buttons;
    this.hoverStale = true;
    this.aim(event);
    this.hover = this.cellAt(this.level());
    const stroke = this.stroke;
    if (stroke !== null && this.hover !== null) {
      const cells = between(stroke.last, this.hover);
      stroke.last = this.hover;
      this.paint(cells);
    }
    this.refresh();
  };

  private readonly leave = (): void => {
    this.pointer = null;
    this.hoverStale = true;
    if (this.press !== null || this.stroke !== null) return;
    this.hover = null;
    this.refresh();
  };

  private readonly up = (event: PointerEvent): void => {
    this.buttons = event.buttons;
    this.hoverStale = true;
    const stroke = this.stroke;
    if (event.button === 0 && stroke !== null) {
      this.stroke = null;
      if (stroke.ground !== this.map.ground) this.commit(withGround(this.map, stroke.ground));
      return;
    }
    if (event.button !== 0 || this.press === null) return;
    const click = Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) <= CLICK_SLOP;
    this.press = null;
    if (!click) return;
    if (this.armed === null) {
      this.selected = this.pick();
      this.refresh();
      return;
    }
    if (this.hover !== null) {
      const { piece, turn, mirror, y, texture } = this.armed;
      const placement: Placement = { piece, x: this.hover[0], z: this.hover[1] };
      if (y !== 0) placement.y = y;
      if (turn !== 0) placement.turn = turn;
      if (mirror) placement.mirror = true;
      if (texture !== undefined) placement.texture = texture;
      this.commit(added(this.map, placement));
      return;
    }
    this.refresh();
  };

  /** Draw the selection, the cell under the pointer and the ghost of what is being placed or moved, and tell the panel. */
  private refresh(): void {
    const box = this.selected === null ? undefined : this.layer.shownBoundsOf(this.selected);
    this.selectionBox.visible = this.active && box !== undefined;
    if (box !== undefined) this.selectionBox.box.copy(box);

    const level = this.level();
    this.cellMark.visible = this.active && this.hover !== null && (this.armed !== null || this.selected === null);
    if (this.hover !== null) this.cellMark.position.set(this.hover[0], level + MARK_LIFT, this.hover[1]);

    // The handles hold the selected piece while nothing is about to be placed; their stand-in waits at its origin, turned as it is.
    const held = this.active && this.armed === null ? this.selected : null;
    if (held === null) this.handles.detach();
    else {
      if (this.moving === null) {
        this.handle.position.copy(origin(held));
        this.handle.rotation.set(0, ((held.turn ?? 0) * Math.PI) / 2, 0);
      }
      this.handles.attach(this.handle);
      // A piece turns only about the up way.
      this.handles.showX = this.handles.showZ = this.handles.mode === "translate";
    }
    this.handles.enabled = held !== null;

    const ghost: Placement | null =
      this.moving ??
      (this.armed !== null && this.hover !== null
        ? { ...this.armed, x: this.hover[0], z: this.hover[1] }
        : null);
    this.showGhost(this.active ? ghost : null);

    const selected = this.selected;
    const place = selected === null ? null : placeOf(this.map, selected);
    const view: EditorView = {
      selected: selected === null || place === null ? null : { placement: selected, place },
      armed: this.armed?.piece ?? null,
      armedTexture: this.armed?.texture,
      canUndo: this.undone.length > 0,
      canRedo: this.redone.length > 0,
      mode: this.mode,
      brush: this.brush,
    };
    const told = this.told;
    if (
      told !== null &&
      told.selected?.placement === view.selected?.placement &&
      told.selected?.place === view.selected?.place &&
      told.armed === view.armed &&
      told.armedTexture === view.armedTexture &&
      told.canUndo === view.canUndo &&
      told.canRedo === view.canRedo &&
      told.mode === view.mode &&
      told.brush === view.brush
    ) {
      return;
    }
    this.told = view;
    this.listeners.view(view);
  }

  /** Show a see-through copy of a piece where it would stand, or none. Each piece's ghost loads once. */
  private showGhost(at: Placement | null): void {
    if (at === null) {
      this.ghostWanted = null;
      this.ghost?.removeFromParent();
      this.ghost = null;
      return;
    }
    const name = ghostName(at);
    this.ghostWanted = name;
    let loading = this.ghosts.get(name);
    if (loading === undefined) {
      loading = this.layer.pieceOf(at.piece, at.texture).then(seeThrough);
      this.ghosts.set(name, loading);
    }
    loading.then(
      (ghost) => {
        if (this.ghostWanted !== name || !this.active) return;
        if (this.ghost !== ghost) {
          this.ghost?.removeFromParent();
          this.ghost = ghost;
          this.group.add(ghost);
        }
        ghost.matrix.copy(placementMatrix(at));
      },
      (error: unknown) => this.listeners.failed(String(error)),
    );
  }
}

/** The cell a ray meets at a height, or null when it looks away from that height. */
function cellOn(ray: THREE.Raycaster, height: number): [number, number] | null {
  const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), new THREE.Vector3());
  return point === null ? null : [Math.floor(point.x), Math.floor(point.z)];
}

/**
 * The cells from one to the next, the first left out, each a side's step from
 * the one before: a pointer moving fast skips cells, and a stroke painted
 * corner to corner would leave a way broken.
 */
function between(from: Cell, to: Cell): Cell[] {
  const [ax, az] = from;
  const [bx, bz] = to;
  const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
  const cells: Cell[] = [];
  let [x, z] = from;
  for (let i = 1; i <= steps; i++) {
    const nx = Math.round(ax + ((bx - ax) * i) / steps);
    const nz = Math.round(az + ((bz - az) * i) / steps);
    if (nx !== x && nz !== z) cells.push([nx, z]);
    cells.push([nx, nz]);
    [x, z] = [nx, nz];
  }
  return cells;
}

/** A piece's origin in the world: its cell's middle, at its height. */
function origin(p: Placement): THREE.Vector3 {
  return new THREE.Vector3(p.x + 0.5, p.y ?? 0, p.z + 0.5);
}

/** Whether two placements stand the same. */
function same(a: Placement, b: Placement): boolean {
  return a.x === b.x && a.z === b.z && (a.y ?? 0) === (b.y ?? 0) && (a.turn ?? 0) === (b.turn ?? 0);
}

/** A line drawn over everything, in a token's colour, so what it marks is never hidden by the pieces round it. */
function overlayLine(token: string): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: themeColor(token), depthTest: false, transparent: true });
}

/** A ghost's name: its piece, in its texture. */
const ghostName = (p: Placement): string => `${p.piece} ${p.texture ?? ""}`;

/** A piece drawn see-through, in its own copies of its materials so the map's stay as they are. */
function seeThrough(piece: THREE.Object3D): THREE.Object3D {
  piece.matrixAutoUpdate = false;
  piece.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (Array.isArray(child.material)) throw new Error("adventure: a kit piece has a mesh of several materials");
    const material = child.material.clone();
    Object.assign(material, { transparent: true, opacity: GHOST_OPACITY, depthWrite: false });
    child.material = material;
  });
  return piece;
}
