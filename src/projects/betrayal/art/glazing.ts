import * as THREE from "three";
import { paletteHex, type PaletteKey } from "./palette";
import { CUT_HEIGHT, OUTDOOR, WALL_THICKNESS } from "./room";
import { batch, lightMaterial } from "./shapes";
import { shiny, SHINES } from "./shine";

/**
 * A glasshouse's walls, standing on an outdoor tile's low wall in place of
 * its railings (the `glazing` edging): painted wooden posts in narrow bays,
 * a sill on the coping, a transom and a heavy top plate, and clear glass
 * between them. The posts over the piers are heavier, and stand on the piers
 * cut level with the low wall. Built in an edge's frame (see `buildBoundary`
 * in `stage.ts`): along x, its inner face towards +z.
 */
export const GLAZING = { top: 2.7, bay: 0.95, transom: 2.05, post: 0.2, finial: 0.1 };

const SILL = { height: 0.05, depth: 0.14 };
const PLATE = { height: 0.1, depth: 0.12 };
/** The piers' middle across the wall, as `buildPier` stands them. */
const PIER_Z = OUTDOOR.pier / 2 - WALL_THICKNESS / 2;
/** How far a run of glazing reaches past its end into the heavy post there, so the two never meet face to face. */
const REACH = (OUTDOOR.pier - GLAZING.post) / 2 + 0.005;

/** The glass: faint moonlit panes that take the room's lamps and the moon as glass does. */
function glassMaterial(): THREE.MeshBasicMaterial {
  const glass = shiny(lightMaterial(0.16), SHINES.glass);
  glass.color.set(paletteHex("moon"));
  return glass;
}

/** A heavy post over a pier at `x`, from the cut height to its capped top. */
function addPost(frame: ReturnType<typeof batch>, x: number, colour: PaletteKey) {
  const { post, top, finial } = GLAZING;
  frame.block([post, top - CUT_HEIGHT, post], colour, [x, CUT_HEIGHT, PIER_Z]);
  frame.block([post + 0.04, 0.04, post + 0.04], colour, [x, top, PIER_Z]);
  frame.block([0.07, finial, 0.07], colour, [x, top + 0.04, PIER_Z]);
}

/** One pane of glass between `x0` and `x1`, from `y0` to `y1`, in the wall's middle. */
function pane(material: THREE.Material, x0: number, x1: number, y0: number, y1: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), material);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
  mesh.userData.noShadow = true;
  return mesh;
}

/**
 * One edge's glazing: `runs` are the stretches of low wall it stands on,
 * between the piers at `piers`; `doors` are the gateways, glazed over above
 * their lintels; `colour` is the frame's paint.
 */
export function glazing(runs: [x0: number, x1: number][], piers: number[], doors: { centre: number; width: number; top: number }[], colour: PaletteKey): THREE.Object3D[] {
  const { top, bay, transom } = GLAZING;
  const frame = batch();
  const glass = glassMaterial();
  const panes: THREE.Mesh[] = [];
  const sillTop = CUT_HEIGHT + SILL.height;
  const plateFoot = top - PLATE.height;
  for (const [x0, x1] of runs) {
    const [a, b] = [x0 - REACH, x1 + REACH];
    frame.block([b - a, SILL.height, SILL.depth], colour, [(a + b) / 2, CUT_HEIGHT, 0]);
    frame.block([b - a, 0.04, 0.06], colour, [(a + b) / 2, transom, 0]);
    const bays = Math.max(1, Math.round((x1 - x0) / bay));
    const step = (x1 - x0) / bays;
    for (let i = 1; i < bays; i++) frame.block([0.06, plateFoot - sillTop, 0.08], colour, [x0 + i * step, sillTop, 0]);
    // A glazing bar down the middle of each bay, shallower than the posts so its faces never lie in theirs.
    for (let i = 0; i < bays; i++) frame.block([0.022, plateFoot - sillTop, 0.035], colour, [x0 + (i + 0.5) * step, sillTop, 0]);
    panes.push(pane(glass, x0, x1, sillTop, plateFoot));
  }
  for (const door of doors) {
    const [a, b] = [door.centre - door.width / 2, door.centre + door.width / 2];
    frame.block([b - a + REACH * 2, 0.1, 0.1], colour, [door.centre, door.top, 0]);
    frame.block([0.022, plateFoot - door.top - 0.1, 0.035], colour, [door.centre, door.top + 0.1, 0]);
    panes.push(pane(glass, a, b, door.top + 0.1, plateFoot));
  }
  const ends = runs.flat();
  const [left, right] = [Math.min(...ends) - REACH, Math.max(...ends) + REACH];
  frame.block([right - left, PLATE.height, PLATE.depth], colour, [(left + right) / 2, plateFoot, 0]);
  for (const x of piers) addPost(frame, x, colour);
  return [frame.mesh(), ...panes];
}

/** The heavy post standing alone over a corner pier at `x`, for a corner whose own edge is cut. */
export function glazingPost(x: number, colour: PaletteKey): THREE.Mesh {
  const frame = batch();
  addPost(frame, x, colour);
  return frame.mesh();
}
