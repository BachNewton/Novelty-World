import type { V3 } from "../roadside/mesh";
import { IdentityMesh, identityModel, type IdentityPart } from "../identity/mesh";
import type { LighthouseArt } from "./kit";

/*
 * Marhällan (1938): a round concrete tower 12 m tall on a low rock across the channel from Kobba Klintar, banded red
 * and black from a black flared foot, on a pale poured apron. It flares out at the top into a red gallery with an open
 * parapet, and its light stands on the gallery's floor with no lantern round it. A small balcony with a rail hangs
 * off its side under the top black band.
 */

const SIDES = 16;
const FAR_SIDES = 6;
const SWAP_M = 520;
const REACH_M = 15000;

/** The shaft's radius at a height: a bell of a foot, then a gentle taper. */
function radiusAt(y: number): number {
  if (y <= 1.05) return 2.7 + (y / 1.05) * (1.85 - 2.7);
  if (y <= 2.6) return 1.85 + ((y - 1.05) / 1.55) * (1.55 - 1.85);
  return 1.55 + ((y - 2.6) / 7.2) * (1.42 - 1.55);
}

const BANDS: readonly [number, number, IdentityPart][] = [
  [0, 1.05, "band-black"],
  [1.05, 2.6, "flag-red"],
  [2.6, 3.9, "band-black"],
  [3.9, 5.4, "flag-red"],
  [5.4, 6.8, "band-black"],
  [6.8, 8.4, "flag-red"],
  [8.4, 9.8, "band-black"],
];
const [GALLERY_FLOOR, PARAPET_RADIUS, RAIL_FROM, RAIL_TO] = [10.5, 2.05, 11.55, 11.8];
const LAMP_M = 12.1;
const LANTERN_M = 0.5;

/** A point on the face of the shaft centred on face `face` of its sides: across it, at a height, lifted off it. */
function onShaft(face: number, across: number, y: number, lift: number): V3 {
  const angle = ((face + 0.5) / SIDES) * 2 * Math.PI;
  const reach = radiusAt(y) * Math.cos(Math.PI / SIDES) + lift;
  return [Math.sin(angle) * reach + Math.cos(angle) * across, y, -Math.cos(angle) * reach + Math.sin(angle) * across];
}

function shaftPlate(mesh: IdentityMesh, face: number, [a0, a1]: readonly [number, number], [y0, y1]: readonly [number, number], lift: number, part: IdentityPart): IdentityMesh {
  return mesh.face([onShaft(face, a0, y0, lift), onShaft(face, a1, y0, lift), onShaft(face, a1, y1, lift), onShaft(face, a0, y1, lift)], part);
}

