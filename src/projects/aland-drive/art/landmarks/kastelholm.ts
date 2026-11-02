import { ShapeUtils, Vector2 } from "three/webgpu";
import IDS from "../facades/facade-ids.json";
import { merged } from "../facades/paint";
import { blend, createBuilder, en, flat, seeded, type LandmarkMesh, type MeshBuilder, type Vec2, type Vec3 } from "./kit";
import type { Landmark } from "./landmark";

/*
 * Kastelholm castle: a long line of towers and wings on a low rock by the water, north to south, with a ring of roofed
 * ranges round a court at the south end and the great Kurtornet between, under tall grey roofs. Walls are lime render,
 * white above and greying at the foot, with the red and grey granite fieldstone showing where the render has gone: along
 * the foot, up the corners and in patches, most on the old ring. The stone is the facade shader's granite, so far off it
 * settles on its own mean, and the far version has the same walls and patches, so the swap between them shows nothing.
 * Every block's plan and heights are read from the laser (2013) and the 2025 photo; the rock is the terrain's, so the
 * walls run down past it. y = 0 is 7 m above sea level.
 */

const ROCK_BELOW = -6;
const STONE_PROUD_M = 0.04;
const GRANITE_TINT = [IDS.paints.indexOf("church-granite-grey"), 0, 0, IDS.styles.granite] as const;

const ROOF = flat("castle-roof");
const LIME = flat("castle-lime");

interface Block {
  corners: readonly [Vec2, Vec2, Vec2, Vec2];
  eaves: number;
  ridge: number;
}

/** Ridge from the middle of the first and last corners to the middle of the other two. */
const NORTH_WING: Block = { corners: [en(-16, 41.5), en(6, 45), en(8, 32), en(-14, 28.5)], eaves: 15, ridge: 21 };
const EAST_WING: Block = { corners: [en(-1.5, 15), en(-1, -2.5), en(15.6, -2.3), en(12.2, 14.3)], eaves: 15, ridge: 21 };
const KURTORNET: Block = { corners: [en(-17, -1), en(2.5, 0.5), en(3.5, -13), en(-16, -14)], eaves: 25, ridge: 31.3 };

/** The ring round the south court: outer walls, inner walls and a pitched roof over them, on a bent plan. */
const RING_OUTER = [en(-16, -14), en(3.5, -13), en(8.7, -39), en(-9.5, -48), en(-18.3, -27.6)] as const;
const RING_CENTRE = en(-5, -30);
const RING_DEPTH = 6.2;
const RING = { eaves: 16, ridge: 20 };

/** One face of a wall: `inside` is any point on its hidden side, `bare` how much of its render has gone. */
interface Face {
  a: Vec2;
  b: Vec2;
  bottom: number;
  top: number;
  inside: Vec2;
  bare: number;
  seed: number;
}

const middle = (points: readonly Vec2[]): Vec2 => [points.reduce((sum, [x]) => sum + x, 0) / points.length, points.reduce((sum, [, z]) => sum + z, 0) / points.length];

function blockFaces({ corners, eaves }: Block, bare: number, seed: number): Face[] {
  const inside = middle(corners);
  return corners.map((a, at) => ({ a, b: corners[(at + 1) % 4], bottom: ROCK_BELOW, top: eaves, inside, bare, seed: seed + at }));
}

function inwards(point: Vec2, centre: Vec2, by: number): Vec2 {
  const dx = centre[0] - point[0];
  const dz = centre[1] - point[1];
  const size = Math.hypot(dx, dz);
  return [point[0] + (dx / size) * by, point[1] + (dz / size) * by];
}

const RING_INNER = RING_OUTER.map((point) => inwards(point, RING_CENTRE, RING_DEPTH * 1.25));

const ringOuterFaces = (): Face[] =>
  RING_OUTER.map((a, at) => ({ a, b: RING_OUTER[(at + 1) % RING_OUTER.length], bottom: ROCK_BELOW, top: RING.eaves, inside: RING_CENTRE, bare: 0.9, seed: 40 + at }));

const ringInnerFaces = (): Face[] =>
  RING_INNER.map((a, at) => ({ a, b: RING_INNER[(at + 1) % RING_INNER.length], bottom: ROCK_BELOW + 8, top: RING.eaves, inside: RING_OUTER[at], bare: 0.7, seed: 50 + at }));

/** Curtain walls between the wings, each a thick wall's two faces; the outer pair faces out, the inner the raised court. */
function curtainFaces(outer: boolean): Face[] {
  const court = en(-3, 14);
  const stretches: readonly (readonly [Vec2, Vec2, number, Vec2, boolean])[] = [
    [en(-15, 29), en(-17, -1), 12, court, true],
    [en(-12, 29), en(-13.5, -1), 12, en(-25, 14), false],
    [en(7.5, 33), en(9, 14.5), 13, court, true],
    [en(5.5, 33), en(7, 14.5), 13, en(15, 24), false],
  ];
  return stretches.flatMap(([a, b, top, inside, facesOut], at) => (facesOut === outer ? [{ a, b, bottom: ROCK_BELOW, top, inside, bare: 0.75, seed: 60 + at }] : []));
}

