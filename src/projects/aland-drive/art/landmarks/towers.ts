import { createBuilder, flat, headed, type MeshBuilder, type Paint, type Vec3 } from "./kit";
import type { GroundSite } from "./places";

/*
 * Åland's timber lookout towers on its heights: four corner posts, braced at every landing, a stair zig-zagging up
 * inside, and a railed deck over the treetops, roofed or open. Each is fitted to its own: its height from the laser
 * and OSM's `height`, its footprint and its bearing from OSM's outline, whether its posts splay from the photo's
 * shadow. Getabergen's, on the hill above Soltuna, stands 15 m to its red roof; Storberget's in Pålsböle, 45 steps up,
 * is a straight-sided box of posts under a hip roof; Orrdalsklint's, on the island's highest point, is a low open deck
 * just clearing the summit's stunted pines.
 */

interface TowerSpec {
  id: string;
  name: string;
  east: number;
  north: number;
  /** The compass bearing of the model's +x side. */
  bearingDeg: number;
  /** Half the post square at the ground and at the deck, along x and z. */
  foot: readonly [number, number];
  head: readonly [number, number];
  deck: number;
  /** Roof posts' height over the deck and the ridge's, or none for an open deck. */
  roof: { eaves: number; peak: number; paint: "falu-red" | "tower-tin" } | null;
}

const TOWERS: readonly TowerSpec[] = [
  { id: "getabergen-tower", name: "Getabergens utsiktstorn", east: 106219, north: 6715712.1, bearingDeg: 24, foot: [2.2, 2.2], head: [1.55, 1.55], deck: 12.4, roof: { eaves: 2.2, peak: 3.1, paint: "falu-red" } },
  { id: "storberget-tower", name: "Storbergets utsiktstorn", east: 108726, north: 6702467.9, bearingDeg: 0, foot: [1.95, 2.55], head: [1.95, 2.55], deck: 9.4, roof: { eaves: 2.2, peak: 4.2, paint: "tower-tin" } },
  { id: "orrdalsklint-tower", name: "Orrdalsklints utsiktstorn", east: 120587, north: 6707782, bearingDeg: 8, foot: [2.1, 2.1], head: [1.55, 1.55], deck: 5.1, roof: null },
];

const SINK = 0.4;
const RAIL = 1.1;
const POST = 0.12;
const LANDING_M = 2.6;

const corners = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
] as const;

function nearTower(spec: TowerSpec, mesh: MeshBuilder) {
  const timber = flat("timber-grey");
  const pale = flat("timber-pale");
  const dark = flat("timber-dark");
  const { foot, head, deck } = spec;
  const half = (y: number, axis: 0 | 1) => foot[axis] + (Math.max(0, y) / deck) * (head[axis] - foot[axis]);
  const at = ([a, b]: readonly [number, number], y: number): Vec3 => [a * half(y, 0), y, b * half(y, 1)];
  const top = deck + (spec.roof?.eaves ?? RAIL);
  for (const corner of corners) mesh.tube(at(corner, -SINK), at(corner, top), POST * 1.2, POST, 4, timber);

  const landings = Math.max(1, Math.round(deck / LANDING_M));
  const levels = Array.from({ length: landings + 1 }, (_, level) => (level * deck) / landings);
  for (let level = 0; level + 1 < levels.length; level++) {
    const [low, high] = [levels[level], levels[level + 1]];
    corners.forEach((corner, side) => {
      const next = corners[(side + 1) % 4];
      mesh.line(at(corner, high), at(next, high), 0.13, timber);
      // A brace across each face, each landing the other way, so the faces read as crossed.
      if ((level + side) % 2 === 0) mesh.line(at(corner, low + 0.2), at(next, high - 0.1), 0.09, dark);
      else mesh.line(at(next, low + 0.2), at(corner, high - 0.1), 0.09, dark);
    });
    // A flight up inside, turning at each landing.
    const toward = level % 2 === 0 ? 1 : -1;
    const across = (level % 2 === 0 ? 0.35 : -0.35) * half(low, 1);
    const run = 0.7 * half(high, 0);
    const width = Math.min(0.42, half(high, 1) * 0.32);
    const from: Vec3 = [-toward * run, low + 0.05, across];
    const to: Vec3 = [toward * run, high, across];
    mesh.quad([from[0], from[1], from[2] - width], [to[0], to[1], to[2] - width], [to[0], to[1], to[2] + width], [from[0], from[1], from[2] + width], pale);
    mesh.line([from[0], from[1] + 0.9, from[2] + width], [to[0], to[1] + 0.9, to[2] + width], 0.05, dark);
    // The landing it arrives on.
    mesh.box([to[0] + toward * 0.25, high - 0.04, across], [0.9, 0.08, width * 2.4], pale);
  }

  // The deck, a little wider than the posts, and its rail.
  const [dx, dz] = [head[0] + 0.3, head[1] + 0.3];
  mesh.box([0, deck - 0.08, 0], [dx * 2, 0.16, dz * 2], pale);
  const rim = (corner: readonly [number, number], y: number): Vec3 => [corner[0] * dx, y, corner[1] * dz];
  corners.forEach((corner, side) => {
    const next = corners[(side + 1) % 4];
    mesh.line(rim(corner, deck), rim(corner, deck + RAIL), 0.09, timber);
    for (const y of [deck + RAIL, deck + RAIL * 0.5]) mesh.line(rim(corner, y), rim(next, y), 0.08, pale);
    mesh.line(rim(corner, deck + 0.12), rim(next, deck + 0.12), 0.2, timber);
  });
  if (spec.roof) roof(spec, mesh, dx, dz);
}

