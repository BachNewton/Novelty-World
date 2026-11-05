import { blend, createBuilder, flat, headed, seeded, type MeshBuilder, type Paint, type Vec2, type Vec3 } from "./kit";
import { rectangle, type Ground, type GroundSite } from "./places";

/*
 * Graves. On Prästö, across the sound from Bomarsund, the fortress's garrison buried its dead by faith in three
 * graveyards side by side in the pine wood: the Orthodox, the largest, inside a low granite wall, its graves under
 * stone crosses and slabs round a memorial stone with the three-barred cross; the Muslim and the Jewish, small plots in
 * low timber fences, their upright stones round-topped and pointed. Each lies square to the plots' fences as OSM maps
 * them, bearing 50°. And at Johannisberg in Saltvik, the Iron Age grave field on its rocky height: low round cairns
 * and turfed mounds among the trees, a few with a ring of kerbstones, the largest at the top.
 *
 * Every stone stands on the ground under it. Headstones and fences stop nothing, as a sign post or a café chair
 * doesn't; the Orthodox yard's granite wall and memorial do, and so does each grave mound, as a boulder does.
 */

const BEARING = 50;

/** A frame turned to the plots' bearing, and the ground in it: plan x along the bearing, z to its right. */
function plotGround(ground: Ground) {
  const bearing = (BEARING * Math.PI) / 180;
  const [sin, cos] = [Math.sin(bearing), Math.cos(bearing)];
  return (x: number, z: number) => ground(x * sin - z * cos, x * cos + z * sin);
}

type Stone = "cross" | "slab" | "round" | "pointed";

/** A headstone or cross facing +z (or -z), its foot on the ground. */
function stone(mesh: MeshBuilder, kind: Stone, x: number, y: number, z: number, scale: number, paint: Paint) {
  const s = scale;
  if (kind === "cross") {
    const iron = flat("cross-iron");
    mesh.box([x, y + 0.15, z], [0.5 * s, 0.3 * s, 0.32 * s], paint);
    mesh.box([x, y + 0.3 + 0.55 * s, z], [0.07 * s, 1.1 * s, 0.07 * s], iron);
    mesh.box([x, y + 0.3 + 0.88 * s, z], [0.46 * s, 0.06 * s, 0.06 * s], iron);
    mesh.box([x, y + 0.3 + 1.0 * s, z], [0.22 * s, 0.05 * s, 0.05 * s], iron);
    // The Orthodox cross's slanted foot bar.
    mesh.box([x, y + 0.3 + 0.42 * s, z], [0.3 * s, 0.05 * s, 0.05 * s], iron, 0, iron);
    return;
  }
  if (kind === "slab") {
    mesh.box([x, y + 0.04, z + 0.5 * s], [0.75 * s, 0.12 * s, 1.6 * s], paint, 0, blend(paint, flat("earth-turf"), 0.25));
    mesh.box([x, y + 0.35 * s, z - 0.25 * s], [0.62 * s, 0.75 * s, 0.14 * s], paint);
    return;
  }
  const [wide, tall] = kind === "round" ? [0.48 * s, 0.75 * s] : [0.36 * s, 0.95 * s];
  const half = wide / 2;
  const top = y + tall;
  const shoulder = kind === "round" ? top - half * 0.6 : top - half * 1.4;
  const outline: Vec2[] = kind === "round" ? [[-half, 0], [half, 0], [half, 1], [half * 0.7, 1.6], [0, 2], [-half * 0.7, 1.6], [-half, 1]] : [[-half, 0], [half, 0], [half, 1], [0, 2], [-half, 1]];
  const lift = (v: number) => (v === 0 ? y - 0.15 : v === 1 ? shoulder : v === 1.6 ? shoulder + (top - shoulder) * 0.75 : top);
  const front = outline.map(([u, v]): Vec3 => [x + u, lift(v), z + 0.06 * s]);
  const back = outline.map(([u, v]): Vec3 => [x + u, lift(v), z - 0.06 * s]);
  for (let at = 0; at < outline.length; at++) {
    const next = (at + 1) % outline.length;
    mesh.quad(front[at], front[next], back[next], back[at], blend(paint, flat("plinth-dark"), 0.2));
  }
  for (const face of [front, back]) for (let at = 1; at + 1 < face.length; at++) mesh.tri(face[0], face[at], face[at + 1], paint);
}

