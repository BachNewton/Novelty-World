import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import type { Placement } from "../roadside/index";
import { IdentityMesh, identityModel, type IdentityPart } from "../identity/mesh";

/*
 * The wind turbines of Båtskär by Nyhamn, which mark the island from Mariehamn as its mine tower can't: Enercon E-70s,
 * raised by Leovind in 2007, the hub 64 m up and the rotor 71 m across, so 100 m to a blade's tip (OpenStreetMap's
 * `power=generator` nodes there, and Leovind's 14 MW farm of six). An Enercon is told by its shape: a white tapering
 * tube rising out of rings of green that pale upwards, under a rounded egg of a nacelle whose front is the great ring
 * of its generator, carrying a domed spinner and three broad-rooted blades.
 *
 * Two models, each with a near and far version: the tower and nacelle, standing on its foot, its +z to the wind, and the
 * rotor, built round its hub at the origin in the plane z = 0, which the identity material turns on its clock. The game
 * stands the rotor `HUB_OUT_M` along the tower's +z at `HUB_M` above its foot, at the same yaw.
 */

export const HUB_M = 64;
export const HUB_OUT_M = 2.6;
const ROTOR_RADIUS_M = 35.5;

const SWAP_M = 900;
const REACH_M = 30_000;

const SINK = 0.8;
const PLINTH = { radius: 3.2, top: 0.4 };
const TOWER = { foot: 2.15, top: 1.25, topY: HUB_M - 2 };
/** Enercon's rings: the foot's band to the fifth, palest, then the tower's white. */
const BANDS: readonly (readonly [number, IdentityPart])[] = [
  [3, "turbine-green-1"],
  [5.2, "turbine-green-2"],
  [7.4, "turbine-green-3"],
  [9.6, "turbine-green-4"],
  [11.8, "turbine-green-5"],
  [TOWER.topY, "turbine-white"],
];

/** The nacelle as a body turned about the hub's axis, tail to front: each station's z and radius, in the tower's frame. */
const NACELLE: readonly (readonly [number, number])[] = [
  [-7.4, 0],
  [-6.6, 0.85],
  [-5, 1.45],
  [-2.5, 1.95],
  [0, 2.2],
  [1.3, 2.32],
  [2, 2.22],
];
const NACELLE_FAR: readonly (readonly [number, number])[] = [
  [-7.4, 0],
  [-5, 1.45],
  [0, 2.2],
  [2, 2.22],
];
/** The spinner in the rotor's frame, from inside the nacelle's front to its nose. */
const SPINNER: readonly (readonly [number, number])[] = [
  [-0.8, 2.14],
  [0.2, 2.04],
  [1.2, 1.66],
  [2, 1.06],
  [2.5, 0.48],
  [2.75, 0],
];
const SPINNER_FAR: readonly (readonly [number, number])[] = [
  [-0.8, 2.14],
  [1.2, 1.66],
  [2.75, 0],
];

/** Along a blade from the hub: its chord, its thickness and its twist out of the rotor's plane, in degrees. */
const BLADE: readonly (readonly [number, number, number, number])[] = [
  [1.4, 1.9, 1.7, 30],
  [4, 2.9, 1.15, 24],
  [7, 3.3, 0.8, 18],
  [12, 2.75, 0.56, 12],
  [20, 1.95, 0.4, 7],
  [28, 1.28, 0.26, 4],
  [33.8, 0.72, 0.15, 2],
  [ROTOR_RADIUS_M, 0.3, 0.08, 1],
];
const BLADE_FAR: readonly (readonly [number, number, number, number])[] = [
  [1.4, 1.9, 1.7, 30],
  [7, 3.3, 0.8, 18],
  [20, 1.95, 0.4, 7],
  [ROTOR_RADIUS_M, 0.3, 0.08, 1],
];
/** A blade's section across its chord and thickness, leading edge first: a flattened aerofoil. */
const SECTION: readonly (readonly [number, number])[] = [
  [-0.5, 0],
  [-0.22, 0.5],
  [0.2, 0.36],
  [0.5, 0],
  [0.2, -0.28],
  [-0.22, -0.46],
];
const SECTION_FAR: readonly (readonly [number, number])[] = [
  [-0.5, 0],
  [0, 0.45],
  [0.5, 0],
  [0, -0.4],
];

