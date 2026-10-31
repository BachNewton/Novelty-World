import { createBuilder, en, flat, seeded, type MeshBuilder, type Vec2 } from "./kit";
import type { Landmark } from "./landmark";

/*
 * S:t Görans church, Lars Sonck's: a great steep copper roof over low brick walls on a granite base, with a cross gable
 * and, standing on the crossing, a copper lantern and needle spire. The 3D data stops the tower at the lantern, so this
 * replaces the whole solid. The plan is OSM's, the ridge and the spire's place the laser's. The laser's thin spire
 * gives its highest return 20 m up; a photo's proportions, scaled from the tower top in the data, put the tip at 24 m.
 */

const EAVES = 3.4;
const RIDGE = 11.7;
const PLINTH = 1.1;
const NAVE = { west: -6, east: 7.2, south: -14.5, north: 13.5 };
const CROSS = { west: -8.3, east: 9.5, south: -11.3, north: -5.2, eaves: 4.6, ridge: 9.8 };
const PORCH = { west: -2.6, east: 4, south: 13.5, north: 17.5 };
const SPIRE_AT = en(-0.3, -8);
const LANTERN = { foot: 10, top: 14.5, half: 1.75 };
const SPIRE_TOP = 24;
const SPIRE_BELL = 17.5;

function brickWall(mesh: MeshBuilder, a: Vec2, b: Vec2, top: number) {
  const random = seeded(Math.round(a[0] * 31 + a[1] * 17 + b[0] * 7) + 1000);
  mesh.patchWall(a, b, -1, PLINTH, 2.6, 1, () => flat(random() > 0.5 ? "granite" : "granite-red"));
  mesh.patchWall(a, b, PLINTH, top, 3.2, 1.4, () => flat("brick", 0.9 + random() * 0.2));
}

function gableEnd(mesh: MeshBuilder, a: Vec2, b: Vec2, eaves: number, ridge: number) {
  const middle: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  mesh.tri([a[0], eaves, a[1]], [b[0], eaves, b[1]], [middle[0], ridge, middle[1]], flat("brick"));
}

function roundWindow(mesh: MeshBuilder, at: Vec2, y: number, facing: Vec2) {
  const out = (radius: number, angle: number, push: number): readonly [number, number, number] => {
    const across = Math.cos(angle) * radius;
    return [at[0] + facing[0] * push - facing[1] * across, y + Math.sin(angle) * radius, at[1] + facing[1] * push + facing[0] * across];
  };
  for (let side = 0; side < 10; side++) {
    const a = (side * Math.PI) / 5;
    const b = ((side + 1) * Math.PI) / 5;
    mesh.quad(out(0.75, a, 0.06), out(0.75, b, 0.06), out(0.95, b, 0.06), out(0.95, a, 0.06), flat("brick-pale"));
    mesh.tri(out(0, 0, 0.05), out(0.75, a, 0.05), out(0.75, b, 0.05), flat("glass"));
  }
}

function body(mesh: MeshBuilder) {
  const { west, east, south, north } = NAVE;
  const [sw, se, ne, nw] = [en(west, south), en(east, south), en(east, north), en(west, north)];
  brickWall(mesh, sw, se, EAVES);
  brickWall(mesh, se, ne, EAVES);
  brickWall(mesh, ne, nw, EAVES);
  brickWall(mesh, nw, sw, EAVES);
  mesh.gableRoof(nw, sw, se, ne, EAVES, RIDGE, flat("copper-green"), flat("brick"), 0.5);
  roundWindow(mesh, en((west + east) / 2, north), 8, [0, -1]);
  roundWindow(mesh, en((west + east) / 2, south), 8, [0, 1]);

  // The cross gable, whose ends stand out past the eaves.
  const c = CROSS;
  const crossCorners = [en(c.west, c.south), en(c.east, c.south), en(c.east, c.north), en(c.west, c.north)];
  crossCorners.forEach((corner, at) => {
    brickWall(mesh, corner, crossCorners[(at + 1) % 4], c.eaves);
  });
  mesh.gableRoof(crossCorners[3], crossCorners[2], crossCorners[1], crossCorners[0], c.eaves, c.ridge, flat("copper-green", 0.92), flat("brick"), 0.45);
  gableEnd(mesh, crossCorners[0], crossCorners[3], c.eaves, c.ridge);
  gableEnd(mesh, crossCorners[1], crossCorners[2], c.eaves, c.ridge);

  // The low porch on the north, with its own parapet.
  const p = PORCH;
  mesh.extrude([en(p.west, p.south), en(p.east, p.south), en(p.east, p.north), en(p.west, p.north)], -1, 3.6, flat("brick", 0.95), flat("copper-dark"));
  mesh.box([(p.west + p.east) / 2, 1.3, -p.north - 0.05], [1.8, 2.6, 0.1], flat("ship-teak"));

  // Tall slit windows along the low walls, and the chimney on the north gable.
  for (const x of [west - 0.04, east + 0.04]) {
    for (let slit = 0; slit < 8; slit++) mesh.box([x, 2.2, -(-3.5 + slit * 2.3)], [0.05, 1.8, 0.55], flat("glass"));
  }
  mesh.box([0.6, RIDGE + 0.2, -north + 1.2], [1.1, 2.4, 0.9], flat("brick-dark"));
}