const SMALL_HOUSE = { corners: [en(-12, -15), en(-6, -15), en(-6, -24), en(-12, -24)] as const, eaves: 12, ridge: 16 };

/** Render, white above and greying towards the rock. */
function limeWall(mesh: MeshBuilder, { a, b, bottom, top }: Face) {
  const foot = flat("castle-lime-foot");
  mesh.mottledWall(a, b, bottom, top, Infinity, 7, (_along, up) => blend(foot, LIME, Math.min(1, Math.max(0, (bottom + up - 1) / 8))));
}

/** Where the render has gone from a face: outlines in (along the face, y). */
function bareStone({ a, b, bottom, top, bare, seed }: Face): Vec2[][] {
  const random = seeded(seed * 31 + 7);
  const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const patches: Vec2[][] = [];
  const footTop = 1.2 + bare * 1.8;
  const clampY = (y: number) => Math.min(top, Math.max(bottom, y));
  const clampAlong = (along: number) => Math.min(width, Math.max(0, along));

  if (bottom < footTop) {
    const steps = Math.max(1, Math.round(width / 3));
    const edge: Vec2[] = [];
    for (let step = steps; step >= 0; step--) edge.push([(width * step) / steps, clampY(footTop + (random() - 0.5) * 1.6)]);
    patches.push([[0, bottom], [width, bottom], ...edge]);
  }

  if (top - footTop > 3) {
    for (const end of [0, width]) {
      const inward = end === 0 ? 1 : -1;
      const reach = 0.8 + random() * 1.8 * (0.5 + bare);
      const from = Math.max(bottom, footTop - 1);
      const high = footTop + (top - footTop) * (0.25 + 0.7 * random() * bare);
      const rows = Math.max(1, Math.round((high - from) / 2));
      const corner: Vec2[] = [[end, from]];
      for (let row = 0; row <= rows; row++) {
        const taper = row === rows ? 0.4 : 1;
        corner.push([clampAlong(end + inward * reach * (0.5 + 0.7 * random()) * taper), from + ((high - from) * row) / rows]);
      }
      corner.push([end, high]);
      patches.push(corner);
    }
  }

  if (width > 5 && top - footTop > 4) {
    const count = Math.round(((width * (top - footTop)) / 90) * bare + random() * 0.6);
    for (let at = 0; at < count; at++) {
      const centre: Vec2 = [2 + random() * (width - 4), footTop + 1 + random() * (top - footTop - 2.5)];
      const radius: Vec2 = [0.9 + random() * 2.2, 0.7 + random() * 1.6];
      const blob: Vec2[] = [];
      for (let point = 0; point < 7; point++) {
        const angle = ((point + random() * 0.6) / 7) * Math.PI * 2;
        const scale = 0.7 + random() * 0.45;
        blob.push([clampAlong(centre[0] + Math.cos(angle) * radius[0] * scale), clampY(centre[1] + Math.sin(angle) * radius[1] * scale)]);
      }
      patches.push(blob);
    }
  }
  return patches;
}

/** The bare fieldstone, kept apart because each patch is a wall to the facade shader, which lays the granite's courses. */
function masonry() {
  const mesh = createBuilder();
  const walls: { along: number; up: number; width: number; height: number; seed: number }[] = [];
  return {
    face(face: Face) {
      const { a, b, top, inside, seed } = face;
      const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const along: Vec2 = [(b[0] - a[0]) / width, (b[1] - a[1]) / width];
      const toInside = (inside[0] - a[0]) * -along[1] + (inside[1] - a[1]) * along[0];
      const out: Vec2 = toInside > 0 ? [along[1] * STONE_PROUD_M, -along[0] * STONE_PROUD_M] : [-along[1] * STONE_PROUD_M, along[0] * STONE_PROUD_M];
      const place = ([u, y]: Vec2): Vec3 => [a[0] + along[0] * u + out[0], y, a[1] + along[1] * u + out[1]];
      for (const outline of bareStone(face)) {
        for (const corners of ShapeUtils.triangulateShape(outline.map(([u, y]) => new Vector2(u, y)), [])) {
          const [p, q, r] = corners.map((at) => outline[at]);
          mesh.tri(place(p), place(q), place(r), LIME);
          for (const [u, y] of [p, q, r]) walls.push({ along: u, up: y - ROCK_BELOW, width, height: top - ROCK_BELOW, seed });
        }
      }
    },
    done(): LandmarkMesh {
      const built = mesh.done();
      walls.forEach(({ along, up, width, height, seed }, at) => {
        built.facades.set([along, up, width, height], at * 4);
        built.tints.set([GRANITE_TINT[0], GRANITE_TINT[1], seed % 251, GRANITE_TINT[3]], at * 4);
      });
      return built;
    },
  };
}

type Masonry = ReturnType<typeof masonry>;

