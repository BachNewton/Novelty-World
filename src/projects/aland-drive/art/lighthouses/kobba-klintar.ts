import type { V3 } from "../roadside/mesh";
import { IdentityMesh, identityModel, type IdentityPart } from "../identity/mesh";
import type { LighthouseArt } from "./kit";

/*
 * Kobba Klintar's pilot and fog-signal station: the white Jugend pilot house of 1910, 2½ storeys of boards under a
 * gambrel roof of grey sheet metal with a glazed monitor and chimney on its ridge, and the white pyramid daymark (the
 * 2012 copy of the 1861 one) beside it. The foot is the middle of the house, from OpenStreetMap's footprints: the house
 * 9 m across its gables and 10.6 m long, the pyramid 11 m square and 12 m tall, 46 m away.
 *
 * +z is the house's east gable, the one Mariehamn sees, under its attic's band of windows. The west gable looks down
 * the channel the ships came in by: the foghorn's double doors are there, in the attic, with the balcony outside them
 * where a wooden pilot keeps watch. The pyramid stands where it does from the house, turned as it is.
 */

const [HALF_X, HALF_Z, FOOT, EAVE, KNEE_X, KNEE_Y, RIDGE] = [4.5, 5.3, 0.35, 7.3, 3.5, 9.8, 11.1];
const [EAVE_OUT, GABLE_OUT] = [0.22, 0.28];
const SKIRT = -0.8;
/** The roof's line across the house, eave to eave. */
const PROFILE: readonly (readonly [number, number])[] = [[-HALF_X, EAVE], [-KNEE_X, KNEE_Y], [0, RIDGE], [KNEE_X, KNEE_Y], [HALF_X, EAVE]];
/** The roof's line with its eaves carried out past the walls. */
const ROOF_LINE: readonly (readonly [number, number])[] = [[-HALF_X - EAVE_OUT, EAVE - (EAVE_OUT * (KNEE_Y - EAVE)) / (HALF_X - KNEE_X)], ...PROFILE.slice(1, -1), [HALF_X + EAVE_OUT, EAVE - (EAVE_OUT * (KNEE_Y - EAVE)) / (HALF_X - KNEE_X)]];

const PYRAMID = { x: 39.9, z: -20.9, turn: (-11 * Math.PI) / 180, half: 5.5, base: 0.6, apex: 12, plinth: 5.7, skirt: -1.5 };

const SWAP_M = 380;
const REACH_M = 15000;

const add = (a: V3, b: V3, scale = 1): V3 => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];

/** A flat rectangle on a wall: its middle, the wall's outward way and its rightward way, both level, and how far it stands off. */
function panel(mesh: IdentityMesh, middle: V3, out: V3, right: V3, [x0, x1]: readonly [number, number], [y0, y1]: readonly [number, number], lift: number, part: IdentityPart, shade = 1): IdentityMesh {
  const at = (a: number, b: number): V3 => add(add(add(middle, right, a), [0, 1, 0], b), out, lift);
  return mesh.face([at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)], part, shade);
}

/** The walls' four faces, each with its outward way and rightward way, at a level wall point. */
interface Wall {
  out: V3;
  right: V3;
  at: (along: number, y: number) => V3;
}
const WALLS = {
  east: { out: [0, 0, 1], right: [1, 0, 0], at: (along, y) => [along, y, HALF_Z] },
  west: { out: [0, 0, -1], right: [-1, 0, 0], at: (along, y) => [-along, y, -HALF_Z] },
  north: { out: [1, 0, 0], right: [0, 0, -1], at: (along, y) => [HALF_X, y, -along] },
  south: { out: [-1, 0, 0], right: [0, 0, 1], at: (along, y) => [-HALF_X, y, along] },
} as const satisfies Record<string, Wall>;

