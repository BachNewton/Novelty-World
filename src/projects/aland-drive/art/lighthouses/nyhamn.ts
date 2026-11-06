import type { V3 } from "../roadside/mesh";
import { IdentityMesh, identityModel, type IdentityPart } from "../identity/mesh";
import type { LighthouseArt } from "./kit";

/*
 * Nyhamn, on Lilla Båtskär: no lighthouse built as one, but the concrete headframe of the iron mine sunk here in 1958,
 * which carried the light at its top until 2007. A plain round shaft of weathered grey concrete, about 34 m, under a
 * wider round drum with tall narrow windows all round, its flat roof railed and crowded with masts. A tall square
 * hoist house stands against one side of the shaft to almost half its height, and a low one against the other.
 * Proportions and plan from File:Lilla_Båtskär.jpg on Commons (round, not square: the light runs round the shaft and
 * the drum as on a cylinder); the turbines and the pilot house stand apart on the island and aren't part of it.
 * +z faces Järsö's road, where the low house's door is.
 */

const SWAP_M = 1800;
const REACH_M = 15000;

const SINK = 0.8;
const SHAFT = { radius: 4, top: 27 };
const DRUM = { radius: 6.5, from: 26.5, deck: 33.6, top: 34, parapet: 6.25 };
/** The tall hoist house against the shaft's -x side, and the low one against its +x side. */
const HOIST = { x: [-8.3, -1], z: [-3.6, 3.6], top: 14 } as const;
const LOW = { x: [2.4, 7.4], z: [-2.6, 2.6], top: 4.6 } as const;

const SIDES = 16;
const FAR_SIDES = 10;

/** A point `reach` from the axis at angle step `step` of a ring of `sides`; step 0 looks to +z. */
const around = (step: number, sides: number, y: number, reach: number): V3 => {
  const angle = (step / sides) * 2 * Math.PI;
  return [Math.sin(angle) * reach, y, Math.cos(angle) * reach];
};
/** The middle of facet `step` of a ring of `sides` whose corners are `reach` out, and its across and out directions. */
const facet = (step: number, sides: number, reach: number) => {
  const angle = ((step + 0.5) / sides) * 2 * Math.PI;
  const apothem = reach * Math.cos(Math.PI / sides);
  return { out: [Math.sin(angle), Math.cos(angle)] as const, apothem, across: [Math.cos(angle), -Math.sin(angle)] as const };
};

/** A wall of `sides` facets between two heights, its reach changing from `reach` to `reachTo`. */
function ringWall(mesh: IdentityMesh, sides: number, y0: number, y1: number, reach: number, part: IdentityPart, reachTo = reach, shade = 1): IdentityMesh {
  for (let step = 0; step < sides; step++) {
    mesh.face([around(step, sides, y0, reach), around(step + 1, sides, y0, reach), around(step + 1, sides, y1, reachTo), around(step, sides, y1, reachTo)], part, shade);
  }
  return mesh;
}

/** A flat ring between two reaches at a height, or a disc when `inner` is 0. */
function ringFlat(mesh: IdentityMesh, sides: number, y: number, inner: number, outer: number, part: IdentityPart, shade = 1): IdentityMesh {
  if (inner === 0) return mesh.face(Array.from({ length: sides }, (_, step) => around(step, sides, y, outer)), part, shade);
  for (let step = 0; step < sides; step++) {
    mesh.face([around(step, sides, y, inner), around(step + 1, sides, y, inner), around(step + 1, sides, y, outer), around(step, sides, y, outer)], part, shade);
  }
  return mesh;
}

/** A rectangle lying on facet `step` of a ring, `lift` clear of it: `wide` across, from `y0` to `y1`. */
function onFacet(mesh: IdentityMesh, step: number, sides: number, reach: number, wide: number, y0: number, y1: number, lift: number, part: IdentityPart, shade = 1): IdentityMesh {
  const { out, apothem, across } = facet(step, sides, reach);
  const at = (along: number, y: number): V3 => [out[0] * (apothem + lift) + across[0] * along, y, out[1] * (apothem + lift) + across[1] * along];
  return mesh.face([at(-wide / 2, y0), at(wide / 2, y0), at(wide / 2, y1), at(-wide / 2, y1)], part, shade);
}