const ring = (sides: number, y: number, radius: number, step: number): V3 => {
  const angle = (step / sides) * 2 * Math.PI;
  return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
};
const towerRadius = (y: number) => TOWER.foot + (Math.max(0, y) / TOWER.topY) * (TOWER.top - TOWER.foot);

/** A ring wall between two heights. */
function wall(mesh: IdentityMesh, sides: number, y0: number, y1: number, radius0: number, radius1: number, part: IdentityPart, shade = 1): IdentityMesh {
  for (let step = 0; step < sides; step++) mesh.face([ring(sides, y0, radius0, step), ring(sides, y0, radius0, step + 1), ring(sides, y1, radius1, step + 1), ring(sides, y1, radius1, step)], part, shade);
  return mesh;
}

/** A body turned about an axis along z at height `y`, through its stations; a station of radius 0 closes it to a point. */
function lathe(mesh: IdentityMesh, sides: number, y: number, stations: readonly (readonly [number, number])[], part: IdentityPart): IdentityMesh {
  const at = (z: number, radius: number, step: number): V3 => {
    const angle = (step / sides) * 2 * Math.PI;
    return [Math.cos(angle) * radius, y + Math.sin(angle) * radius, z];
  };
  for (let station = 1; station < stations.length; station++) {
    const [[z0, r0], [z1, r1]] = [stations[station - 1], stations[station]];
    for (let step = 0; step < sides; step++) {
      // The upper half a little lighter, as a rounded top catches the sky.
      const shade = 0.9 + 0.12 * Math.sin(((step + 0.5) / sides) * 2 * Math.PI);
      if (r0 === 0) mesh.face([at(z0, 0, 0), at(z1, r1, step + 1), at(z1, r1, step)], part, shade);
      else if (r1 === 0) mesh.face([at(z0, r0, step), at(z0, r0, step + 1), at(z1, 0, 0)], part, shade);
      else mesh.face([at(z0, r0, step), at(z0, r0, step + 1), at(z1, r1, step + 1), at(z1, r1, step)], part, shade);
    }
  }
  return mesh;
}

function tower(mesh: IdentityMesh, sides: number): IdentityMesh {
  // The foundation's round lip, then the tube, held to a pixel so it stands on the horizon as a line at any distance.
  mesh.tube([0, -SINK, 0], [0, PLINTH.top, 0], PLINTH.radius, sides, { cap: true, shadeTo: 0.95 }, "concrete");
  return mesh.thinShape([0, PLINTH.top, 0], [0, TOWER.topY, 0], () => {
    let from = PLINTH.top;
    for (const [to, part] of BANDS) {
      wall(mesh, sides, from, to, towerRadius(from), towerRadius(to), part, 0.96);
      from = to;
    }
  }, { held: true });
}

function nearTower(): IdentityMesh {
  const sides = 16;
  const mesh = tower(new IdentityMesh(), sides);
  // The door low on the lee side, up a short steel stair with a landing, and a vent beside it.
  const facet = (step: number, y0: number, y1: number, wide: number, part: IdentityPart) => {
    const angle = ((step + 0.5) / sides) * 2 * Math.PI;
    const out = TOWER.foot * Math.cos(Math.PI / sides) + 0.02;
    const across = [Math.cos(angle), -Math.sin(angle)];
    const point = (along: number, y: number): V3 => [Math.sin(angle) * out + across[0] * along, y, Math.cos(angle) * out + across[1] * along];
    mesh.face([point(-wide / 2, y0), point(wide / 2, y0), point(wide / 2, y1), point(-wide / 2, y1)], part);
  };
  // Facet 7 looks out a little east of the tower's back.
  facet(7, 1.4, 3.5, 1.05, "steel-dark");
  facet(6, 2.6, 2.95, 0.6, "steel-dark");
  const landing = { x: [-0.5, 1.3], z: -TOWER.foot - 1.5 } as const;
  mesh.box([landing.x[0], -SINK, landing.z], [landing.x[1], 1.38, -TOWER.foot + 0.3], "steel", { open: true, shade: 0.8, shadeTop: 1.05 });
  // The posts a little thicker than the rail and sunk into the landing, so none of their faces lie in the rail's or its deck's planes.
  for (const x of landing.x) mesh.thinBeam([x, 1.3, landing.z + 0.05], [x, 2.43, landing.z + 0.05], 0.06, 0.06, "steel");
  mesh.thinBeam([landing.x[0], 2.4, landing.z + 0.05], [landing.x[1], 2.4, landing.z + 0.05], 0.05, 0.05, "steel");

  lathe(mesh, 14, HUB_M, NACELLE, "turbine-white");
  // The wind vane and anemometer mast at the nacelle's back, and its red obstruction light.
  mesh.thinTube([0, HUB_M + 1.3, -4.6], [0, HUB_M + 3.6, -4.6], 0.06, 4, {}, "steel");
  mesh.thinBeam([-0.6, HUB_M + 3.6, -4.6], [0.6, HUB_M + 3.62, -4.6], 0.05, 0.05, "steel");
  mesh.box([-0.25, HUB_M + 1.6, -3.4], [0.25, HUB_M + 2.3, -2.9], "flag-red", { open: true });
  return mesh;
}

