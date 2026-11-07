import { seeded, type V3 } from "../roadside/mesh";
import { identityModel, IdentityMesh, type IdentityPart } from "../identity/mesh";
import { plate } from "../identity/kit";
import type { LighthouseArt } from "./kit";

/*
 * Märket: a lighthouse that is a house. A square keeper's house on a granite plinth, its brick walls banded red and
 * white, a low red hipped roof, and at its west end a short tower with the lantern; west of it the 1955 machine house
 * over the boat shed and the 1889 storehouse with its solar panels and wind generators, east of it the breakwater
 * wall. All on its own low skerry, about 150 by 60 m and a couple of metres out of the sea.
 *
 * The lamp stands over the model's foot, so the house lies east of it (+x), and its door faces +z.
 */

const GROUND = 2.5;
const PLINTH_TOP = 4.5;
const EAVE = 11;
const APEX = 13.1;
const HOUSE = { x: [-2.5, 7.5], z: [-5, 5] } as const;
const OVERHANG = 0.45;
const BANDS: readonly [number, number, IdentityPart][] = [
  [PLINTH_TOP, 4.8, "whitewash"],
  [4.8, 6.4, "brick-red"],
  [6.4, 7.2, "whitewash"],
  [7.2, 8.8, "brick-red"],
  [8.8, 9.6, "whitewash"],
  [9.6, 10.4, "brick-red"],
  [10.4, EAVE, "whitewash"],
];
/** Windows' middles, one floor to a red band. */
const FLOORS = [5.6, 8.0];
const DRUM = [13.9, 15.5] as const;
const GALLERY = 15.75;
const GLASS = [16.1, 17.9] as const;
const DOME_TOP = 18.6;
const LANTERN_M = 0.95;
const LAMP_M = (GLASS[0] + GLASS[1]) / 2;

/** The skerry's rings, outermost under the sea first: half lengths along x and z round its middle, and height. */
const SKERRY_MIDDLE: V3 = [-12, 0, 1];
const RINGS = [
  [80, 32, -1.6],
  [70, 27, 0.4],
  [52, 19, 1.6],
  [33, 10.5, 2.4],
] as const;

/** Four walls round a box's sides, no top or bottom, each wall shaded as the sun finds it. */
function walls(mesh: IdentityMesh, [x0, x1]: readonly [number, number], [z0, z1]: readonly [number, number], y0: number, y1: number, part: IdentityPart): IdentityMesh {
  return mesh
    .face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], part, 1)
    .face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], part, 0.86)
    .face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], part, 0.95)
    .face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], part, 0.9);
}

/** A hipped roof over a footprint, to a ridge along x (or a point on a square). */
function hipRoof(mesh: IdentityMesh, [x0, x1]: readonly [number, number], [z0, z1]: readonly [number, number], eave: number, top: number, part: IdentityPart, overhang: number): IdentityMesh {
  const [mx, mz] = [(x0 + x1) / 2, (z0 + z1) / 2];
  const half = (z1 - z0) / 2;
  const [rx0, rx1] = [Math.min(mx, x0 + half), Math.max(mx, x1 - half)];
  const drop = eave - (overhang * (top - eave)) / half;
  const [a, b, c, d]: V3[] = [[x0 - overhang, drop, z1 + overhang], [x1 + overhang, drop, z1 + overhang], [x1 + overhang, drop, z0 - overhang], [x0 - overhang, drop, z0 - overhang]];
  const [r0, r1]: V3[] = [[rx0, top, mz], [rx1, top, mz]];
  mesh.face(rx1 > rx0 ? [a, b, r1, r0] : [a, b, r0], part, 1.04).face(rx1 > rx0 ? [c, d, r0, r1] : [c, d, r0], part, 0.9);
  return mesh.face([b, c, r1], part, 0.98).face([d, a, r0], part, 0.94);
}