/** A flat-roofed concrete house with a low parapet round its roof. */
function house(mesh: IdentityMesh, { x, z, top }: { x: readonly [number, number]; z: readonly [number, number]; top: number }, parapet: boolean): IdentityMesh {
  mesh.box([x[0], -SINK, z[0]], [x[1], top, z[1]], "concrete", { open: true, shade: 0.94, shadeTop: 0.8 });
  if (!parapet) return mesh;
  // A low upstand round the roof's three open edges, its top a hand higher than the roof, a little proud of the walls.
  const [lip, high] = [0.25, top + 0.45];
  mesh.box([x[0] - 0.03, top - 0.3, z[0] - 0.03], [x[0] + lip, high, z[1] + 0.03], "concrete", { open: true, shadeTop: 1.05 });
  mesh.box([x[0] + lip - 0.02, top - 0.3, z[0] - 0.015], [x[1], high - 0.02, z[0] + lip], "concrete", { open: true, shadeTop: 1.05 });
  mesh.box([x[0] + lip - 0.02, top - 0.3, z[1] - lip], [x[1], high - 0.02, z[1] + 0.015], "concrete", { open: true, shadeTop: 1.05 });
  return mesh;
}

/** A window on a wall facing ±x or ±z of a box: `at` across the wall, from `y0` to `y1`, `wall` its plane. */
function boxWindow(mesh: IdentityMesh, facing: "x" | "z", wall: number, sign: 1 | -1, at: number, wide: number, y0: number, y1: number, part: IdentityPart = "glass"): IdentityMesh {
  const out = wall + sign * 0.02;
  const corners: V3[] = facing === "z"
    ? [[at - wide / 2, y0, out], [at + wide / 2, y0, out], [at + wide / 2, y1, out], [at - wide / 2, y1, out]]
    : [[out, y0, at - wide / 2], [out, y0, at + wide / 2], [out, y1, at + wide / 2], [out, y1, at - wide / 2]];
  return mesh.face(corners, part);
}

function tower(mesh: IdentityMesh): IdentityMesh {
  // The shaft, and the drum on it: its underside, its wall, and its roof deck sunk inside a parapet.
  ringWall(mesh, SIDES, -SINK, SHAFT.top, SHAFT.radius, "concrete", SHAFT.radius, 0.92);
  ringFlat(mesh, SIDES, DRUM.from, SHAFT.radius, DRUM.radius, "concrete", 0.7);
  ringWall(mesh, SIDES, DRUM.from, DRUM.top, DRUM.radius, "concrete");
  ringFlat(mesh, SIDES, DRUM.top, DRUM.parapet, DRUM.radius, "rock", 1.05);
  ringWall(mesh, SIDES, DRUM.deck, DRUM.top, DRUM.parapet, "concrete", DRUM.parapet, 0.85);
  ringFlat(mesh, SIDES, DRUM.deck, 0, DRUM.parapet, "concrete", 0.8);

  // Tall narrow windows on every other facet of the drum, and a few small ones up the shaft where its stair climbs.
  for (let step = 0; step < SIDES; step += 2) onFacet(mesh, step, SIDES, DRUM.radius, 0.75, 29.4, 31.7, 0.02, "glass");
  for (const [step, y] of [[1, 24.2], [3, 19.5], [5, 24.2], [9, 21.5], [12, 24.2]] as const) onFacet(mesh, step, SIDES, SHAFT.radius, 0.55, y, y + 0.95, 0.02, "glass");
  // Rain run off the drum's underside has darkened the shaft in streaks below it.
  for (const [step, length] of [[0, 7], [2, 4.5], [4, 9], [7, 5], [10, 8], [13, 6]] as const) onFacet(mesh, step, SIDES, SHAFT.radius, 0.7, DRUM.from - length, DRUM.from, 0.01, "timber-grey", 1.05);

  // The roof's rail, posts at every other corner of the parapet, and its masts: a braced frame, a tall whip, short poles.
  const deck = DRUM.top;
  const rail = DRUM.parapet - 0.15;
  for (let step = 0; step < SIDES; step += 2) {
    const [from, to] = [around(step, SIDES, deck, rail), around(step + 2, SIDES, deck, rail)];
    mesh.thinBeam(from, [from[0], deck + 1.1, from[2]], 0.06, 0.06, "steel");
    // Every other bar sits 2 cm lower, so where two meet at a post their faces don't share a plane.
    const bar = deck + 1.1 - (step % 4 === 2 ? 0.02 : 0);
    mesh.thinBeam([from[0], bar, from[2]], [to[0], bar, to[2]], 0.05, 0.05, "steel");
  }
  const frame: V3 = [-1.2, deck + 4.6, -0.8];
  for (const [x, z] of [[-3, -2.4], [0.6, -2.6], [-1.4, 1.2]] as const) mesh.thinTube([x, DRUM.deck, z], frame, 0.07, 4, {}, "steel");
  mesh.thinBeam([frame[0] - 1.8, frame[1] - 0.6, frame[2]], [frame[0] + 1.8, frame[1] - 0.6, frame[2]], 0.07, 0.07, "steel");
  mesh.thinTube([0.2, DRUM.deck, -0.6], [0.2, deck + 10.5, -0.6], 0.06, 4, { radiusTo: 0.03 }, "steel");
  for (const [x, z, tall] of [[3.4, -1.8, 4.2], [4.4, 1.6, 2.6], [-4.2, 2.2, 3]] as const) mesh.thinTube([x, DRUM.deck, z], [x, deck + tall, z], 0.05, 4, {}, "steel");
  // The equipment hut on the roof by the rail, and the old light's stand by the mast.
  mesh.box([3.2, DRUM.deck - 0.1, -4.4], [4.7, deck + 1.1, -2.9], "steel-dark", { open: true, shadeTop: 1.1 });
  mesh.tube([0.9, DRUM.deck - 0.1, 0.9], [0.9, deck + 1.5, 0.9], 0.45, 6, { cap: true }, "steel");
  return mesh;
}

