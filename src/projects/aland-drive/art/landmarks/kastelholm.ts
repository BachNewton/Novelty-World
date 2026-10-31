import { blend, createBuilder, en, flat, seeded, type MeshBuilder, type Paint, type Vec2 } from "./kit";
import type { Landmark } from "./landmark";

/*
 * Kastelholm castle: a long line of towers and wings on a low rock by the water, north to south, with a roofless ring
 * round a court at the south end and the great Kurtornet between. Walls are white mortar with patches of red granite,
 * heaviest at the corners. Every block's plan and heights are read from the laser (2013) and the 2025 photo; the rock
 * is the terrain's, so the walls run down past it. y = 0 is 7 m above sea level.
 */

const ROCK_BELOW = -6;

interface Block {
  corners: readonly [Vec2, Vec2, Vec2, Vec2];
  eaves: number;
  ridge: number;
}

/** Ridge from the middle of the first and last corners to the middle of the other two. */
const NORTH_WING: Block = { corners: [en(-16, 41.5), en(6, 45), en(8, 32), en(-14, 28.5)], eaves: 15, ridge: 21 };
const EAST_WING: Block = { corners: [en(-1.5, 15), en(-1, -2.5), en(15.6, -2.3), en(12.2, 14.3)], eaves: 15, ridge: 21 };
const KURTORNET: Block = { corners: [en(-17, -1), en(2.5, 0.5), en(3.5, -13), en(-16, -14)], eaves: 25, ridge: 31.3 };

const random = seeded(1477);

/** Mortar and field stone over most of a wall, turning to red granite at its corners, where the old masons used it. */
function stone(width: number, height: number) {
  const mortar = flat("mortar-white");
  const pale = flat("stone-pale");
  const red = flat("stone-red");
  return (along: number, up: number): Paint => {
    const toCorner = Math.min(along, width - along);
    const redChance = toCorner < 2.2 ? 0.85 : up < 2 || up > height - 2 ? 0.3 : 0.14;
    if (random() < redChance) return blend(red, flat("granite-dark"), random() * 0.3);
    return blend(blend(mortar, pale, random()), flat("granite-dark"), random() * 0.1);
  };
}

function stoneWall(mesh: MeshBuilder, a: Vec2, b: Vec2, bottom: number, top: number) {
  const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
  mesh.mottledWall(a, b, bottom, top, 2.1, 1.9, stone(width, top - bottom));
}

function shuttered(mesh: MeshBuilder, a: Vec2, b: Vec2, rows: readonly number[], every: number) {
  const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const along: Vec2 = [(b[0] - a[0]) / width, (b[1] - a[1]) / width];
  const outward: Vec2 = [-along[1], along[0]];
  const count = Math.floor(width / every);
  const margin = (width - (count - 1) * every) / 2;
  const turn = Math.atan2(along[1], along[0]);
  for (const y of rows) {
    for (let at = 0; at < count; at++) {
      const share = margin + at * every;
      mesh.box([a[0] + along[0] * share + outward[0] * 0.06, y, a[1] + along[1] * share + outward[1] * 0.06], [0.95, 1.7, 0.1], flat("tower-roof"), turn);
    }
  }
}

function pitched(mesh: MeshBuilder, { corners, eaves, ridge }: Block, windowRows: readonly number[]) {
  const [a, b, c, d] = corners;
  stoneWall(mesh, a, b, ROCK_BELOW, eaves);
  stoneWall(mesh, b, c, ROCK_BELOW, eaves);
  stoneWall(mesh, c, d, ROCK_BELOW, eaves);
  stoneWall(mesh, d, a, ROCK_BELOW, eaves);
  const roof = flat("slate-roof");
  mesh.gableRoof(a, b, c, d, eaves, ridge, roof, flat("stone-pale"), 0.35);
  // Gables in the same stone, with a red edge up each rake.
  for (const [p, q] of [[a, d], [b, c]] as const) {
    const peak = [(p[0] + q[0]) / 2, ridge, (p[1] + q[1]) / 2] as const;
    mesh.line([p[0], eaves, p[1]], peak, 0.5, flat("stone-red"));
    mesh.line([q[0], eaves, q[1]], peak, 0.5, flat("stone-red"));
  }
  shuttered(mesh, a, b, windowRows, 3.2);
  shuttered(mesh, c, d, windowRows, 3.2);
}