/** A low timber fence round a rectangle, posts every couple of metres and two rails, broken for a gate at the front. */
function fence(mesh: MeshBuilder, at: (x: number, z: number) => number, halfX: number, halfZ: number, far: boolean) {
  const post = flat("timber-grey");
  const rail = flat("timber-pale", 0.9);
  const corners: Vec2[] = [[-halfX, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ]];
  corners.forEach((a, side) => {
    const b = corners[(side + 1) % 4];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const posts = Math.max(1, Math.round(length / 2.2));
    for (let step = 0; step < posts; step++) {
      const [s0, s1] = [step / posts, (step + 1) / posts];
      const p = (s: number): Vec2 => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
      const [p0, p1] = [p(s0), p(s1)];
      // The gate: the middle bay of the front, +z.
      if (side === 2 && step === Math.floor(posts / 2)) continue;
      const [y0, y1] = [at(p0[0], p0[1]), at(p1[0], p1[1])];
      if (!far) mesh.box([p0[0], y0 + 0.45, p0[1]], [0.1, 1.1, 0.1], post);
      for (const up of far ? [0.6] : [0.4, 0.8]) mesh.line([p0[0], y0 + up, p0[1]], [p1[0], y1 + up, p1[1]], far ? 0.12 : 0.06, rail);
    }
  });
}

interface Plot {
  id: string;
  name: string;
  east: number;
  north: number;
  half: readonly [number, number];
  enclosure: "wall" | "fence";
  stones: readonly Stone[];
  rows: number;
  seed: number;
}

const PLOTS: readonly Plot[] = [
  { id: "prasto-orthodox", name: "Ortodoxa begravningsplatsen på Prästö", east: 126816, north: 6694827, half: [13, 10], enclosure: "wall", stones: ["cross", "cross", "slab", "cross", "round"], rows: 4, seed: 31 },
  { id: "prasto-muslim", name: "Muslimska begravningsplatsen på Prästö", east: 126820, north: 6694930, half: [7, 5], enclosure: "fence", stones: ["round", "pointed", "round"], rows: 2, seed: 47 },
  { id: "prasto-jewish", name: "Judiska begravningsplatsen på Prästö", east: 126791, north: 6694904, half: [5, 4], enclosure: "fence", stones: ["pointed", "round", "pointed"], rows: 2, seed: 59 },
];

const WALL = { high: 0.62, thick: 0.6 };

function granite(random: () => number): Paint {
  const roll = random();
  return roll < 0.5 ? flat("plinth-granite", 0.9 + random() * 0.15) : roll < 0.8 ? flat("granite-red", 0.95 + random() * 0.1) : flat("granite-dark");
}

/** A plot's low dry granite wall: blocks along each side, each on its own ground. */
function stoneWall(mesh: MeshBuilder, at: (x: number, z: number) => number, halfX: number, halfZ: number, random: () => number, far: boolean) {
  const corners: Vec2[] = [[-halfX, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ]];
  corners.forEach((a, side) => {
    const b = corners[(side + 1) % 4];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const blocks = far ? 2 : Math.round(length / 1.1);
    const turn = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let step = 0; step < blocks; step++) {
      if (side === 2 && Math.abs(step + 0.5 - blocks / 2) < (far ? 0.1 : 1.2)) continue;
      const s = (step + 0.5) / blocks;
      const [x, z] = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
      const y = at(x, z);
      // Neighbouring blocks overlap a little at their ends, so they alternate in height and thickness: two that matched
      // there would share a plane.
      const odd = step % 2;
      const high = WALL.high * (far ? 1 : 0.8 + odd * 0.2 + random() * 0.15);
      const paint = far ? flat("plinth-granite", 0.9) : blend(flat("plinth-granite", 0.86 + random() * 0.14), flat("field-stone"), random() * 0.6);
      mesh.box([x, y + high / 2 - 0.2, z], [length / blocks + (far ? 0 : 0.05), high + 0.4, WALL.thick * (far ? 1 : 0.85 + odd * 0.17 + random() * 0.12)], paint, -turn + (far ? 0 : (random() - 0.5) * 0.08), paint);
    }
  });
}

