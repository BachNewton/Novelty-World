import { createBuilder, en, flat, type MeshBuilder, type Vec2 } from "./kit";
import type { Landmark } from "./landmark";

/*
 * Mariehamn's town hall, Lars Sonck's sober block on Stadshusbacken. The laser and the 3D data agree on its roof, so
 * it has no tower to restore: what the data lacks is its two roof masts, its pilasters, its deep flat eaves and the
 * canopy over the door, facing the park. The plan is OSM's.
 */

const EAVES = 13.4;
const RIDGE = 15.5;
/** The footprint's corners, as east and north from the origin. */
const CORNERS = { sw: en(-12.8, -21.5), se: en(14, -20.7), ne: en(12.7, 22.8), nw: en(-14, 22) };
const PILASTER_EVERY_M = 3.9;

function pilasters(mesh: MeshBuilder, a: Vec2, b: Vec2) {
  const trim = flat("plaster-ochre", 1.08);
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const along: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const outward: Vec2 = [-along[1], along[0]];
  const turn = Math.atan2(along[1], along[0]);
  const count = Math.round(length / PILASTER_EVERY_M);
  for (let at = 0; at <= count; at++) {
    const share = (at / count) * length;
    const x = a[0] + along[0] * share + outward[0] * 0.12;
    const z = a[1] + along[1] * share + outward[1] * 0.12;
    mesh.box([x, (3.6 + EAVES) / 2, z], [0.62, EAVES - 3.6, 0.26], trim, turn);
    if (at === count) continue;
    // One tall window and a shorter one over it in each bay, and a small one below: too few storeys for the wall shader's rhythm.
    const bay = ((at + 0.5) / count) * length;
    const windowAt = (y: number, tall: number, wide: number) => {
      mesh.box([a[0] + along[0] * bay + outward[0] * 0.05, y, a[1] + along[1] * bay + outward[1] * 0.05], [wide, tall, 0.1], flat("plaster-trim"), turn);
      mesh.box([a[0] + along[0] * bay + outward[0] * 0.09, y, a[1] + along[1] * bay + outward[1] * 0.09], [wide - 0.24, tall - 0.24, 0.1], flat("glass"), turn);
    };
    windowAt(6.1, 3.2, 1.25);
    windowAt(10.4, 3.9, 1.25);
    windowAt(1.9, 1.5, 1.4);
  }
  // The band over the ground floor.
  const middle: Vec2 = [(a[0] + b[0]) / 2 + outward[0] * 0.15, (a[1] + b[1]) / 2 + outward[1] * 0.15];
  mesh.box([middle[0], 3.7, middle[1]], [length, 0.5, 0.3], flat("plaster-trim"), turn);
}

function block(mesh: MeshBuilder) {
  const { sw, se, ne, nw } = CORNERS;
  const walls = flat("plaster-ochre");
  const outline = [sw, se, ne, nw];
  outline.forEach((corner, at) => {
    const next = outline[(at + 1) % 4];
    mesh.wall(corner, next, -1, EAVES, walls);
    pilasters(mesh, corner, next);
  });
  // A low hipped roof, its ridge down the length, on deep flat white eaves.
  const overhang = 1.1;
  const out = ([x, z]: Vec2): Vec2 => [x + Math.sign(x) * overhang, z + Math.sign(z) * overhang];
  const skirt = outline.map(out);
  skirt.forEach((corner, at) => {
    const next = skirt[(at + 1) % 4];
    mesh.wall(corner, next, EAVES, EAVES + 0.4, flat("plaster-trim"));
  });
  mesh.cap(skirt, EAVES, flat("plaster-trim", 0.8));
  const [ridgeSouth, ridgeNorth] = [en(0.8, -9), en(-0.2, 10)];
  const roof = flat("slate-roof", 1.25);
  const lid = EAVES + 0.4;
  mesh.quad([skirt[0][0], lid, skirt[0][1]], [skirt[3][0], lid, skirt[3][1]], [ridgeNorth[0], RIDGE, ridgeNorth[1]], [ridgeSouth[0], RIDGE, ridgeSouth[1]], roof);
  mesh.quad([skirt[1][0], lid, skirt[1][1]], [skirt[2][0], lid, skirt[2][1]], [ridgeNorth[0], RIDGE, ridgeNorth[1]], [ridgeSouth[0], RIDGE, ridgeSouth[1]], roof);
  mesh.tri([skirt[0][0], lid, skirt[0][1]], [skirt[1][0], lid, skirt[1][1]], [ridgeSouth[0], RIDGE, ridgeSouth[1]], roof);
  mesh.tri([skirt[2][0], lid, skirt[2][1]], [skirt[3][0], lid, skirt[3][1]], [ridgeNorth[0], RIDGE, ridgeNorth[1]], roof);
}

function front(mesh: MeshBuilder) {
  // The canopy over the door on the park front, and the door.
  const [x, z] = en(-0.6, 23.6);
  const turn = Math.atan2(CORNERS.nw[1] - CORNERS.ne[1], CORNERS.nw[0] - CORNERS.ne[0]);
  mesh.box([x, 3.6, z], [21, 0.9, 2.6], flat("plaster-ochre", 0.92), turn, flat("copper-green"));
  mesh.box([x, 3.15, z - 1.34], [21.2, 0.1, 0.12], flat("hull-red"), turn);
  mesh.box([x, 1.4, z - 1.3], [3, 2.8, 0.2], flat("glass"), turn);
  mesh.box([x, 0.1, z + 0.9], [8, 0.8, 5], flat("granite"), turn);
}

function masts(mesh: MeshBuilder) {
  mesh.tube([-0.8, RIDGE - 0.5, -21.2], [-0.8, 20.2, -21.2], 0.08, 0.04, 6, flat("plaster-trim"));
  mesh.tube([-0.9, RIDGE - 0.8, 11], [-0.9, 17.9, 11], 0.08, 0.04, 6, flat("plaster-trim"));
}

export function buildTownHall(): Landmark {
  const near = createBuilder();
  block(near);
  front(near);
  masts(near);

  const far = createBuilder();
  const { sw, se, ne, nw } = CORNERS;
  far.extrude([sw, se, ne, nw], -1, EAVES, flat("plaster-ochre"));
  far.gableRoof(sw, nw, ne, se, EAVES, RIDGE, flat("slate-roof", 1.25), flat("plaster-ochre"), 1);

  return { id: "town-hall", name: "Mariehamns stadshus", east: 108059, north: 6683075, baseM: 15.5, near: near.done(), far: far.done(), farFromM: 500 };
}