function walled(mesh: MeshBuilder, stones: Masonry, faces: readonly Face[]) {
  for (const face of faces) {
    limeWall(mesh, face);
    stones.face(face);
  }
}

function windows(mesh: MeshBuilder, a: Vec2, b: Vec2, rows: readonly number[], every: number) {
  const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const along: Vec2 = [(b[0] - a[0]) / width, (b[1] - a[1]) / width];
  const outward: Vec2 = [-along[1], along[0]];
  const count = Math.floor(width / every);
  const margin = (width - (count - 1) * every) / 2;
  const turn = Math.atan2(along[1], along[0]);
  for (const y of rows) {
    for (let at = 0; at < count; at++) {
      const share = margin + at * every;
      mesh.box([a[0] + along[0] * share + outward[0] * 0.06, y, a[1] + along[1] * share + outward[1] * 0.06], [0.8, 1.5, 0.1], flat("castle-window"), turn);
    }
  }
}

function roofed(mesh: MeshBuilder, { corners, eaves, ridge }: Block) {
  mesh.gableRoof(corners[0], corners[1], corners[2], corners[3], eaves, ridge, ROOF, LIME, 0.35);
}

function ringRoof(mesh: MeshBuilder) {
  RING_OUTER.forEach((point, at) => {
    const next = RING_OUTER[(at + 1) % RING_OUTER.length];
    const innerA = RING_INNER[at];
    const innerB = RING_INNER[(at + 1) % RING_INNER.length];
    const ridgeA: Vec2 = [(point[0] + innerA[0]) / 2, (point[1] + innerA[1]) / 2];
    const ridgeB: Vec2 = [(next[0] + innerB[0]) / 2, (next[1] + innerB[1]) / 2];
    mesh.quad([point[0], RING.eaves, point[1]], [next[0], RING.eaves, next[1]], [ridgeB[0], RING.ridge, ridgeB[1]], [ridgeA[0], RING.ridge, ridgeA[1]], ROOF);
    mesh.quad([innerA[0], RING.eaves, innerA[1]], [innerB[0], RING.eaves, innerB[1]], [ridgeB[0], RING.ridge, ridgeB[1]], [ridgeA[0], RING.ridge, ridgeA[1]], ROOF);
  });
}

/** What both versions draw: the outer walls with their render and stone, the roofs, and the south court, so the far version's plan covers it. */
function shell(mesh: MeshBuilder, stones: Masonry) {
  walled(mesh, stones, blockFaces(NORTH_WING, 0.45, 0));
  walled(mesh, stones, blockFaces(EAST_WING, 0.45, 10));
  walled(mesh, stones, blockFaces(KURTORNET, 0.6, 20));
  walled(mesh, stones, ringOuterFaces());
  walled(mesh, stones, curtainFaces(true));
  for (const block of [NORTH_WING, EAST_WING, KURTORNET]) roofed(mesh, block);
  ringRoof(mesh);
  mesh.cap(RING_INNER, 5.5, flat("gravel", 0.9));
}

export function buildKastelholm(): Landmark {
  const near = createBuilder();
  const nearStones = masonry();
  shell(near, nearStones);
  for (const { corners } of [NORTH_WING, EAST_WING]) {
    windows(near, corners[0], corners[1], [11.5, 7], 3.2);
    windows(near, corners[2], corners[3], [11.5, 7], 3.2);
  }
  windows(near, KURTORNET.corners[0], KURTORNET.corners[1], [20, 14], 3.2);
  windows(near, KURTORNET.corners[2], KURTORNET.corners[3], [20, 14], 3.2);
  RING_OUTER.forEach((point, at) => {
    windows(near, point, RING_OUTER[(at + 1) % RING_OUTER.length], [11], 6);
  });
  walled(near, nearStones, ringInnerFaces());
  walled(near, nearStones, curtainFaces(false));
  const [a, b, c, d] = SMALL_HOUSE.corners;
  const houseInside = middle(SMALL_HOUSE.corners);
  walled(
    near,
    nearStones,
    SMALL_HOUSE.corners.map((from, at) => ({ a: from, b: SMALL_HOUSE.corners[(at + 1) % 4], bottom: 3, top: SMALL_HOUSE.eaves, inside: houseInside, bare: 0.5, seed: 70 + at })),
  );
  near.gableRoof(b, c, d, a, SMALL_HOUSE.eaves, SMALL_HOUSE.ridge, ROOF, LIME, 0.3);
  near.cap([en(-14.5, 29), en(6.5, 32), en(6, 14), en(-1, 14), en(-1, -0.5), en(-14, -1)], 5.5, flat("gravel"));

  const far = createBuilder();
  const farStones = masonry();
  shell(far, farStones);

  return {
    id: "kastelholm",
    name: "Kastelholms slott",
    east: 117245,
    north: 6697445,
    baseM: 7,
    near: merged(near.done(), nearStones.done()),
    far: merged(far.done(), farStones.done()),
    farFromM: 700,
  };
}