function tower(mesh: MeshBuilder, sides: number) {
  const [x, z] = SPIRE_AT;
  const { foot, top, half } = LANTERN;
  const corners = [[x - half, z - half], [x + half, z - half], [x + half, z + half], [x - half, z + half]] as const;
  const skirt = [[x - half - 1.5, z - half - 1.5], [x + half + 1.5, z - half - 1.5], [x + half + 1.5, z + half + 1.5], [x - half - 1.5, z + half + 1.5]] as const;
  const green = flat("copper-green");
  const dark = flat("copper-dark");
  // A pyramid skirt on the roof, the square lantern with its clock faces and louvres, a flared cap, then the needle.
  corners.forEach((corner, at) => {
    const next = (at + 1) % 4;
    mesh.quad([skirt[at][0], foot, skirt[at][1]], [skirt[next][0], foot, skirt[next][1]], [corners[next][0], foot + 1.8, corners[next][1]], [corner[0], foot + 1.8, corner[1]], green);
    mesh.wall(corner, corners[next], foot + 1.8, top, dark);
    const middle = [(corner[0] + corners[next][0]) / 2, (corner[1] + corners[next][1]) / 2];
    const outward = [(middle[0] - x) / half, (middle[1] - z) / half];
    const dial = (angle: number, radius: number) => [middle[0] + outward[0] * 0.04 - outward[1] * Math.cos(angle) * radius, top - 1.1 + Math.sin(angle) * radius, middle[1] + outward[1] * 0.04 + outward[0] * Math.cos(angle) * radius] as const;
    for (let side = 0; side < 8; side++) mesh.tri([middle[0] + outward[0] * 0.04, top - 1.1, middle[1] + outward[1] * 0.04], dial((side * Math.PI) / 4, 0.62), dial(((side + 1) * Math.PI) / 4, 0.62), flat("plaster-trim"));
    mesh.box([middle[0] + outward[0] * 0.03, foot + 2.45, middle[1] + outward[1] * 0.03], [outward[1] === 0 ? 0.06 : 1.5, 1.2, outward[0] === 0 ? 0.06 : 1.5], flat("glass"));
  });
  mesh.lathe([x, z], [[half * 1.55, top], [half * 0.85, top + 1.3], [0.62, SPIRE_BELL - 0.6], [0.72, SPIRE_BELL - 0.2], [0.38, SPIRE_BELL + 0.5], [0, SPIRE_TOP]], sides, [green, green, dark, dark, green], Math.PI / 8);
}

export function buildChurch(): Landmark {
  const near = createBuilder();
  body(near);
  tower(near, 8);

  const far = createBuilder();
  const { west, east, south, north } = NAVE;
  far.extrude([en(west, south), en(east, south), en(east, north), en(west, north)], -1, EAVES, flat("brick"));
  far.gableRoof(en(west, north), en(west, south), en(east, south), en(east, north), EAVES, RIDGE, flat("copper-green"), flat("brick"), 0.4);
  far.lathe(SPIRE_AT, [[3, LANTERN.foot], [1.9, LANTERN.top], [0, SPIRE_TOP]], 4, [flat("copper-dark"), flat("copper-green")], Math.PI / 4);

  return { id: "church", name: "S:t Görans kyrka", east: 107580, north: 6683263, baseM: 9.3, near: near.done(), far: far.done(), farFromM: 500 };
}