/** A two-over-two sash window: a green frame, its glass, its white bars and a sill. 16 triangles. */
function sash(mesh: IdentityMesh, wall: Wall, along: number, y: number, wide: number, tall: number, sill = true): IdentityMesh {
  const middle = wall.at(along, y);
  const [hw, hh, frame] = [wide / 2, tall / 2, 0.09];
  panel(mesh, middle, wall.out, wall.right, [-hw - frame, hw + frame], [-hh - frame, hh + frame], 0.015, "hull-green");
  panel(mesh, middle, wall.out, wall.right, [-hw, hw], [-hh, hh], 0.03, "glass");
  panel(mesh, middle, wall.out, wall.right, [-0.03, 0.03], [-hh, hh], 0.045, "trim");
  panel(mesh, middle, wall.out, wall.right, [-hw, hw], [-0.03, 0.03], 0.045, "trim");
  // Its sill, a white ledge under it.
  if (!sill) return mesh;
  const sillAt = (along: number): V3 => add(add(add(middle, wall.right, along), [0, 1, 0], -hh - 0.12), wall.out, 0.03);
  return mesh.beam(sillAt(-hw - 0.14), sillAt(hw + 0.14), 0.08, 0.06, "trim", 0.85, 1.1);
}

/** The gable's wall, up the roof's line. */
function gableWall(mesh: IdentityMesh, z: number, bottom: number, shade: number): IdentityMesh {
  return mesh.face([[-HALF_X, bottom, z], [HALF_X, bottom, z], ...[...PROFILE].reverse().map(([x, y]): V3 => [x, y, z])], "white-boards", shade);
}

function roof(mesh: IdentityMesh): IdentityMesh {
  const z = HALF_Z + GABLE_OUT;
  for (let edge = 0; edge + 1 < ROOF_LINE.length; edge++) {
    const [[ax, ay], [bx, by]] = [ROOF_LINE[edge], ROOF_LINE[edge + 1]];
    mesh.face([[ax, ay, -z], [bx, by, -z], [bx, by, z], [ax, ay, z]], "steel", ax < 0 ? 0.92 : 1.04);
  }
  return mesh;
}

/** The house's body: plinth, walls, gables and roof, and its monitor and chimney, as both versions draw them. */
function body(mesh: IdentityMesh): IdentityMesh {
  mesh.box([-HALF_X - 0.1, SKIRT, -HALF_Z - 0.1], [HALF_X + 0.1, FOOT, HALF_Z + 0.1], "concrete", { open: true, shade: 0.85 });
  for (const side of [-1, 1]) mesh.face([[side * HALF_X, FOOT, -HALF_Z], [side * HALF_X, FOOT, HALF_Z], [side * HALF_X, EAVE, HALF_Z], [side * HALF_X, EAVE, -HALF_Z]], "white-boards", side > 0 ? 0.96 : 0.9);
  gableWall(mesh, HALF_Z, FOOT, 1);
  gableWall(mesh, -HALF_Z, FOOT, 0.88);
  roof(mesh);
  // The monitor on the ridge, glazed all round, under a low hipped roof; the chimney rises through it.
  const [mx, mz, my0, my1, my2] = [1.25, 1.8, 10.3, 11.75, 12.25];
  mesh.box([-mx, my0, -mz], [mx, my1, mz], "white-boards", { open: true, shadeTop: 1 });
  const [ox, oz, rz] = [mx + 0.18, mz + 0.18, mz - 0.9];
  mesh
    .face([[-ox, my1, oz], [ox, my1, oz], [0, my2, rz]], "steel", 1.04)
    .face([[ox, my1, oz], [ox, my1, -oz], [0, my2, -rz], [0, my2, rz]], "steel", 1)
    .face([[ox, my1, -oz], [-ox, my1, -oz], [0, my2, -rz]], "steel", 0.94)
    .face([[-ox, my1, -oz], [-ox, my1, oz], [0, my2, rz], [0, my2, -rz]], "steel", 0.9);
  mesh.box([-0.3, 11.9, -0.3], [0.3, 13.3, 0.3], "whitewash", { open: true, shadeTop: 1 });
  mesh.box([-0.34, 13.3, -0.34], [0.34, 13.6, 0.34], "brick-red", { open: true, shadeTop: 0.8 });
  return mesh;
}