/** A tall window on a wall: a white frame with its arched head, the dark glass, and its glazing bar. */
function window(mesh: IdentityMesh, middle: V3, right: V3, out: V3, wide: number, tall: number): IdentityMesh {
  const at = (along: number, up: number, lift: number): V3 => [middle[0] + right[0] * along + out[0] * lift, middle[1] + up, middle[2] + right[2] * along + out[2] * lift];
  const across: V3 = [right[0] * wide, 0, right[2] * wide];
  plate(mesh, at(-wide / 2 - 0.1, -tall / 2 - 0.1, 0.02), [right[0] * (wide + 0.2), 0, right[2] * (wide + 0.2)], [0, tall + 0.2, 0], "trim");
  mesh.face([at(-wide / 2 - 0.22, tall / 2 + 0.05, 0.02), at(wide / 2 + 0.22, tall / 2 + 0.05, 0.02), at(wide / 2 + 0.1, tall / 2 + 0.38, 0.02), at(0, tall / 2 + 0.45, 0.02), at(-wide / 2 - 0.1, tall / 2 + 0.38, 0.02)], "trim");
  plate(mesh, at(-wide / 2, -tall / 2, 0.04), across, [0, tall, 0], "glass");
  return plate(mesh, at(-0.03, -tall / 2, 0.06), [right[0] * 0.06, 0, right[2] * 0.06], [0, tall, 0], "trim");
}

/** The skerry: rings of rock stepping down to the sea, flat on top where the buildings stand. */
function skerry(mesh: IdentityMesh, rings: readonly (readonly [number, number, number])[], sides: number, roughness: number): IdentityMesh {
  const random = seeded(1885);
  const points = rings.map(([along, across, height], ring) =>
    Array.from({ length: sides }, (_, around): V3 => {
      const angle = (around / sides) * 2 * Math.PI;
      const wobble = ring === rings.length - 1 ? 1 : 1 + (random() - 0.5) * roughness;
      // Squarer than an ellipse, as a skerry ground smooth by ice runs long and blunt.
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      const squared = 1 / Math.pow(Math.abs(cos) ** 3 + Math.abs(sin) ** 3, 1 / 3);
      const rise = ring === 0 || ring === rings.length - 1 ? 0 : (random() - 0.5) * roughness * 2;
      return [SKERRY_MIDDLE[0] + cos * along * squared * wobble, height + rise, SKERRY_MIDDLE[2] + sin * across * squared * wobble];
    }),
  );
  for (let ring = 0; ring + 1 < points.length; ring++) {
    for (let around = 0; around < sides; around++) {
      const next = (around + 1) % sides;
      const [a, b, c, d] = [points[ring][around], points[ring][next], points[ring + 1][next], points[ring + 1][around]];
      const facing = Math.sin(((around + 0.5) / sides) * 2 * Math.PI);
      const shade = 0.78 + ring * 0.07 + facing * 0.06;
      mesh.face([a, b, c], "rock", shade).face([a, c, d], "rock", shade);
    }
  }
  return mesh.face([...points[points.length - 1]].reverse(), "rock", 1.04);
}

const MACHINE = { x: [-14, -5.2], z: [-4.2, 2.6] } as const;

/** The 1955 machine house's walls and gabled roof, the same near and far. */
function machineHouse(mesh: IdentityMesh): IdentityMesh {
  walls(mesh, MACHINE.x, MACHINE.z, GROUND - 1.2, 4.6, "concrete");
  walls(mesh, [MACHINE.x[0] + 0.02, MACHINE.x[1] - 0.02], [MACHINE.z[0] + 0.02, MACHINE.z[1] - 0.02], 4.6, 8.6, "whitewash");
  const [mMid, mRidge] = [(MACHINE.z[0] + MACHINE.z[1]) / 2, 9.9];
  mesh.face([[MACHINE.x[1] - 0.02, 8.6, MACHINE.z[1] - 0.02], [MACHINE.x[1] - 0.02, 8.6, MACHINE.z[0] + 0.02], [MACHINE.x[1] - 0.02, mRidge, mMid]], "whitewash", 0.95);
  mesh.face([[MACHINE.x[0] + 0.02, 8.6, MACHINE.z[0] + 0.02], [MACHINE.x[0] + 0.02, 8.6, MACHINE.z[1] - 0.02], [MACHINE.x[0] + 0.02, mRidge, mMid]], "whitewash", 0.9);
  const mSlope = (mRidge - 8.6) / (mMid - MACHINE.z[0]);
  const mDrop = 8.6 - 0.35 * mSlope;
  mesh.face([[MACHINE.x[0] - 0.35, mDrop, MACHINE.z[1] + 0.35], [MACHINE.x[1] + 0.35, mDrop, MACHINE.z[1] + 0.35], [MACHINE.x[1] + 0.35, mRidge, mMid], [MACHINE.x[0] - 0.35, mRidge, mMid]], "roof-red", 1.04);
  mesh.face([[MACHINE.x[1] + 0.35, mDrop, MACHINE.z[0] - 0.35], [MACHINE.x[0] - 0.35, mDrop, MACHINE.z[0] - 0.35], [MACHINE.x[0] - 0.35, mRidge, mMid], [MACHINE.x[1] + 0.35, mRidge, mMid]], "roof-red", 0.9);
  return mesh;
}