function roof(spec: TowerSpec, mesh: MeshBuilder, dx: number, dz: number) {
  if (!spec.roof) return;
  const { eaves, peak } = spec.roof;
  const paint = flat(spec.roof.paint);
  const under = flat(spec.roof.paint, 0.6);
  const [eave, ridge] = [spec.deck + eaves, spec.deck + peak];
  const over = 0.45;
  const [ox, oz] = [dx + over, dz + over];
  // A hip roof: a short ridge along the longer side, a point when the deck is square.
  const ridgeHalf = Math.max(0, Math.abs(ox - oz) * 0.9) * (ox > oz ? 1 : 0);
  const ridgeHalfZ = Math.max(0, Math.abs(ox - oz) * 0.9) * (oz > ox ? 1 : 0);
  const lowY = eave - over * 0.5;
  const r1: Vec3 = [-ridgeHalf, ridge, -ridgeHalfZ];
  const r2: Vec3 = [ridgeHalf, ridge, ridgeHalfZ];
  const c = (a: number, b: number): Vec3 => [a * ox, lowY, b * oz];
  if (ridgeHalf > 0) {
    mesh.quad(c(-1, 1), c(1, 1), r2, r1, paint);
    mesh.quad(c(1, -1), c(-1, -1), r1, r2, blendShade(paint, 0.9));
    mesh.tri(c(1, 1), c(1, -1), r2, blendShade(paint, 0.95));
    mesh.tri(c(-1, -1), c(-1, 1), r1, blendShade(paint, 0.85));
  } else if (ridgeHalfZ > 0) {
    mesh.quad(c(1, -1), c(1, 1), r2, r1, paint);
    mesh.quad(c(-1, 1), c(-1, -1), r1, r2, blendShade(paint, 0.9));
    mesh.tri(c(1, 1), c(-1, 1), r2, blendShade(paint, 0.95));
    mesh.tri(c(-1, -1), c(1, -1), r1, blendShade(paint, 0.85));
  } else {
    const tip: Vec3 = [0, ridge, 0];
    corners.forEach((corner, side) => {
      const next = corners[(side + 1) % 4];
      mesh.tri(c(corner[0], corner[1]), c(next[0], next[1]), tip, blendShade(paint, 0.85 + side * 0.05));
    });
  }
  mesh.cap([[-ox, -oz], [ox, -oz], [ox, oz], [-ox, oz]], lowY - 0.02, under);
}

const blendShade = (paint: Paint, shade: number): Paint => [Math.round(paint[0] * shade), Math.round(paint[1] * shade), Math.round(paint[2] * shade), paint[3]];

/** From afar: the four posts, the deck and the roof, the same outline as the near version's. */
function farTower(spec: TowerSpec, mesh: MeshBuilder) {
  const timber = flat("timber-grey", 0.85);
  const { foot, head, deck } = spec;
  const top = deck + (spec.roof?.eaves ?? RAIL);
  for (const [a, b] of corners) mesh.tube([a * foot[0], -SINK, b * foot[1]], [a * head[0], top, b * head[1]], 0.22, 0.2, 3, timber);
  const [dx, dz] = [head[0] + 0.3, head[1] + 0.3];
  mesh.box([0, deck - 0.4 + RAIL / 2, 0], [dx * 2, RAIL + 0.6, dz * 2], flat("timber-grey", 0.75), 0, flat("timber-pale"));
  if (spec.roof) roof(spec, mesh, dx, dz);
}

export const TOWER_SITES: GroundSite[] = TOWERS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  east: spec.east,
  north: spec.north,
  replaces: "inside",
  build() {
    const near = createBuilder(headed(spec.bearingDeg + 90));
    nearTower(spec, near);
    const far = createBuilder(headed(spec.bearingDeg + 90));
    farTower(spec, far);
    return { near: near.done(), far: far.done() };
  },
}));