function plot(spec: Plot, ground: Ground, far: boolean) {
  const mesh = createBuilder(headed(BEARING));
  const at = plotGround(ground);
  const random = seeded(spec.seed);
  const [halfX, halfZ] = spec.half;
  if (spec.enclosure === "wall") stoneWall(mesh, at, halfX, halfZ, random, far);
  else fence(mesh, at, halfX, halfZ, far);
  // The memorial at the back of the plot, facing the gate.
  const [mx, mz] = [0, -halfZ * 0.55];
  const my = at(mx, mz);
  mesh.box([mx, my + 0.15, mz], [1.6, 0.6, 1.2], flat("plinth-granite", 0.9));
  mesh.box([mx, my + 0.45 + 0.75, mz], [0.9, 1.5, 0.5], flat("plinth-granite"), 0, flat("plinth-granite", 1.08));
  if (spec.enclosure === "wall") {
    const iron = flat("cross-iron");
    mesh.box([mx, my + 2.35, mz], [0.09, 0.8, 0.09], iron);
    mesh.box([mx, my + 2.5, mz], [0.5, 0.07, 0.07], iron);
    mesh.box([mx, my + 2.68, mz], [0.26, 0.06, 0.06], iron);
    mesh.box([mx, my + 2.15, mz], [0.32, 0.06, 0.06], iron);
  }
  if (far) return mesh.done();
  // The graves in rows across the plot, a few missing, each its own stone, all facing the gate.
  const columns = Math.max(2, Math.round((halfX * 2 - 2) / 1.8));
  for (let row = 0; row < spec.rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (random() < 0.22) continue;
      const x = -halfX + 1.2 + ((halfX * 2 - 2.4) * (column + 0.5)) / columns + (random() - 0.5) * 0.35;
      const z = -halfZ * 0.15 + ((halfZ * 1.05) * (row + 0.5)) / spec.rows + (random() - 0.5) * 0.3;
      const kind = spec.stones[Math.floor(random() * spec.stones.length)];
      const turn = (random() - 0.5) * 0.12;
      const lean = 0.85 + random() * 0.3;
      mesh.within(
        ([px, py, pz]) => [x + (px - x) * Math.cos(turn) - (pz - z) * Math.sin(turn), py, z + (px - x) * Math.sin(turn) + (pz - z) * Math.cos(turn)],
        () => {
          stone(mesh, kind, x, at(x, z), z, lean, granite(random));
        },
      );
    }
  }
  return mesh.done();
}

/** The Orthodox yard's wall, as outlines east and north of the plot's middle, gapped for its gate. */
function wallOutlines(spec: Plot): Vec2[][] {
  const [halfX, halfZ] = spec.half;
  const bearing = (BEARING * Math.PI) / 180;
  const toEN = ([x, z]: Vec2): Vec2 => [x * Math.sin(bearing) - z * Math.cos(bearing), x * Math.cos(bearing) + z * Math.sin(bearing)];
  const side = (x: number, z: number, along: number, acrossX: boolean) => {
    const [e, n] = toEN([x, z]);
    return rectangle(e, n, along, WALL.thick / 2, BEARING + (acrossX ? 0 : 90));
  };
  const gate = 1.4;
  const memorial = (() => {
    const [e, n] = toEN([0, -halfZ * 0.55]);
    return rectangle(e, n, 0.8, 0.6, BEARING);
  })();
  return [
    side(0, -halfZ, halfX, true),
    side(halfX, 0, halfZ, false),
    side(-halfX, 0, halfZ, false),
    side((-halfX - gate) / 2, halfZ, (halfX - gate) / 2, true),
    side((halfX + gate) / 2, halfZ, (halfX - gate) / 2, true),
    memorial,
  ];
}

export const PRASTO_SITES: GroundSite[] = PLOTS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  east: spec.east,
  north: spec.north,
  replaces: "inside",
  walls: spec.enclosure === "wall" ? wallOutlines(spec) : [],
  build: (ground) => ({ near: plot(spec, ground, false), far: plot(spec, ground, true) }),
}));

/*
 * Johannisberg's grave field: the mounds, east and north of the site's middle on the height, kept clear of the road
 * 30 m to its north, the houses to its west and the barn to its east. Their places are a seeded scatter over the height, fixed here so the car's
 * walls are the same mounds the art draws.
 */
interface Mound {
  east: number;
  north: number;
  radius: number;
  high: number;
  cairn: boolean;
  kerb: boolean;
}