/** The pyramid's own frame: turned and set where it stands from the house. */
const daymarkAt = ([x, y, z]: V3): V3 => {
  const [cos, sin] = [Math.cos(PYRAMID.turn), Math.sin(PYRAMID.turn)];
  return [PYRAMID.x + x * cos + z * sin, y, PYRAMID.z - x * sin + z * cos];
};
const SIDES_OF_PYRAMID: readonly V3[] = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0]];

/** A point on one of the pyramid's faces: `way` its outward level way, `along` across it, at a height, lifted off it. */
function onPyramid(way: V3, along: number, y: number, lift: number): V3 {
  const { half, base, apex } = PYRAMID;
  const reach = (half * (apex - y)) / (apex - base);
  const normal = [way[0] * (apex - base), half, way[2] * (apex - base)];
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  return daymarkAt([way[0] * reach - way[2] * along + (normal[0] / length) * lift, y + (normal[1] / length) * lift, way[2] * reach + way[0] * along + (normal[2] / length) * lift]);
}

function box(mesh: IdentityMesh, [x0, y0, z0]: V3, [x1, y1, z1]: V3, part: IdentityPart, shade = 1, shadeTop = shade): IdentityMesh {
  const q = (corners: V3[], light: number) => mesh.face(corners.map(daymarkAt), part, light);
  q([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], shade);
  q([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], shade * 0.9);
  q([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], shade * 0.96);
  q([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], shade * 0.92);
  return q([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], shadeTop);
}

function daymark(mesh: IdentityMesh, near: boolean): IdentityMesh {
  const { half, base, apex, plinth, skirt } = PYRAMID;
  box(mesh, [-plinth, skirt, -plinth], [plinth, base, plinth], "rock", 0.95, 1.05);
  const top = daymarkAt([0, apex, 0]);
  const shades = [1.04, 0.98, 0.86, 0.92];
  SIDES_OF_PYRAMID.forEach((way, side) => mesh.face([onPyramid(way, -half, base, 0), onPyramid(way, half, base, 0), top], "whitewash", shades[side]));
  if (!near) return mesh.spike(daymarkAt([0, apex - 0.4, 0]), daymarkAt([0, apex + 1.1, 0]), 0.3, "brick-red");
  // Battens down its edges, and the seams where its panels meet, a third and two thirds up.
  for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) mesh.beam(daymarkAt([a * (half + 0.02), base, b * (half + 0.02)]), daymarkAt([0, apex + 0.02, 0]), 0.16, 0.16, "trim", 0.95, 1.05);
  for (const way of SIDES_OF_PYRAMID) {
    for (const y of [4.4, 8.2]) {
      const reach = (half * (apex - y)) / (apex - base) - 0.08;
      mesh.face([onPyramid(way, -reach, y, 0.015), onPyramid(way, reach, y, 0.015), onPyramid(way, reach, y + 0.06, 0.015), onPyramid(way, -reach, y + 0.06, 0.015)], "concrete", 0.95);
    }
  }
  // The hatch high on its house side, and the entrance below it, a little gabled porch out of its slope.
  const way: V3 = [1, 0, 0];
  mesh.face([onPyramid(way, -0.32, 9.1, 0.015), onPyramid(way, 0.32, 9.1, 0.015), onPyramid(way, 0.32, 9.7, 0.015), onPyramid(way, -0.32, 9.7, 0.015)], "hull-green");
  const [px0, px1, pz, eave, ridge] = [3.6, 6, 0.85, 2.6, 3.35];
  box(mesh, [px0, skirt, -pz], [px1, eave, pz], "white-boards", 0.97);
  const q = (corners: V3[], part: IdentityPart, light: number) => mesh.face(corners.map(daymarkAt), part, light);
  q([[px1, eave, -pz], [px1, eave, pz], [px1, ridge, 0]], "white-boards", 0.97);
  for (const side of [-1, 1]) q([[px0, ridge, 0], [px1 + 0.2, ridge, 0], [px1 + 0.2, eave - 0.12, side * (pz + 0.18)], [px0, eave - 0.12, side * (pz + 0.18)]], "steel", side > 0 ? 1.02 : 0.9);
  q([[px1 + 0.015, base, -0.42], [px1 + 0.015, base, 0.42], [px1 + 0.015, base + 1.95, 0.42], [px1 + 0.015, base + 1.95, -0.42]], "hull-green", 1);
  q([[px1 + 0.03, base, -0.34], [px1 + 0.03, base, 0.34], [px1 + 0.03, base + 1.87, 0.34], [px1 + 0.03, base + 1.87, -0.34]], "door", 1);
  // Its red ball on a rod at the peak.
  mesh.thinTube(daymarkAt([0, apex - 0.1, 0]), daymarkAt([0, apex + 0.55, 0]), 0.05, 4, {}, "steel-dark");
  const ball = daymarkAt([0, apex + 0.85, 0]);
  return mesh
    .tube(add(ball, [0, -0.36, 0]), ball, 0.08, 8, { radiusTo: 0.36, shadeFrom: 0.7 }, "brick-red")
    .tube(ball, add(ball, [0, 0.36, 0]), 0.36, 8, { radiusTo: 0.08, cap: true, shadeTo: 1.15 }, "brick-red");
}