/** The ring round the south court: outer walls, inner walls and a pitched roof over them, on a bent plan. */
const RING_OUTER = [en(-16, -14), en(3.5, -13), en(8.7, -39), en(-9.5, -48), en(-18.3, -27.6)] as const;
const RING_DEPTH = 6.2;
const RING = { eaves: 16, ridge: 20 };

function inwards(point: Vec2, centre: Vec2, by: number): Vec2 {
  const dx = centre[0] - point[0];
  const dz = centre[1] - point[1];
  const size = Math.hypot(dx, dz);
  return [point[0] + (dx / size) * by, point[1] + (dz / size) * by];
}

function ring(mesh: MeshBuilder) {
  const centre = en(-5, -30);
  const inner = RING_OUTER.map((point) => inwards(point, centre, RING_DEPTH * 1.25));
  const roof = flat("slate-roof", 0.92);
  RING_OUTER.forEach((point, at) => {
    const next = RING_OUTER[(at + 1) % RING_OUTER.length];
    const innerA = inner[at];
    const innerB = inner[(at + 1) % inner.length];
    stoneWall(mesh, point, next, ROCK_BELOW, RING.eaves);
    stoneWall(mesh, innerA, innerB, ROCK_BELOW + 8, RING.eaves);
    shuttered(mesh, point, next, [11], 6);
    const ridgeA: Vec2 = [(point[0] + innerA[0]) / 2, (point[1] + innerA[1]) / 2];
    const ridgeB: Vec2 = [(next[0] + innerB[0]) / 2, (next[1] + innerB[1]) / 2];
    mesh.quad([point[0], RING.eaves, point[1]], [next[0], RING.eaves, next[1]], [ridgeB[0], RING.ridge, ridgeB[1]], [ridgeA[0], RING.ridge, ridgeA[1]], roof);
    mesh.quad([innerA[0], RING.eaves, innerA[1]], [innerB[0], RING.eaves, innerB[1]], [ridgeB[0], RING.ridge, ridgeB[1]], [ridgeA[0], RING.ridge, ridgeA[1]], roof);
  });
  mesh.cap(inner, 5.5, flat("gravel", 0.9));
  // The small roofed house inside the ring's north-west corner.
  pitchedSmall(mesh, [en(-12, -15), en(-6, -15), en(-6, -24), en(-12, -24)], 12, 16);
}

function pitchedSmall(mesh: MeshBuilder, [a, b, c, d]: readonly [Vec2, Vec2, Vec2, Vec2], eaves: number, ridge: number) {
  stoneWall(mesh, a, b, 3, eaves);
  stoneWall(mesh, b, c, 3, eaves);
  stoneWall(mesh, c, d, 3, eaves);
  stoneWall(mesh, d, a, 3, eaves);
  mesh.gableRoof(b, c, d, a, eaves, ridge, flat("slate-roof"), flat("mortar-white"), 0.3);
}

/** Curtain walls and the raised court between the wings. */
function curtains(mesh: MeshBuilder) {
  const stretches: readonly (readonly [Vec2, Vec2, number])[] = [
    [en(-15, 29), en(-17, -1), 12],
    [en(-12, 29), en(-13.5, -1), 12],
    [en(7.5, 33), en(9, 14.5), 13],
    [en(5.5, 33), en(7, 14.5), 13],
  ];
  for (const [a, b, top] of stretches) stoneWall(mesh, a, b, ROCK_BELOW, top);
  mesh.cap([en(-14.5, 29), en(6.5, 32), en(6, 14), en(-1, 14), en(-1, -0.5), en(-14, -1)], 5.5, flat("gravel"));
}

export function buildKastelholm(): Landmark {
  const near = createBuilder();
  pitched(near, NORTH_WING, [11.5, 7]);
  pitched(near, EAST_WING, [11.5, 7]);
  pitched(near, KURTORNET, [20, 14]);
  ring(near);
  curtains(near);

  const far = createBuilder();
  for (const { corners, eaves, ridge } of [NORTH_WING, EAST_WING, KURTORNET]) {
    far.extrude(corners, ROCK_BELOW, eaves, flat("stone-pale"));
    far.gableRoof(corners[0], corners[1], corners[2], corners[3], eaves, ridge, flat("slate-roof"), flat("stone-pale"), 0.2);
  }
  far.extrude(RING_OUTER, ROCK_BELOW, RING.eaves, flat("stone-pale"), flat("slate-roof"));

  return { id: "kastelholm", name: "Kastelholms slott", east: 117245, north: 6697445, baseM: 7, near: near.done(), far: far.done(), farFromM: 700 };
}