function houses(mesh: IdentityMesh): IdentityMesh {
  house(mesh, HOIST, true);
  // The hoist house's high windows, two on its outer end and one to each side, and a door to +z.
  for (const at of [-1.8, 1.8]) boxWindow(mesh, "x", HOIST.x[0], -1, at, 1, 10.2, 11.8);
  for (const sign of [1, -1] as const) boxWindow(mesh, "z", sign === 1 ? HOIST.z[1] : HOIST.z[0], sign, -6.2, 1, 10.2, 11.8);
  boxWindow(mesh, "z", HOIST.z[1], 1, -6.2, 1, 5.2, 6.4);
  boxWindow(mesh, "z", HOIST.z[1], 1, -3.6, 1.6, -SINK, 2.4, "door");
  house(mesh, LOW, false);
  boxWindow(mesh, "z", LOW.z[1], 1, 5.8, 1.1, -SINK, 2.1, "door");
  boxWindow(mesh, "x", LOW.x[1], 1, 0, 1.2, 2, 3.1);
  // Steps up to the low house's door, the island's rock sloping away under it.
  mesh.box([5, -SINK, LOW.z[1] - 0.1], [6.6, 0.25, LOW.z[1] + 1], "concrete", { open: true, shadeTop: 1.08 });
  return mesh;
}

function nearModel(): IdentityMesh {
  return houses(tower(new IdentityMesh()));
}

function farModel(): IdentityMesh {
  const mesh = new IdentityMesh();
  ringWall(mesh, FAR_SIDES, -SINK, DRUM.from + 0.1, SHAFT.radius, "concrete", SHAFT.radius, 0.92);
  ringFlat(mesh, FAR_SIDES, DRUM.from, SHAFT.radius, DRUM.radius, "concrete", 0.7);
  ringWall(mesh, FAR_SIDES, DRUM.from, DRUM.top, DRUM.radius, "concrete");
  ringFlat(mesh, FAR_SIDES, DRUM.top, 0, DRUM.radius, "concrete", 0.85);
  mesh.box([HOIST.x[0], -SINK, HOIST.z[0]], [HOIST.x[1], HOIST.top + 0.45, HOIST.z[1]], "concrete", { open: true, shade: 0.94, shadeTop: 0.85 });
  mesh.box([LOW.x[0], -SINK, LOW.z[0]], [LOW.x[1], LOW.top, LOW.z[1]], "concrete", { open: true, shade: 0.94, shadeTop: 0.8 });
  mesh.spike([0.2, DRUM.top, -0.6], [0.2, DRUM.top + 10.5, -0.6], 0.15, "steel");
  return mesh;
}

function build() {
  return identityModel(nearModel(), farModel(), SWAP_M, REACH_M);
}

export const NYHAMN: LighthouseArt = { name: "Nyhamn", build, lampM: null, lanternM: 0 };