function buildMarket() {
  const near = new IdentityMesh({ afloat: true });
  skerry(near, RINGS, 20, 0.12);
  // Granite boulders along the shore.
  const random = seeded(1976);
  for (let stone = 0; stone < 9; stone++) {
    const angle = (stone / 9) * 2 * Math.PI + random() * 0.4;
    const reach = 0.84 + random() * 0.1;
    near.lump([SKERRY_MIDDLE[0] + Math.cos(angle) * RINGS[1][0] * reach, -0.4, SKERRY_MIDDLE[2] + Math.sin(angle) * RINGS[1][1] * reach], 1.6 + random() * 1.4, 1.4 + random(), 5, stone + 3, { top: "rock", under: "rock" });
  }

  // The house: a granite plinth, banded walls, the hipped roof.
  const [hx, hz] = [HOUSE.x, HOUSE.z];
  walls(near, [hx[0] - 0.25, hx[1] + 0.25], [hz[0] - 0.25, hz[1] + 0.25], GROUND - 1.2, PLINTH_TOP, "rock");
  near.face([[hx[0] - 0.25, PLINTH_TOP, hz[1] + 0.25], [hx[1] + 0.25, PLINTH_TOP, hz[1] + 0.25], [hx[1], PLINTH_TOP, hz[1]], [hx[0], PLINTH_TOP, hz[1]]], "rock", 1.1);
  near.face([[hx[1] + 0.25, PLINTH_TOP, hz[0] - 0.25], [hx[0] - 0.25, PLINTH_TOP, hz[0] - 0.25], [hx[0], PLINTH_TOP, hz[0]], [hx[1], PLINTH_TOP, hz[0]]], "rock", 1.1);
  near.face([[hx[1] + 0.25, PLINTH_TOP, hz[1] + 0.25], [hx[1] + 0.25, PLINTH_TOP, hz[0] - 0.25], [hx[1], PLINTH_TOP, hz[0]], [hx[1], PLINTH_TOP, hz[1]]], "rock", 1.1);
  near.face([[hx[0] - 0.25, PLINTH_TOP, hz[0] - 0.25], [hx[0] - 0.25, PLINTH_TOP, hz[1] + 0.25], [hx[0], PLINTH_TOP, hz[1]], [hx[0], PLINTH_TOP, hz[0]]], "rock", 1.1);
  for (const [from, to, part] of BANDS) walls(near, hx, hz, from, to, part);
  hipRoof(near, hx, hz, EAVE, APEX, "roof-red", OVERHANG);
  // The white fascia under the eaves.
  walls(near, [hx[0] - OVERHANG, hx[1] + OVERHANG], [hz[0] - OVERHANG, hz[1] + OVERHANG], EAVE - 0.38, EAVE - 0.16, "whitewash");
  near.face([[hx[0] - OVERHANG, EAVE - 0.38, hz[0] - OVERHANG], [hx[1] + OVERHANG, EAVE - 0.38, hz[0] - OVERHANG], [hx[1] + OVERHANG, EAVE - 0.38, hz[1] + OVERHANG], [hx[0] - OVERHANG, EAVE - 0.38, hz[1] + OVERHANG]], "roof-under", 0.8);
  // Two windows a floor on every side; on the front the lower west one is the door, up its steps.
  const sides: readonly [V3, V3, V3, number][] = [
    [[0, 0, hz[1]], [1, 0, 0], [0, 0, 1], (hx[0] + hx[1]) / 2],
    [[0, 0, hz[0]], [-1, 0, 0], [0, 0, -1], (hx[0] + hx[1]) / 2],
    [[hx[1], 0, 0], [0, 0, -1], [1, 0, 0], 0],
    [[hx[0], 0, 0], [0, 0, 1], [-1, 0, 0], 0],
  ];
  sides.forEach(([wall, right, out, middle], side) => {
    for (const [floor, y] of FLOORS.entries()) {
      for (const offset of [-2.2, 2.2]) {
        const along = middle + offset * (right[0] + right[2]);
        const at: V3 = [wall[0] + right[0] * offset + (right[0] === 0 ? 0 : middle - wall[0]), y, wall[2] + right[2] * offset + (right[2] === 0 ? 0 : middle - wall[2])];
        if (side === 0 && floor === 0 && offset < 0) {
          plate(near, [along - 0.65, PLINTH_TOP - 0.05, hz[1] + 0.02], [1.3, 0, 0], [0, 2.45, 0], "trim");
          plate(near, [along - 0.5, PLINTH_TOP, hz[1] + 0.04], [1.0, 0, 0], [0, 2.25, 0], "door");
          near.box([along - 0.9, GROUND - 0.4, hz[1] + 0.26], [along + 0.9, PLINTH_TOP - 0.05, hz[1] + 1.6], "concrete", { open: true, shadeTop: 1.08 });
        } else {
          window(near, at, right, out, 0.85, 1.35);
        }
      }
    }
  });

  // The tower out of the roof: a white masonry stage, the rust-red watch room, the gallery, the lantern, the dome.
  near
    .tube([0, EAVE, 0], [0, DRUM[0], 0], 1.35, 8, { radiusTo: 1.3, shadeFrom: 0.92 }, "whitewash")
    .tube([0, DRUM[0] - 0.12, 0], [0, DRUM[0] + 0.05, 0], 1.48, 8, { cap: true, shadeFrom: 0.85 }, "whitewash")
    .tube([0, DRUM[0] + 0.05, 0], [0, DRUM[1], 0], 1.12, 10, { shadeFrom: 0.85, shadeTo: 1.05 }, "brick-red")
    .tube([0, DRUM[1], 0], [0, GALLERY, 0], 1.12, 12, { radiusTo: 1.62, cap: true, shadeFrom: 0.7, shadeTo: 1 }, "whitewash")
    .tube([0, GALLERY, 0], [0, GLASS[0], 0], 0.88, 10, {}, "whitewash")
    .tube([0, GLASS[0], 0], [0, GLASS[1], 0], 0.85, 10, {}, "lantern-glass")
    .tube([0, LAMP_M - 0.25, 0], [0, LAMP_M + 0.25, 0], 0.3, 6, { cap: true }, "lamp")
    .tube([0, GLASS[1], 0], [0, GLASS[1] + 0.12, 0], LANTERN_M, 10, { cap: true }, "whitewash")
    .tube([0, GLASS[1] + 0.12, 0], [0, DOME_TOP, 0], 0.9, 10, { radiusTo: 0.22, cap: true, shadeFrom: 0.95, shadeTo: 1.12 }, "whitewash")
    .tube([0, DOME_TOP, 0], [0, DOME_TOP + 0.38, 0], 0.2, 6, { radiusTo: 0.08, cap: true }, "whitewash");
  // The lantern's glazing bars, and the windows of the stage and the watch room.
  for (let bar = 0; bar < 5; bar++) {
    const angle = (bar / 5) * 2 * Math.PI + 0.3;
    near.thinBeam([Math.cos(angle) * 0.87, GLASS[0], Math.sin(angle) * 0.87], [Math.cos(angle) * 0.87, GLASS[1], Math.sin(angle) * 0.87], 0.06, 0.06, "whitewash");
  }
  plate(near, [-0.25, 12.2, 1.33], [0.5, 0, 0], [0, 0.8, 0], "glass");
  plate(near, [-0.22, 14.4, 1.15], [0.44, 0, 0], [0, 0.6, 0], "glass");
  // The gallery's white rail.
  const posts = 12;
  for (let post = 0; post < posts; post++) {
    const [a, b] = [(post / posts) * 2 * Math.PI, ((post + 1) / posts) * 2 * Math.PI];
    const at = (angle: number, y: number): V3 => [Math.cos(angle) * 1.56, y, Math.sin(angle) * 1.56];
    // A post stops under its rail, and every other rail stands a hair higher, so no two meet in one face.
    const rail = GALLERY + 1 + (post % 2) * 0.015;
    near.thinBeam(at(a, GALLERY), at(a, GALLERY + 0.97), 0.05, 0.05, "whitewash");
    near.thinBeam(at(a, rail), at(b, rail), 0.05, 0.05, "whitewash");
  }
  // The thin mast beside the lantern, with its instruments.
  near.thinTube([1.25, GALLERY, -0.9], [1.25, 21.5, -0.9], 0.05, 3, {}, "steel-dark");
  near.thinBeam([0.85, 21.1, -0.9], [1.19, 21.1, -0.9], 0.05, 0.05, "steel-dark").thinBeam([1.31, 21.1, -0.9], [1.65, 21.1, -0.9], 0.05, 0.05, "steel-dark");

  // The terrace and walkway joining the house to the machine house, over the boat shed.
  near.box([-14.2, GROUND - 1.2, 2.6], [-2.75, PLINTH_TOP - 0.1, 6.2], "concrete", { open: true, shadeTop: 1.06 });
  for (const x of [-12.6, -9.2, -5.8]) plate(near, [x, GROUND, 6.22], [2.2, 0, 0], [0, 1.7, 0], "steel-dark");
  near.thinBeam([-14, PLINTH_TOP + 0.9, 6.1], [-2.8, PLINTH_TOP + 0.9, 6.1], 0.05, 0.05, "steel");
  for (const x of [-14, -10.25, -6.5, -2.8]) near.thinBeam([x, PLINTH_TOP - 0.1, 6.1], [x, PLINTH_TOP + 0.87, 6.1], 0.05, 0.05, "steel");

  // The 1955 machine house: two white storeys on a grey concrete base, a red roof, a brick chimney.
  machineHouse(near);
  near.box([-12.9, 8.8, -1.6], [-11.7, 11.3, -0.4], "brick-red", { shadeTop: 0.6 });
  for (const x of [-12.4, -10.4, -8.4]) {
    plate(near, [x, 6.4, MACHINE.z[1] + 0.01], [0.9, 0, 0], [0, 0.75, 0], "trim");
    plate(near, [x + 0.06, 6.46, MACHINE.z[1] + 0.03], [0.78, 0, 0], [0, 0.63, 0], "glass");
  }
  plate(near, [-7, PLINTH_TOP - 0.1, MACHINE.z[1] + 0.01], [0.95, 0, 0], [0, 2.1, 0], "door");

  // The 1889 storehouse: grey render over its brick foot, solar panels and wind generators, a radome.
  const store = { x: [-26.5, -14.5], z: [-4.5, 4.5] } as const;
  walls(near, store.x, store.z, GROUND - 1.2, 7.2, "concrete");
  plate(near, [store.x[0] + 1.5, GROUND, store.z[1] + 0.02], [8, 0, 0], [0, 1.2, 0], "brick-red");
  const [sMid, sRidge] = [(store.z[0] + store.z[1]) / 2, 8];
  near.face([[store.x[1], 7.2, store.z[1]], [store.x[1], 7.2, store.z[0]], [store.x[1], sRidge, sMid]], "concrete", 0.95);
  near.face([[store.x[0], 7.2, store.z[0]], [store.x[0], 7.2, store.z[1]], [store.x[0], sRidge, sMid]], "concrete", 0.9);
  near.face([[store.x[0] - 0.2, 7.12, store.z[1] + 0.2], [store.x[1] + 0.2, 7.12, store.z[1] + 0.2], [store.x[1] + 0.2, sRidge, sMid], [store.x[0] - 0.2, sRidge, sMid]], "steel-dark", 1.1);
  near.face([[store.x[1] + 0.2, 7.12, store.z[0] - 0.2], [store.x[0] - 0.2, 7.12, store.z[0] - 0.2], [store.x[0] - 0.2, sRidge, sMid], [store.x[1] + 0.2, sRidge, sMid]], "steel-dark", 0.95);
  plate(near, [-25.4, 3.8, store.z[1] + 0.03], [2.3, 0, 0], [0, 3.1, 0], "solar-panel");
  plate(near, [-22.6, 3.8, store.z[1] + 0.03], [2.3, 0, 0], [0, 3.1, 0], "solar-panel");
  for (const x of [-18.6, -16.4]) {
    plate(near, [x, 5.4, store.z[1] + 0.01], [0.8, 0, 0], [0, 0.6, 0], "trim");
    plate(near, [x + 0.06, 5.46, store.z[1] + 0.03], [0.68, 0, 0], [0, 0.48, 0], "glass");
  }
  near.tube([-17, 7.6, -1], [-17, 13.2, -1], 0.32, 6, { cap: true, shadeFrom: 0.8 }, "steel-dark");
  for (const [x, z, tall] of [[-24.5, -1.5, 12.6], [-21.5, 1.5, 13.2], [-15.6, 2.6, 11.4]] as const) {
    near.thinTube([x, 7.6, z], [x, tall, z], 0.06, 3, {}, "steel");
    for (let blade = 0; blade < 3; blade++) {
      const angle = (blade / 3) * 2 * Math.PI + x;
      near.thinBeam([x, tall, z + 0.12 + blade * 0.03], [x + Math.cos(angle) * 0.75, tall + Math.sin(angle) * 0.75, z + 0.12 + blade * 0.03], 0.05, 0.02, "whitewash");
    }
  }
  near
    .tube([-19.6, 7.7, -2], [-19.6, 8.5, -2], 0.45, 8, { radiusTo: 0.85, shadeFrom: 0.8 }, "whitewash")
    .tube([-19.6, 8.5, -2], [-19.6, 9.4, -2], 0.85, 8, { radiusTo: 0.4, cap: true, shadeTo: 1.12 }, "whitewash");

  // The breakwater wall, angling away east, and the fog siren's base by its root.
  const wall: V3[] = [[8.2, 4.3, -3.2], [26, 4.3, -8.5], [44, 4.3, -18]];
  for (let leg = 0; leg + 1 < wall.length; leg++) {
    const [from, to] = [wall[leg], wall[leg + 1]];
    near.beam([from[0], from[1] - 2.9, from[2]], [to[0], to[1] - 2.9, to[2]], 1.4, 5.8, "rock", 0.82, 0.95);
  }
  near.box([12, GROUND - 1, -0.6], [14.4, GROUND + 2.6, 1.8], "concrete", { open: true, shadeTop: 1.06 });

  // Far off: the same rock, the banded house under its red roof, the tower, the grey and white outbuildings.
  const far = new IdentityMesh({ afloat: true });
  skerry(far, [RINGS[0], RINGS[2], RINGS[3]], 8, 0);
  walls(far, [hx[0] - 0.25, hx[1] + 0.25], [hz[0] - 0.25, hz[1] + 0.25], GROUND - 1.2, PLINTH_TOP, "rock");
  for (const [from, to, part] of BANDS) walls(far, hx, hz, from, to, part);
  hipRoof(far, hx, hz, EAVE, APEX, "roof-red", OVERHANG);
  far
    .tube([0, EAVE, 0], [0, DRUM[0], 0], 1.35, 5, {}, "whitewash")
    .tube([0, DRUM[0], 0], [0, GALLERY, 0], 1.12, 5, { radiusTo: 1.5, cap: true }, "brick-red")
    .tube([0, GALLERY, 0], [0, GLASS[1], 0], 0.9, 5, {}, "lantern-glass")
    .tube([0, GLASS[1], 0], [0, DOME_TOP + 0.3, 0], LANTERN_M, 5, { radiusTo: 0.15, cap: true }, "whitewash");
  machineHouse(far);
  far.box([store.x[0], GROUND - 1.2, store.z[0]], [store.x[1], 7.4, store.z[1]], "concrete", { open: true, shadeTop: 0.7 });
  far.beam([wall[0][0], 1.4, wall[0][2]], [wall[2][0], 1.4, wall[2][2]], 1.4, 5.8, "rock", 0.82, 0.95);

  return identityModel(near, far, 600, 25000);
}

export const MARKET: LighthouseArt = { name: "Märket", build: buildMarket, lampM: LAMP_M, lanternM: LANTERN_M };