function farTower(): IdentityMesh {
  const mesh = tower(new IdentityMesh(), 8);
  return lathe(mesh, 8, HUB_M, NACELLE_FAR, "turbine-white");
}

/** One blade along `way` in the rotor's plane, twisted out of it towards +z, from section to section. */
function blade(mesh: IdentityMesh, way: number, stations: readonly (readonly [number, number, number, number])[], section: readonly (readonly [number, number])[]): IdentityMesh {
  const radial: V3 = [Math.cos(way), Math.sin(way), 0];
  const tangent: V3 = [-Math.sin(way), Math.cos(way), 0];
  const rings = stations.map(([out, chord, thick, twistDeg]) => {
    const twist = (twistDeg * Math.PI) / 180;
    // The chord lies along the way round, turned out of the plane by its twist; the thickness is square to both.
    const along: V3 = [tangent[0] * Math.cos(twist), tangent[1] * Math.cos(twist), Math.sin(twist)];
    const across: V3 = [-tangent[0] * Math.sin(twist), -tangent[1] * Math.sin(twist), Math.cos(twist)];
    const point = (k: 0 | 1 | 2, c: number, t: number) => radial[k] * out + along[k] * c * chord + across[k] * t * thick;
    return section.map(([c, t]): V3 => [point(0, c, t), point(1, c, t), point(2, c, t)]);
  });
  const root: V3 = [radial[0] * stations[0][0], radial[1] * stations[0][0], 0];
  const tipOut = stations[stations.length - 1][0];
  return mesh.thinShape(root, [radial[0] * tipOut, radial[1] * tipOut, 0], () => {
    for (let station = 1; station < rings.length; station++) {
      const [inner, outer] = [rings[station - 1], rings[station]];
      for (let corner = 0; corner < section.length; corner++) {
        const next = (corner + 1) % section.length;
        mesh.face([inner[corner], inner[next], outer[next], outer[corner]], "turbine-white", corner < section.length / 2 ? 1.04 : 0.9);
      }
    }
    mesh.face([...rings[rings.length - 1]].reverse(), "turbine-white");
  }, { held: true });
}

function rotor(spinner: readonly (readonly [number, number])[], sides: number, stations: readonly (readonly [number, number, number, number])[], section: readonly (readonly [number, number])[]): IdentityMesh {
  const mesh = lathe(new IdentityMesh({ spins: true }), sides, 0, spinner, "turbine-white");
  for (let index = 0; index < 3; index++) blade(mesh, Math.PI / 2 + (index * 2 * Math.PI) / 3, stations, section);
  return mesh;
}

export function buildTurbineTower(): RoadsideModel {
  return identityModel(nearTower(), farTower(), SWAP_M, REACH_M);
}

export function buildTurbineRotor(): RoadsideModel {
  return identityModel(rotor(SPINNER, 14, BLADE, SECTION), rotor(SPINNER_FAR, 8, BLADE_FAR, SECTION_FAR), SWAP_M, REACH_M);
}

/** Where a turbine's rotor stands for a tower standing at `tower`: at its hub, turned with it. */
export function rotorAt({ x, y, z, yaw = 0 }: Placement): Placement {
  return { x: x + Math.sin(yaw) * HUB_OUT_M, y: y + HUB_M, z: z + Math.cos(yaw) * HUB_OUT_M, yaw };
}
