import { blend, createBuilder, flat, headed, seeded, type MeshBuilder, type Paint, type Vec2, type Vec3 } from "./kit";
import type { Landmark } from "./landmark";

/*
 * Bomarsund, the Russian fortress the British and French blew up in 1854, in two pieces. The main fort survives as
 * broken stretches of granite-faced wall on the great arc either side of the road: each stretch here lies where the 2025
 * aerial photo has it, about as tall as its shadow and the elevation model say, with fallen stone at its foot. Notvik
 * tower, on the height to the north, is the brick gun tower that was conserved: two tiers of arches over a horseshoe court.
 */

/** Each stretch of the main fort's wall: its ends, east and north of the origin, and the ground there, above the base. */
const STRETCHES: readonly (readonly [number, number, number, number, number])[] = [
  [-60, 68.8, -46, 70, 1],
  [-84, 42, -81.2, 26, 1.5],
  [-68.8, 7.2, -63.2, -1.2, 0.8],
  [104.8, 88.8, 117.2, 66, 0.9],
  [116.8, 44.8, 116, 22, 1.9],
  [111.2, 0.8, 102, -12.8, 0.2],
  [-128.8, -96, -118.8, -106.8, 0.1],
  [-100, -120, -78, -130, 1.9],
  [-60, -132, -40.8, -131.2, 1.3],
  [-23.2, -126, 16, -104, 1.6],
  [66, -58, 74, -52, 1.3],
];

const FORT_BASE_M = 5;
const WALL_THICK = 2.2;
const COURSE_M = 0.8;

function graniteColour(random: () => number): Paint {
  const roll = random();
  const stone = roll < 0.6 ? flat("granite") : roll < 0.8 ? flat("granite-red") : flat("granite-dark");
  return blend(stone, flat("mortar-white"), random() * 0.18);
}

/** A rock: a squashed, uneven little pyramid. */
function rock(mesh: MeshBuilder, x: number, y: number, z: number, size: number, random: () => number) {
  const sides = 4;
  const start = random() * Math.PI;
  const paint = graniteColour(random);
  const rim = (at: number): Vec3 => {
    const angle = start + (at * Math.PI * 2) / sides;
    const reach = size * (0.7 + random() * 0.5);
    return [x + Math.cos(angle) * reach, y, z + Math.sin(angle) * reach];
  };
  const points = [rim(0), rim(1), rim(2), rim(3)];
  const peak: Vec3 = [x + (random() - 0.5) * size * 0.5, y + size * (0.3 + random() * 0.35), z + (random() - 0.5) * size * 0.5];
  points.forEach((point, at) => {
    mesh.tri(point, points[(at + 1) % sides], peak, paint);
  });
}

/** A broken stretch of wall: columns of coursed stone, its top stepped, highest in the middle, with its faces in two thicknesses. */
function stretch(mesh: MeshBuilder, a: Vec2, b: Vec2, ground: number, random: () => number) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const along: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const across: Vec2 = [-along[1], along[0]];
  const columns = Math.max(3, Math.round(length / 2.1));
  const width = length / columns;
  const peak = 2.4 + random() * 1.4;
  for (let column = 0; column < columns; column++) {
    const share = (column + 0.5) / columns;
    const top = Math.max(0.7, peak * Math.sin(share * Math.PI) ** 0.6 * (0.72 + random() * 0.35));
    const courses = Math.max(1, Math.round(top / COURSE_M));
    const at = (run: number, side: number): Vec2 => [a[0] + along[0] * run + across[0] * side, a[1] + along[1] * run + across[1] * side];
    const start = column * width;
    const end = start + width;
    const half = WALL_THICK / 2;
    for (let course = 0; course < courses; course++) {
      const high = ground + ((course + 1) * top) / courses;
      const bottom = course === 0 ? ground - 1 : ground + (course * top) / courses;
      const paint = graniteColour(random);
      mesh.wall(at(start, half), at(end, half), bottom, high, paint);
      mesh.wall(at(start, -half), at(end, -half), bottom, high, graniteColour(random));
    }
    mesh.cap([at(start, half), at(end, half), at(end, -half), at(start, -half)], ground + top, blend(flat("granite-dark"), flat("granite"), random()));
    if (column === 0 || column === columns - 1) mesh.wall(at(column === 0 ? start : end, half), at(column === 0 ? start : end, -half), ground - 1, ground + top, flat("granite-dark"));
  }
  const fallen = Math.round(length * 0.6);
  for (let count = 0; count < fallen; count++) {
    const run = random() * length;
    const off = (random() > 0.5 ? 1 : -1) * (WALL_THICK * 0.6 + random() * 3);
    rock(mesh, a[0] + along[0] * run + across[0] * off, ground - 0.1, a[1] + along[1] * run + across[1] * off, 0.35 + random() * 0.55, random);
  }
}