function mounds(): Mound[] {
  const random = seeded(7);
  const placed: Mound[] = [{ east: 4, north: -2, radius: 5.5, high: 1.1, cairn: true, kerb: true }];
  for (let tries = 0; placed.length < 18 && tries < 400; tries++) {
    const east = -14 + random() * 30;
    const north = -34 + random() * 50;
    const radius = 1.6 + random() * 2.8;
    if (north > 14 || (east < -8 && north > -4)) continue;
    if (placed.some((other) => Math.hypot(other.east - east, other.north - north) < other.radius + radius + 1.2)) continue;
    const cairn = random() < 0.55;
    placed.push({ east: Math.round(east * 10) / 10, north: Math.round(north * 10) / 10, radius: Math.round(radius * 10) / 10, high: 0.3 + radius * 0.12 + random() * 0.15, cairn, kerb: radius > 3.2 && random() < 0.6 });
  }
  return placed;
}

const MOUNDS = mounds();

/** A cairn's stones are the field's grey, lichened, not a headstone's dressed red. */
const fieldStone = (random: () => number): Paint => blend(flat("field-stone", 0.85 + random() * 0.25), flat("earth-turf"), random() * 0.3);

function mound(mesh: MeshBuilder, ground: Ground, spec: Mound, random: () => number, far: boolean) {
  const { east, north, radius, high, cairn, kerb } = spec;
  const base = ground(east, north);
  const centre: Vec2 = [east, -north];
  const sides = far ? 6 : 10;
  const paint = cairn ? flat("field-stone", 0.95) : flat("earth-turf");
  const top = cairn ? blend(flat("field-stone"), flat("earth-turf"), 0.35) : flat("earth-turf", 1.08);
  // The rim sinks under the ground's lowest point round it, so a mound on a slope has no gap under its downhill side.
  let low = 0;
  for (let side = 0; side < sides; side++) {
    const angle = (side / sides) * Math.PI * 2;
    low = Math.min(low, ground(east + Math.cos(angle) * radius, north - Math.sin(angle) * radius) - base);
  }
  const rings: Vec2[] = [[radius, base + low - 0.2], [radius * 0.85, base + high * 0.45], [radius * 0.5, base + high * 0.88], [0, base + high]];
  mesh.lathe(centre, rings, sides, [paint, top, top]);
  if (far) return;
  if (cairn) {
    // Stones breaking through the cairn's moss.
    for (let count = 0; count < Math.round(radius * 3); count++) {
      const angle = random() * Math.PI * 2;
      const reach = Math.sqrt(random()) * radius * 0.8;
      const along = reach / radius;
      const y = base + high * (1 - along * along) - 0.08;
      const size = 0.35 + random() * 0.4;
      mesh.box([centre[0] + Math.cos(angle) * reach, y, centre[1] + Math.sin(angle) * reach], [size, size * 0.55, size * 0.8], fieldStone(random), random() * Math.PI);
    }
  }
  if (kerb) {
    const count = Math.round(radius * 2.4);
    for (let at = 0; at < count; at++) {
      const angle = (at / count) * Math.PI * 2 + random() * 0.1;
      const [x, z] = [centre[0] + Math.cos(angle) * (radius + 0.3), centre[1] + Math.sin(angle) * (radius + 0.3)];
      const y = ground(x, -z);
      const size = 0.45 + random() * 0.3;
      mesh.box([x, y + size * 0.25, z], [size, size * 0.8, size * 0.7], fieldStone(random), angle);
    }
  }
}

export const JOHANNISBERG_SITE: GroundSite = {
  id: "johannisberg",
  name: "Johannisbergs gravfält",
  east: 116326,
  north: 6702266,
  replaces: "inside",
  walls: MOUNDS.map(({ east, north, radius }) => {
    const reach = radius * 0.7;
    return Array.from({ length: 8 }, (_, at): Vec2 => [east + Math.cos((at / 8) * Math.PI * 2) * reach, north + Math.sin((at / 8) * Math.PI * 2) * reach]);
  }),
  build(ground) {
    const random = seeded(11);
    const near = createBuilder();
    const far = createBuilder();
    for (const spec of MOUNDS) {
      mound(near, ground, spec, random, false);
      mound(far, ground, spec, random, true);
    }
    return { near: near.done(), far: far.done() };
  },
};
