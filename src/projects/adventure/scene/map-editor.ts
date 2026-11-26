import * as THREE from "three/webgpu";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import { isTextEntryTarget } from "@/shared/lib/utils";
import { added, piecesOf, placeOf, replaced, type MapDocument } from "../editor/map";
import { editActionOf, FINE_RAISE_STEP, RAISE_STEP, type EditAction } from "../editor/keys";
import type { ControlState } from "../input/controls";
import type { KitPiece } from "../kit";
import type { Placement } from "../town";
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

/** What the editor's panel shows: the piece selected and where it stands, the piece about to be placed, and whether undo and redo reach anything. */
export interface EditorView {
  selected: { placement: Placement; place: string } | null;
  armed: KitPiece | null;
  canUndo: boolean;
  canRedo: boolean;
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

/** The piece about to be placed, and how it will stand. */
interface Armed {
  piece: KitPiece;
  turn: number;
  mirror: boolean;
  y: number;
}

/** A press on a piece, which moves it if the pointer is dragged. */
interface Drag {
  placement: Placement;
  /** The cell the press was in, at the piece's height. */
  from: readonly [number, number];
  moved: boolean;
}

interface Saved {
  eye: THREE.Vector3;
  target: THREE.Vector3;
  buttons: OrbitControls["mouseButtons"];
  pan: boolean;
  distance: { min: number; max: number };
}

/**
 * The map editor, in the scene: click a piece to select it, drag it to move
 * it, and turn, mirror, raise, lower or delete it from the keys or the panel;
 * pick a piece from the palette and click a cell to place it. The left button
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
  private readonly ghosts = new Map<KitPiece, Promise<THREE.Object3D>>();
  private ghost: THREE.Object3D | null = null;
  /** The ghost asked for last: one that loads after another was asked for is never shown. */
  private ghostWanted: KitPiece | null = null;
  private readonly undone: MapDocument[] = [];
  private readonly redone: MapDocument[] = [];
  private selected: Placement | null = null;
  private armed: Armed | null = null;
  /** The cell under the pointer, at the height of what is being placed or moved. */
  private hover: readonly [number, number] | null = null;
  private press: { x: number; y: number } | null = null;
  private drag: Drag | null = null;
  private saved: Saved | null = null;
  active = false;

