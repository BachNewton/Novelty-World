import { blend, createBuilder, flat, seeded, type MeshBuilder, type Vec2 } from "./kit";
import type { Ground, GroundSite } from "./places";

/*
 * Kungsö battery in Jomala, one of the coastal batteries Russia built on Åland in the First World War, on the bare
 * granite of its height over the western approach to Mariehamn: what's left is a line of round concrete gun pits on
 * the crest, each a ring wall round a floor with the gun's mounting in the middle, and the infantry trench behind them
 * that OSM maps, blasted into the rock and lined with stone. The trench runs north-west to south-east along the crest;
 * the pits lie on its seaward side, south-west of it, clear of the tracks and paths up from the car park to the north-east.
 */

/** The trench's line, metres east and north of the site's middle, along OSM's outline of it. */
const TRENCH: readonly Vec2[] = [
  [50, -38],
  [26.9, -19.2],
  [3.8, -0.5],
  [-19.4, 18.3],
  [-42.5, 37],
];
/** Where along the line each pit stands, and how far out to the south-west. */
const PITS: readonly (readonly [number, number])[] = [
  [-0.75, 9],
  [-0.25, 9.5],
  [0.25, 9],
  [0.75, 9.5],
];
const PIT = { radius: 4.2, wall: 0.7, rise: 0.9, sink: 0.6 };

const along = (share: number): Vec2 => {
  const [a, b] = [TRENCH[0], TRENCH[TRENCH.length - 1]];
  return [a[0] + ((b[0] - a[0]) * (share + 1)) / 2, a[1] + ((b[1] - a[1]) * (share + 1)) / 2];
};
const [dirE, dirN] = (() => {
  const [a, b] = [TRENCH[0], TRENCH[TRENCH.length - 1]];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
})();
/** South-west of the line: its right side going north-west. */
const out: Vec2 = [-dirN, dirE];

function pitCentre([share, off]: readonly [number, number]): Vec2 {
  const [e, n] = along(share);
  return [e + out[0] * off, n + out[1] * off];
}

function pit(mesh: MeshBuilder, ground: Ground, centre: Vec2, random: () => number, far: boolean) {
  const sides = far ? 8 : 20;
  const base = ground(centre[0], centre[1]);
  const concrete = flat("concrete");
  const worn = blend(flat("concrete"), flat("earth-turf"), 0.3);
  const dark = flat("concrete-dark");
  const plan: Vec2 = [centre[0], -centre[1]];
  const { radius, wall, rise, sink } = PIT;
  // The ring wall, its top a little broken, the floor inside sunk below the rock round about.
  mesh.lathe(plan, [[radius + wall, base - sink], [radius + wall, base + rise * 0.7], [radius + wall * 0.4, base + rise], [radius, base + rise]], sides, [concrete, worn, worn]);
  mesh.lathe(plan, [[radius, base + rise], [radius, base - 0.5], [0, base - 0.5]], sides, [dark, blend(dark, flat("earth-turf"), 0.4)]);
  if (far) return;
  // The gun's mounting ring and its bolts, and the ammunition niches in the wall.
  mesh.lathe(plan, [[1.3, base - 0.5], [1.3, base - 0.15], [0.9, base - 0.15], [0.9, base - 0.35], [0, base - 0.35]], 16, [concrete, concrete, dark, dark]);
  for (let bolt = 0; bolt < 8; bolt++) {
    const angle = (bolt / 8) * Math.PI * 2;
    mesh.box([plan[0] + Math.cos(angle) * 1.1, base - 0.08, plan[1] + Math.sin(angle) * 1.1], [0.08, 0.14, 0.08], flat("cross-iron"));
  }
  const toward = Math.atan2(-out[1], out[0]) + Math.PI;
  for (const offset of [-0.9, 0.9]) {
    const angle = toward + offset;
    mesh.box([plan[0] + Math.cos(angle) * (radius - 0.05), base - 0.05, plan[1] + Math.sin(angle) * (radius - 0.05)], [0.15, 0.8, 1.0], flat("ruin-shadow"), -angle);
  }
  for (let count = 0; count < 6; count++) {
    const angle = random() * Math.PI * 2;
    const reach = radius + wall + 0.4 + random() * 1.5;
    const [x, z] = [plan[0] + Math.cos(angle) * reach, plan[1] + Math.sin(angle) * reach];
    mesh.box([x, ground(x, -z) + 0.1, z], [0.5 + random() * 0.6, 0.3, 0.4 + random() * 0.4], worn, random() * Math.PI);
  }
}

/** The trench: two stone-lined banks along the line, a metre and a half apart, with the floor dark between them. */
function trench(mesh: MeshBuilder, ground: Ground, far: boolean) {
  const stone = flat("field-stone", 0.9);
  const floor = flat("ruin-shadow");
  const step = far ? 18 : 3;
  for (let at = 0; at + 1 < TRENCH.length; at++) {
    const [a, b] = [TRENCH[at], TRENCH[at + 1]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.max(1, Math.round(length / step));
    for (let piece = 0; piece < count; piece++) {
      const point = (s: number): Vec2 => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
      const [p, q] = [point(piece / count), point((piece + 1) / count)];
      const [yp, yq] = [ground(p[0], p[1]), ground(q[0], q[1])];
      for (const side of [-0.85, 0.85]) {
        const [pe, pn, qe, qn] = [p[0] + out[0] * side, p[1] + out[1] * side, q[0] + out[0] * side, q[1] + out[1] * side];
        mesh.quad([pe, yp - 0.6, -pn], [qe, yq - 0.6, -qn], [qe, yq + 0.25, -qn], [pe, yp + 0.25, -pn], stone);
      }
      const [w0, w1] = [-0.85, 0.85].map((side): [number, number] => [out[0] * side, out[1] * side]);
      mesh.quad([p[0] + w0[0], yp + 0.02, -(p[1] + w0[1])], [q[0] + w0[0], yq + 0.02, -(q[1] + w0[1])], [q[0] + w1[0], yq + 0.02, -(q[1] + w1[1])], [p[0] + w1[0], yp + 0.02, -(p[1] + w1[1])], floor);
    }
  }
}

export const KUNGSO_SITE: GroundSite = {
  id: "kungso-battery",
  name: "Kungsö batteri",
  east: 100946,
  north: 6684860,
  replaces: "inside",
  // The car stops at each pit's ring wall; the trench is a slot in the rock it would drop a wheel into, not a wall.
  walls: PITS.map((spec) => {
    const [e, n] = pitCentre(spec);
    const reach = PIT.radius + PIT.wall * 0.5;
    return Array.from({ length: 12 }, (_, at): Vec2 => [e + Math.cos((at / 12) * Math.PI * 2) * reach, n + Math.sin((at / 12) * Math.PI * 2) * reach]);
  }),
  build(ground) {
    const random = seeded(1916);
    const near = createBuilder();
    const far = createBuilder();
    for (const spec of PITS) {
      pit(near, ground, pitCentre(spec), random, false);
      pit(far, ground, pitCentre(spec), random, true);
    }
    trench(near, ground, false);
    trench(far, ground, true);
    return { near: near.done(), far: far.done() };
  },
};