function buildMarhallan() {
  const near = new IdentityMesh().tube([0, -0.6, 0], [0, 0.25, 0], 4.4, SIDES, { radiusTo: 2.75, cap: true, shadeFrom: 0.8, shadeTo: 1.05 }, "concrete");
  for (const [from, to, part] of BANDS) near.tube([0, from, 0], [0, to, 0], radiusAt(from), SIDES, { radiusTo: radiusAt(to), shadeFrom: 0.97, shadeTo: 1.03 }, part);
  near
    .tube([0, 9.8, 0], [0, GALLERY_FLOOR, 0], radiusAt(9.8), SIDES, { radiusTo: PARAPET_RADIUS, cap: true, shadeFrom: 0.78, shadeTo: 0.95 }, "flag-red")
    .tube([0, GALLERY_FLOOR, 0], [0, 10.95, 0], PARAPET_RADIUS, SIDES, { shadeFrom: 0.95, shadeTo: 1.02 }, "flag-red")
    .tube([0, RAIL_FROM, 0], [0, RAIL_TO, 0], PARAPET_RADIUS, SIDES, { shadeFrom: 0.95, shadeTo: 1.05 }, "flag-red");
  // The parapet's posts, with the sky between them.
  for (let post = 0; post < SIDES; post++) {
    const angle = (post / SIDES) * 2 * Math.PI;
    const at = (y: number): V3 => [Math.sin(angle) * (PARAPET_RADIUS - 0.08), y, -Math.cos(angle) * (PARAPET_RADIUS - 0.08)];
    near.beam(at(10.9), at(RAIL_FROM + 0.05), 0.16, 0.16, "flag-red");
  }
  // The door in the lowest red band, facing the front, and the hatch out on to the balcony.
  const front = 7;
  shaftPlate(near, front, [-0.36, 0.36], [1.15, 2.45], 0.015, "band-black");
  shaftPlate(near, front, [-0.29, 0.29], [1.2, 2.38], 0.03, "flag-red");
  const side = 11;
  shaftPlate(near, side, [-0.3, 0.3], [8.5, 9.55], 0.015, "flag-red");
  shaftPlate(near, side, [-0.22, 0.22], [8.56, 9.48], 0.03, "steel-dark");
  // The balcony under the hatch, a grating on its brackets with a rail round it.
  const way = onShaft(side, 0, 8.4, 0);
  const out: V3 = [way[0] / Math.hypot(way[0], way[2]), 0, way[2] / Math.hypot(way[0], way[2])];
  const across: V3 = [-out[2], 0, out[0]];
  const point = (reach: number, sideways: number, y: number): V3 => [out[0] * reach + across[0] * sideways, y, out[2] * reach + across[2] * sideways];
  near.face([point(1.2, -0.65, 8.42), point(2.35, -0.65, 8.42), point(2.35, 0.65, 8.42), point(1.2, 0.65, 8.42)], "steel-dark", 1.05);
  near.thinBeam(point(1.4, 0, 7.6), point(2.3, 0, 8.38), 0.08, 0.08, "steel-dark");
  const corners = [point(1.43, -0.62, 8.42), point(2.32, -0.62, 8.42), point(2.32, 0.62, 8.42), point(1.43, 0.62, 8.42)];
  for (const [x, y, z] of corners) near.thinBeam([x, y, z], [x, y + 1.06, z], 0.065, 0.065, "steel-dark");
  for (let corner = 0; corner + 1 < corners.length; corner++) {
    const [a, b] = [corners[corner], corners[corner + 1]];
    // A centimetre apart in height round the corners, so two rails meeting there don't share a top.
    near.thinBeam([a[0], a[1] + 1 + corner * 0.012, a[2]], [b[0], b[1] + 1 + corner * 0.012, b[2]], 0.05, 0.05, "steel-dark");
  }
  // The light on the gallery floor, in no lantern: a red post, the lens round its lamp, a red cap.
  near
    .box([-0.3, GALLERY_FLOOR, -0.3], [0.3, 11.6, 0.3], "flag-red", { open: true, shade: 0.9, shadeTop: 1 })
    .tube([0, 11.6, 0], [0, 11.85, 0], 0.48, 8, { cap: true, shadeFrom: 0.85 }, "flag-red")
    .tube([0, 11.85, 0], [0, 12.35, 0], 0.4, 8, {}, "lantern-glass")
    .tube([0, LAMP_M - 0.18, 0], [0, LAMP_M + 0.18, 0], 0.17, 6, { cap: true }, "lamp")
    .tube([0, 12.35, 0], [0, 12.62, 0], LANTERN_M, 8, { radiusTo: 0.4, cap: true, shadeFrom: 0.9, shadeTo: 1.1 }, "flag-red");

  const far = new IdentityMesh().tube([0, -0.6, 0], [0, 0.25, 0], 4.4, FAR_SIDES, { radiusTo: 2.75, cap: true, shadeFrom: 0.8, shadeTo: 1.05 }, "concrete");
  for (const [from, to, part] of BANDS) far.tube([0, from, 0], [0, to, 0], radiusAt(from), FAR_SIDES, { radiusTo: radiusAt(to) }, part);
  far
    .tube([0, 9.8, 0], [0, GALLERY_FLOOR, 0], radiusAt(9.8), FAR_SIDES, { radiusTo: PARAPET_RADIUS, shadeFrom: 0.78, shadeTo: 0.95 }, "flag-red")
    .tube([0, GALLERY_FLOOR, 0], [0, RAIL_TO, 0], PARAPET_RADIUS, FAR_SIDES, { cap: true, shadeFrom: 0.95, shadeTo: 1.05 }, "flag-red")
    .tube([0, RAIL_TO, 0], [0, 12.62, 0], 0.42, 4, { radiusTo: 0.38, cap: true }, "flag-red");
  return identityModel(near, far, SWAP_M, REACH_M);
}

export const MARHALLAN: LighthouseArt = { name: "Marhällan", build: buildMarhallan, lampM: LAMP_M, lanternM: LANTERN_M };