  constructor(
    private map: MapDocument,
    private readonly layer: TownLayer,
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
    this.group.add(this.cellMark, this.selectionBox);
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
      this.drag = null;
      this.press = null;
      this.hover = null;
    }
    this.orbit.update();
    this.refresh();
  }

  /** Slide the camera over the map as WASD ask, relative to the way it looks; Shift slides faster. */
  frame({ ahead, right, sprint }: ControlState, dt: number): void {
    if (ahead === 0 && right === 0) return;
    const look = this.camera.getWorldDirection(new THREE.Vector3());
    const forward = new THREE.Vector2(look.x, look.z).normalize();
    const speed = this.camera.position.distanceTo(this.orbit.target) * PAN_SPEED * (sprint ? SPRINT_PAN : 1) * dt;
    const shift = new THREE.Vector3(forward.x * ahead - forward.y * right, 0, forward.y * ahead + forward.x * right).multiplyScalar(speed);
    this.camera.position.add(shift);
    this.orbit.target.add(shift);
  }

  /** Pick a piece to place, or none. */
  arm(piece: KitPiece | null): void {
    this.armed = piece === null ? null : { piece, turn: this.armed?.turn ?? 0, mirror: false, y: this.armed?.y ?? 0 };
    if (piece !== null) this.selected = null;
    this.refresh();
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

  /** Let go of the piece about to be placed, or else of the selection. */
  drop(): void {
    if (this.armed !== null) this.armed = null;
    else this.selected = null;
    this.refresh();
  }

  dispose(): void {
    if (this.active) this.setActive(false, this.orbit.target);
    window.removeEventListener("keydown", this.key);
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
    this.map = map;
    if (this.selected !== null && placeOf(map, this.selected) === null) this.selected = null;
    this.listeners.changed(map);
    this.refresh();
    this.layer.show(piecesOf(map)).then(
      () => {
        // A later change may have been asked for while this one was drawn: only the editor's map now is told of.
        if (this.map !== map) return;
        this.listeners.shown(map);
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
    if (event.repeat && (action === "toggle" || action === "undo" || action === "redo" || action === "remove")) return;
    this.act(action, event.shiftKey);
  };

  private act(action: EditAction, shift: boolean): void {
    switch (action) {
      case "toggle":
        this.listeners.toggle();
        return;
      case "turn":
        this.turn(shift);
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
    }
  }

  /** Aim the ray from the camera through the pointer. */
  private aim(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1),
      this.camera,
    );
  }

  /** The cell the ray meets at a height, or null when it looks away from that height. */
  private cellAt(height: number): [number, number] | null {
    const point = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), new THREE.Vector3());
    return point === null ? null : [Math.floor(point.x), Math.floor(point.z)];
  }

  /** The nearest drawn piece the ray meets: a box test for each, then the pieces whose boxes it meets, face by face. */
  private pick(): Placement | null {
    let best: { placement: Placement; distance: number } | null = null;
    for (const placement of piecesOf(this.map)) {
      const box = this.layer.shownBoundsOf(placement);
      if (box === undefined || !this.ray.ray.intersectsBox(box)) continue;
      const hit = this.ray.intersectObject(this.layer.solidOf(placement), true)[0] as THREE.Intersection | undefined;
      if (hit !== undefined && (best === null || hit.distance < best.distance)) best = { placement, distance: hit.distance };
    }
    return best?.placement ?? null;
  }

  /** The height the pointer's cell is found at: what is being moved's, or what is about to be placed's, or the ground's. */
  private level(): number {
    return this.drag?.placement.y ?? this.armed?.y ?? this.selected?.y ?? 0;
  }

  private readonly down = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.aim(event);
    this.press = { x: event.clientX, y: event.clientY };
    if (this.armed !== null) return;
    const picked = this.pick();
    this.selected = picked;
    const from = picked === null ? null : this.cellAt(picked.y ?? 0);
    this.drag = picked === null || from === null ? null : { placement: picked, from, moved: false };
    this.refresh();
  };

  private readonly moveOver = (event: PointerEvent): void => {
    this.aim(event);
    if (this.press !== null && this.drag !== null && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > CLICK_SLOP) this.drag.moved = true;
    this.hover = this.cellAt(this.level());
    this.refresh();
  };

  private readonly leave = (): void => {
    if (this.press !== null) return;
    this.hover = null;
    this.refresh();
  };

  private readonly up = (event: PointerEvent): void => {
    if (event.button !== 0 || this.press === null) return;
    const click = Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) <= CLICK_SLOP;
    const drag = this.drag;
    this.press = null;
    this.drag = null;
    const moved = drag?.moved === true ? this.moved(drag) : null;
    if (drag !== null && moved !== null) {
      this.selected = moved;
      this.commit(replaced(this.map, drag.placement, moved));
      return;
    }
    if (click && this.armed !== null && this.hover !== null) {
      const { piece, turn, mirror, y } = this.armed;
      const placement: Placement = { piece, x: this.hover[0], z: this.hover[1] };
      if (y !== 0) placement.y = y;
      if (turn !== 0) placement.turn = turn;
      if (mirror) placement.mirror = true;
      this.commit(added(this.map, placement));
      return;
    }
    this.refresh();
  };

  /** Where a dragged piece would go: moved by whole cells from where it was pressed to the cell under the pointer, or null where it hasn't left its cell. */
  private moved(drag: Drag): Placement | null {
    if (this.hover === null) return null;
    const dx = this.hover[0] - drag.from[0];
    const dz = this.hover[1] - drag.from[1];
    return dx === 0 && dz === 0 ? null : { ...drag.placement, x: drag.placement.x + dx, z: drag.placement.z + dz };
  }

  /** Draw the selection, the cell under the pointer and the ghost of what is being placed or moved, and tell the panel. */
  private refresh(): void {
    const box = this.selected === null ? undefined : this.layer.shownBoundsOf(this.selected);
    this.selectionBox.visible = this.active && box !== undefined;
    if (box !== undefined) this.selectionBox.box.copy(box);

    const level = this.level();
    this.cellMark.visible = this.active && this.hover !== null && (this.armed !== null || this.drag?.moved === true || this.selected === null);
    if (this.hover !== null) this.cellMark.position.set(this.hover[0], level + MARK_LIFT, this.hover[1]);

    const dragged = this.drag?.moved === true ? this.moved(this.drag) : null;
    const ghost: Placement | null =
      dragged ?? (this.armed !== null && this.hover !== null ? { ...this.armed, x: this.hover[0], z: this.hover[1] } : null);
    this.showGhost(this.active ? ghost : null);

    const selected = this.selected;
    const place = selected === null ? null : placeOf(this.map, selected);
    this.listeners.view({
      selected: selected === null || place === null ? null : { placement: selected, place },
      armed: this.armed?.piece ?? null,
      canUndo: this.undone.length > 0,
      canRedo: this.redone.length > 0,
    });
  }

  /** Show a see-through copy of a piece where it would stand, or none. Each piece's ghost loads once. */
  private showGhost(at: Placement | null): void {
    this.ghostWanted = at?.piece ?? null;
    if (at === null) {
      this.ghost?.removeFromParent();
      this.ghost = null;
      return;
    }
    let loading = this.ghosts.get(at.piece);
    if (loading === undefined) {
      loading = this.layer.pieceOf(at.piece).then(seeThrough);
      this.ghosts.set(at.piece, loading);
    }
    loading.then(
      (ghost) => {
        if (this.ghostWanted !== at.piece || !this.active) return;
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

/** A line drawn over everything, in a token's colour, so what it marks is never hidden by the pieces round it. */
function overlayLine(token: string): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: themeColor(token), depthTest: false, transparent: true });
}

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
