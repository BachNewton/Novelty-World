import * as THREE from "three/webgpu";
import { nameLabel } from "./name-label";

/** What the overlay names: a kit piece, a character, a part of the town, and the cells of the grid. */
export type Named = "piece" | "character" | "place";

/** How near the player, in world units across the ground, each kind of thing must be to be named: a part of the town from across the village, a piece only close by, where there are fewest. */
const REACH: Record<Named, number> = { piece: 5, character: 10, place: 20 };
/** How tall each kind's label is: a part of the town's the largest, read from afar. */
const HEIGHT: Record<Named | "cell", number> = { piece: 0.09, character: 0.13, place: 0.28, cell: 0.08 };
/** How many cells either way of the player's own are numbered. */
const CELL_REACH = 4;
/** How far apart stacked labels are, in label heights. */
const STACK_GAP = 1.3;
/** How far toward the camera a label is drawn from where it floats. */
const TOWARD_CAMERA = 0.35;
/** Where a cell's number floats: over the ground, just inside the cell's −x, −z corner, the corner the code names a cell by, and clear of a piece's name over its middle. */
const CELL_LIFT = 0.06;
const CELL_INSET = 0.15;

interface Item {
  kind: Named;
  text: string;
  /** Where its label floats, read each time it's shown: a character moves. */
  at: () => THREE.Vector3;
  /** Whether it is in the world now: a villager is out of it while a player plays as them. */
  present: () => boolean;
  label: THREE.Sprite | null;
  /** The frame its label was last shown in, by any player. */
  shownIn: number;
  /** The point it floats at, to the tenth, which labels at one point stack by. */
  point: string;
}

/**
 * The debug overlay, toggled with ~: the name the code gives each thing near
 * the player (a kit piece, a character, a part of the town) and the
 * number of each cell round them, so the owner can name what they see in the
 * code's own words. A label is made when what it names comes into a player's
 * reach and freed when it has left every player's, so the labels in the scene
 * are only the few near a player, however far they roam. Each is drawn pulled a little toward the camera from where it floats, so the
 * piece it names, or one beside it, doesn't cut through it, while anything
 * standing between it and the camera still hides it.
 */
export class DebugOverlay {
  readonly group = new THREE.Group();
  private readonly items: Item[] = [];
  /** Each cell's number while it is near a player, and the frame it was last shown in. */
  private readonly cells = new Map<string, { label: THREE.Sprite; shownIn: number }>();
  /** Counts the frames, so a label shown to neither player this frame is freed at its end. */
  private frame = 0;
  /** How many labels already float at each point, so the next one there stacks above them. */
  private readonly stacked = new Map<string, number>();

  constructor() {
    this.group.visible = false;
  }

  /**
   * Name a thing, its label floating where `at` says. Labels for things at one
   * point, such as two pieces in one cell, stack one above the next. A thing
   * that comes and goes says when it is `present`.
   */
  add(kind: Named, text: string, at: () => THREE.Vector3, present: () => boolean = () => true): void {
    const from = at();
    const point = `${Math.round(from.x * 10)},${Math.round(from.y * 10)},${Math.round(from.z * 10)}`;
    const below = this.stacked.get(point) ?? 0;
    this.stacked.set(point, below + 1);
    const lift = below * HEIGHT[kind] * STACK_GAP;
    this.items.push({ kind, text, at: lift === 0 ? at : () => at().clone().add(new THREE.Vector3(0, lift, 0)), present, label: null, shownIn: -1, point });
  }

  /** Take every name of these kinds away, as when what they name has changed; what stacked on them stays where it floats. */
  forget(kinds: readonly Named[]): void {
    const kept: Item[] = [];
    for (const item of this.items) {
      if (!kinds.includes(item.kind)) {
        kept.push(item);
        continue;
      }
      this.stacked.set(item.point, (this.stacked.get(item.point) ?? 1) - 1);
      if (item.label !== null) free(item.label);
    }
    this.items.splice(0, this.items.length, ...kept);
  }

  /** Show the overlay round a point on the ground, seen from the camera at `eye`, or hide it. With two players it is shown round each in turn, before their half of the screen is drawn. */
  update(shown: boolean, x: number, z: number, eye: THREE.Vector3): void {
    this.group.visible = shown;
    if (!shown) return;
    for (const item of this.items) {
      const at = item.at();
      const near = item.present() && Math.hypot(at.x - x, at.z - z) <= REACH[item.kind];
      if (!near) {
        if (item.label !== null) item.label.visible = false;
        continue;
      }
      if (item.label === null) {
        item.label = this.made(item.text, HEIGHT[item.kind]);
      }
      place(item.label, toward(at, eye));
      item.shownIn = this.frame;
    }
    const [cx, cz] = [Math.floor(x), Math.floor(z)];
    for (const { label } of this.cells.values()) label.visible = false;
    for (let i = cx - CELL_REACH; i <= cx + CELL_REACH; i++) {
      for (let k = cz - CELL_REACH; k <= cz + CELL_REACH; k++) {
        const key = `${i}, ${k}`;
        let cell = this.cells.get(key);
        if (cell === undefined) {
          cell = { label: this.made(key, HEIGHT.cell), shownIn: this.frame };
          this.cells.set(key, cell);
        }
        place(cell.label, toward(new THREE.Vector3(i + CELL_INSET, CELL_LIFT, k + CELL_INSET), eye));
        cell.shownIn = this.frame;
      }
    }
  }

  /** At the end of a frame, after every player's view is drawn: free each label no player was shown, and every label while the overlay is shut. */
  endFrame(): void {
    for (const item of this.items) {
      if (item.label === null || (this.group.visible && item.shownIn === this.frame)) continue;
      free(item.label);
      item.label = null;
    }
    for (const [key, cell] of this.cells) {
      if (this.group.visible && cell.shownIn === this.frame) continue;
      free(cell.label);
      this.cells.delete(key);
    }
    this.frame++;
  }

  /** A label, in the overlay, its matrix set only when it is placed: most frames it doesn't move. */
  private made(text: string, height: number): THREE.Sprite {
    const label = nameLabel(text, height);
    label.matrixAutoUpdate = false;
    this.group.add(label);
    return label;
  }
}

/** Show a label at a point. */
function place(label: THREE.Sprite, at: THREE.Vector3): void {
  label.visible = true;
  if (label.position.equals(at)) return;
  label.position.copy(at);
  label.updateMatrix();
}

/** Take a label out of the scene and give back its texture and material. */
function free(label: THREE.Sprite): void {
  label.removeFromParent();
  label.material.map?.dispose();
  label.material.dispose();
}

/** A point moved a little toward the camera. */
function toward(at: THREE.Vector3, eye: THREE.Vector3): THREE.Vector3 {
  const way = eye.clone().sub(at);
  return at.clone().addScaledVector(way, Math.min(TOWARD_CAMERA, way.length()) / way.length());
}