function fort(mesh: MeshBuilder) {
  const random = seeded(1854);
  for (const [fromEast, fromNorth, toEast, toNorth, ground] of STRETCHES) stretch(mesh, [fromEast, -fromNorth], [toEast, -toNorth], ground, random);
}

const NOTVIK = { innerRadius: 12.5, outerRadius: 20, tall: 10, wing: 5, parapet: 0.7, courtRadius: 11 };

/** A wall in the frame of the tall block, across +x, with arches through it. `openings` are centres along z. */
function arcade(mesh: MeshBuilder, x: number, z0: number, z1: number, y0: number, y1: number, openings: readonly number[], half: number, spring: number, paint: () => Paint) {
  const at = (z: number, y: number): Vec3 => [x, y, z];
  let run = z0;
  for (const middle of openings) {
    mesh.quad(at(run, y0), at(middle - half, y0), at(middle - half, y1), at(run, y1), paint());
    const steps = 6;
    for (let step = 0; step < steps; step++) {
      const a = Math.PI - (step * Math.PI) / steps;
      const b = Math.PI - ((step + 1) * Math.PI) / steps;
      const arch = (angle: number) => at(middle + Math.cos(angle) * half, spring + Math.sin(angle) * half);
      const frame = (angle: number) => at(middle + Math.cos(angle) * half, y1);
      mesh.quad(arch(a), arch(b), frame(b), frame(a), paint());
    }
    run = middle + half;
  }
  mesh.quad(at(run, y0), at(z1, y0), at(z1, y1), at(run, y1), paint());
}

function archSoffits(mesh: MeshBuilder, x0: number, x1: number, openings: readonly number[], half: number, spring: number, y0: number, paint: Paint) {
  for (const middle of openings) {
    const steps = 6;
    for (let step = 0; step < steps; step++) {
      const a = (step * Math.PI) / steps;
      const b = ((step + 1) * Math.PI) / steps;
      const point = (angle: number, x: number): Vec3 => [x, spring + Math.sin(angle) * half, middle + Math.cos(angle) * half];
      mesh.quad(point(a, x0), point(b, x0), point(b, x1), point(a, x1), paint);
    }
    for (const side of [-half, half]) mesh.quad([x0, y0, middle + side], [x1, y0, middle + side], [x1, spring, middle + side], [x0, spring, middle + side], paint);
  }
}