/** The beams along a gable's roof line, just under the roof's edge. */
function verge(mesh: IdentityMesh, z: number): IdentityMesh {
  for (let edge = 0; edge + 1 < ROOF_LINE.length; edge++) {
    const [[ax, ay], [bx, by]] = [ROOF_LINE[edge], ROOF_LINE[edge + 1]];
    const length = Math.hypot(bx - ax, by - ay);
    // Down and in from the roof: the slope's normal turned to point under it.
    let [nx, ny] = [(by - ay) / length, -(bx - ax) / length];
    if (ny > 0) [nx, ny] = [-nx, -ny];
    const drop = 0.11;
    // Each a hair wider than the last, so where two meet their sides aren't in one plane.
    mesh.beam([ax + nx * drop, ay + ny * drop, z], [bx + nx * drop, by + ny * drop, z], 0.09 + (edge % 2) * 0.01, 0.16, "hull-green");
  }
  return mesh;
}

function buildKobbaKlintar() {
  const near = body(new IdentityMesh());
  // The painted skirting, the green pilasters at the corners and between, and the gutters at the eaves.
  for (const wall of Object.values(WALLS)) {
    const long = wall.out[0] === 0 ? HALF_X : HALF_Z;
    panel(near, wall.at(0, 0), wall.out, wall.right, [-long, long], [FOOT, FOOT + 0.28], 0.012, "hull-green", 0.9);
    panel(near, wall.at(0, 0), wall.out, wall.right, [-long, long], [3.62, 3.76], 0.012, "hull-green", 0.95);
  }
  for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) near.beam([a * HALF_X, FOOT, b * HALF_Z], [a * HALF_X, 6.95, b * HALF_Z], 0.22, 0.22, "hull-green");
  for (const z of [-1, 1]) for (const x of [-3.1, 3.1]) near.beam([x, FOOT, z * (HALF_Z + 0.01)], [x, 9.9, z * (HALF_Z + 0.01)], 0.06, 0.16, "hull-green");
  for (const x of [-1, 1]) near.beam([x * (HALF_X + 0.01), FOOT, 0], [x * (HALF_X + 0.01), 7.1, 0], 0.16, 0.06, "hull-green");
  for (const z of [-1, 1]) verge(near, z * (HALF_Z + GABLE_OUT - 0.05));
  for (const x of [-1, 1]) near.beam([x * (HALF_X + 0.14), ROOF_LINE[0][1] - 0.05, -HALF_Z - GABLE_OUT], [x * (HALF_X + 0.14), ROOF_LINE[0][1] - 0.05, HALF_Z + GABLE_OUT], 0.14, 0.14, "hull-green");

  // Two storeys of windows on every side, the east gable's attic lit by a band of two, and the west gable's by the foghorn's doors.
  const [ground, upper, wide] = [2.05, 5.3, 0.95];
  for (const wall of [WALLS.east, WALLS.west]) for (const y of [ground, upper]) for (const along of [-2, 2]) sash(near, wall, along, y, wide, y === ground ? 1.85 : 1.7);
  for (const along of [-0.62, 0.62]) sash(near, WALLS.east, along, 8.5, 1.05, 0.75, false);
  for (const y of [ground, upper]) for (const along of [-3, 3]) sash(near, WALLS.north, along, y, wide, y === ground ? 1.85 : 1.7);
  for (const [along, y] of [[3, ground], [3, upper], [-3, upper], [0.9, upper]] as const) sash(near, WALLS.south, along, y, wide, y === ground ? 1.85 : 1.7);

  // The foghorn's double doors, the balcony outside them on its brackets, and the pilot on watch with his telescope.
  const doors = WALLS.west.at(0, 0);
  panel(near, doors, WALLS.west.out, WALLS.west.right, [-0.95, 0.95], [7.45, 9.6], 0.015, "hull-green");
  for (const leaf of [-1, 1]) panel(near, doors, WALLS.west.out, WALLS.west.right, leaf < 0 ? [-0.82, -0.04] : [0.04, 0.82], [7.45, 9.48], 0.03, "door", 1.1);
  const [bx, by, bz] = [1.5, 7.3, -HALF_Z - 1.3];
  near.box([-bx, by - 0.15, bz], [bx, by, -HALF_Z + 0.05], "white-boards", { shade: 0.9, shadeTop: 1.05 });
  for (const x of [-1.1, 1.1]) near.beam([x, 6.2, -HALF_Z - 0.04], [x, by - 0.2, bz + 0.15], 0.12, 0.12, "hull-green");
  const rail = by + 1;
  const corners: V3[] = [[-bx + 0.05, by, -HALF_Z - 0.05], [-bx + 0.05, by, bz + 0.05], [bx - 0.05, by, bz + 0.05], [bx - 0.05, by, -HALF_Z - 0.05]];
  for (let corner = 0; corner + 1 < corners.length; corner++) {
    const [a, b] = [corners[corner], corners[corner + 1]];
    // A centimetre apart in height round the corners, so two rails meeting there don't share a top.
    near.thinBeam([a[0], rail + corner * 0.012, a[2]], [b[0], rail + corner * 0.012, b[2]], 0.07, 0.07, "trim");
    near.thinBeam([a[0], by + 0.45 + corner * 0.012, a[2]], [b[0], by + 0.45 + corner * 0.012, b[2]], 0.04, 0.04, "trim");
  }
  for (const [x, , z] of corners) near.thinBeam([x, by, z], [x, rail + 0.06, z], 0.085, 0.085, "trim");
  for (const x of [-0.75, 0, 0.75]) near.thinBeam([x, by, bz + 0.05], [x, rail, bz + 0.05], 0.05, 0.05, "trim");
  const pilot: V3 = [0.75, by, bz + 0.55];
  near
    .tube(pilot, add(pilot, [0, 1.35, 0]), 0.24, 6, { radiusTo: 0.2, shadeFrom: 0.85 }, "timber")
    .tube(add(pilot, [0, 1.35, 0]), add(pilot, [0, 1.62, 0]), 0.13, 6, { radiusTo: 0.12, cap: true }, "timber-pale")
    .tube(add(pilot, [0, 1.62, 0]), add(pilot, [0, 1.72, 0]), 0.2, 6, { radiusTo: 0.13, cap: true }, "timber")
    .beam(add(pilot, [0.05, 1.45, -0.1]), add(pilot, [-0.2, 1.52, -0.75]), 0.07, 0.07, "steel-dark");

  // The porch at the south side's west end, under a hipped roof, its door to the south.
  const [px0, px1, pz0, pz1, peave] = [-HALF_X - 1.9, -HALF_X + 0.05, -4.4, -1.4, 2.95];
  near.box([px0 - 0.08, SKIRT, pz0 - 0.08], [px1, 0.3, pz1 + 0.08], "concrete", { open: true, shade: 0.85 });
  near.box([px0, 0.3, pz0], [px1, peave, pz1], "white-boards", { open: true, shade: 0.94 });
  const [rx0, rz0, rz1, peak] = [px0 - 0.22, pz0 - 0.22, pz1 + 0.22, 3.75];
  const top: V3 = [px0 + 0.9, peak, (pz0 + pz1) / 2];
  near
    .face([[rx0, peave - 0.1, rz0], [rx0, peave - 0.1, rz1], top], "steel", 0.95)
    .face([[rx0, peave - 0.1, rz1], [px1, peave - 0.1, rz1], [px1, peak, (pz0 + pz1) / 2], top], "steel", 1.03)
    .face([[px1, peave - 0.1, rz0], [rx0, peave - 0.1, rz0], top, [px1, peak, (pz0 + pz1) / 2]], "steel", 0.88);
  panel(near, [px0, 0, (pz0 + pz1) / 2], [-1, 0, 0], [0, 0, 1], [-0.5, 0.5], [0.3, 2.4], 0.015, "hull-green");
  panel(near, [px0, 0, (pz0 + pz1) / 2], [-1, 0, 0], [0, 0, 1], [-0.42, 0.42], [0.3, 2.32], 0.03, "door", 1.1);
  sash(near, { out: [0, 0, 1], right: [1, 0, 0], at: (along, y) => [px0 + 0.95 + along, y, pz1] }, 0, 1.75, 0.6, 0.9);
  // The monitor's windows, a row round its four sides.
  const [mx, mz] = [1.25, 1.8];
  for (const [middle, out, right, half] of [[[0, 0, mz], [0, 0, 1], [1, 0, 0], mx], [[0, 0, -mz], [0, 0, -1], [-1, 0, 0], mx], [[mx, 0, 0], [1, 0, 0], [0, 0, -1], mz], [[-mx, 0, 0], [-1, 0, 0], [0, 0, 1], mz]] as const) {
    panel(near, middle, out, right, [-half + 0.2, half - 0.2], [10.95, 11.5], 0.015, "glass");
    for (let bar = 1; bar < 4; bar++) panel(near, middle, out, right, [-half + 0.2 + bar * ((2 * half - 0.4) / 4) - 0.025, -half + 0.2 + bar * ((2 * half - 0.4) / 4) + 0.025], [10.95, 11.5], 0.03, "trim");
  }
  daymark(near, true);

  const far = body(new IdentityMesh());
  for (const wall of [WALLS.east, WALLS.west]) for (const y of [ground, upper]) for (const along of [-2, 2]) panel(far, wall.at(along, y), wall.out, wall.right, [-0.55, 0.55], [-0.95, 0.95], 0.03, "glass");
  for (const y of [ground, upper]) for (const along of [-3, 3]) panel(far, WALLS.north.at(along, y), WALLS.north.out, WALLS.north.right, [-0.55, 0.55], [-0.95, 0.95], 0.03, "glass");
  panel(far, WALLS.east.at(0, 8.5), WALLS.east.out, WALLS.east.right, [-1.25, 1.25], [-0.45, 0.45], 0.03, "glass");
  far.box([px0, SKIRT, pz0], [px1, peave + 0.5, pz1], "white-boards", { open: true, shade: 0.94 });
  daymark(far, false);
  return identityModel(near, far, SWAP_M, REACH_M);
}

export const KOBBA_KLINTAR: LighthouseArt = { name: "Kobba Klintar", build: buildKobbaKlintar, lampM: null, lanternM: 0 };