function notvik(mesh: MeshBuilder) {
  const random = seeded(1832);
  const brickPick = () => (random() > 0.75 ? flat("brick-pale", 0.8 + random() * 0.3) : flat("brick", 0.7 + random() * 0.45));
  const dark = flat("slate-roof", 0.7);
  const { innerRadius, outerRadius, tall, wing, parapet, courtRadius } = NOTVIK;

  mesh.lathe([0, 0], [[0, 0.06], [courtRadius, 0.06]], 20, flat("gravel"));

  // The tall block, in a frame looking out over the court from its middle to the north-west.
  mesh.within(headed(315), () => {
    const openings = [-3, 3];
    const halfOpen = 1.75;
    const nearX = 13;
    const farX = 18;
    for (const x of [nearX, farX]) {
      arcade(mesh, x, -6.4, 6.4, -1, 5.3, openings, halfOpen, 3, brickPick);
      arcade(mesh, x, -6.4, 6.4, 5.3, tall, openings, halfOpen, 7.5, brickPick);
    }
    archSoffits(mesh, nearX, farX, openings, halfOpen, 3, 0, flat("brick-dark"));
    archSoffits(mesh, nearX, farX, openings, halfOpen, 7.5, 5.3, flat("brick-dark"));
    mesh.patchWall([nearX, -6.4], [farX, -6.4], -1, tall, 1.6, 1.4, brickPick);
    mesh.patchWall([nearX, 6.4], [farX, 6.4], -1, tall, 1.6, 1.4, brickPick);
    mesh.box([(nearX + farX) / 2, tall + 0.1, 0], [farX - nearX + 1, 0.22, 14], dark);
    mesh.box([(nearX + farX) / 2, tall + 0.9, 3.2], [farX - nearX - 0.6, 1.7, 6], flat("brick", 0.95), 0, dark);

    // Cannon on the upper tier.
    for (const middle of openings) mesh.tube([nearX + 1.4, 6, middle], [nearX + 4.2, 6.15, middle], 0.26, 0.19, 8, flat("mast-dark"));
  });

  // Low brick wings either side of it, on the arc of the casemates, under their dark protective lids.
  const north = -Math.PI / 2;
  const middle = north - Math.PI / 4;
  const span = 0.36;
  for (const side of [-1, 1]) {
    const from = middle + side * span;
    const to = middle + side * (span + 0.78);
    mesh.arcBlock([0, 0], innerRadius, outerRadius - 1.2, from, to, 6, -1, wing, flat("brick", 0.96), dark);
    mesh.arcBlock([0, 0], innerRadius - 0.5, outerRadius - 0.6, from - side * 0.02, to + side * 0.04, 6, wing, wing + 0.18, dark, dark);
  }

  // Round the rest of the court, a low wall with brick gun posts.
  mesh.arcBlock([0, 0], courtRadius, courtRadius + 0.7, middle + 1.3, middle + 2 * Math.PI - 1.3, 22, -0.6, parapet, flat("granite"), flat("granite-dark"));
  for (let post = 0; post < 7; post++) {
    const angle = middle - 0.62 + post * 0.21;
    mesh.box([(courtRadius + 0.6) * Math.cos(angle), 0.9, (courtRadius + 0.6) * Math.sin(angle)], [1.7, 1.9, 1.7], flat("brick", 0.88 + post * 0.03), angle, dark);
  }
}

export function buildBomarsundFort(): Landmark {
  const near = createBuilder();
  fort(near);
  const far = createBuilder();
  for (const [fromEast, fromNorth, toEast, toNorth, ground] of STRETCHES) {
    far.wall([fromEast, -fromNorth], [toEast, -toNorth], ground, ground + 2.4, flat("granite"));
  }
  return { id: "bomarsund-fort", name: "Bomarsunds fästning", east: 125700, north: 6694270, baseM: FORT_BASE_M, near: near.done(), far: far.done(), farFromM: 500 };
}

export function buildNotvikstornet(): Landmark {
  const near = createBuilder();
  notvik(near);
  const far = createBuilder();
  far.within(headed(315), () => {
    far.box([15.5, NOTVIK.tall / 2, 0], [5, NOTVIK.tall, 12.8], flat("brick"));
  });
  far.arcBlock([0, 0], NOTVIK.innerRadius, NOTVIK.outerRadius - 1, -Math.PI * 1.25 - 1.1, -Math.PI * 1.25 + 1.1, 5, 0, NOTVIK.wing, flat("brick"), flat("slate-roof", 0.7));
  return { id: "notvikstornet", name: "Notvikstornet", east: 125757, north: 6695281, baseM: 28.2, near: near.done(), far: far.done(), farFromM: 400 };
}
