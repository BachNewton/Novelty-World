import type { V3 } from "../roadside/mesh";
import { IdentityMesh, identityModel, type IdentityPart } from "../identity/mesh";
import type { LighthouseArt } from "./kit";

/*
 * Sälskär (1868): a tall, slender round brick tower, whitewashed, on a wider plinth drum with a round-arched door,
 * bound with four iron hoops after storms cracked it, small square windows climbing one line above the door; a
 * corbelled cornice carries the gallery and its black rail, then a dark watch room, the glazed lantern in its storm
 * cage, and a red dome with a ball and a lightning rod. 32 m from the ground to its ball, measured off a photo
 * (Commons, File:Sälskär.JPG) on its 6 m plinth. +z holds its door.
 */

/** Odd, so a flat face looks along +z, where the door and windows are. */
const SIDES = 17;
const APOTHEM = Math.cos(Math.PI / SIDES);
const [PLINTH_FOOT, PLINTH_TOP, LEDGE_TOP] = [-0.6, 5.15, 5.35];
const [SHAFT_TOP, CORNICE_TOP, GALLERY] = [23.9, 25.15, 25.4];
const [WATCH_TOP, LANTERN_TOP, DOME_TOP] = [27.35, 29.9, 31.05];
const [LANTERN_R, EAVE_R] = [1.75, 1.88];
const LAMP_M = (WATCH_TOP + LANTERN_TOP) / 2;
const SWAP_M = 520;
const REACH_M = 20000;

const between = (y: number, [y0, r0]: readonly [number, number], [y1, r1]: readonly [number, number]) => r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
const plinthR = (y: number) => between(y, [PLINTH_FOOT, 3.05], [PLINTH_TOP, 2.95]);
const shaftR = (y: number) => between(y, [LEDGE_TOP, 2.6], [SHAFT_TOP, 2.29]);
const BANDS_M = [8.7, 14.6, 20.0, 23.62];
const WINDOWS_M = [6.2, 9.6, 13.4, 17.4, 22.7];

/** A rail between two corners, cut back 2 cm at each so the next one round doesn't lie in its faces' planes. */
function short(from: V3, to: V3): [V3, V3] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const at = (share: number): V3 => [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share, from[2] + (to[2] - from[2]) * share];
  return [at(0.02 / length), at(1 - 0.02 / length)];
}

/** A flat outline on the tower's +z face, `lift` clear of it: points are across (x) and up (y). */
function onFront(mesh: IdentityMesh, radiusAt: (y: number) => number, outline: readonly (readonly [number, number])[], lift: number, part: IdentityPart): void {
  mesh.face(outline.map(([x, y]): V3 => [x, y, radiusAt(y) * APOTHEM + lift]), part);
}

/** A round-headed opening: straight sides from `foot` and a half circle on top, as one convex outline. */
function arch(wide: number, foot: number, straight: number): [number, number][] {
  const half = wide / 2;
  const head = Array.from({ length: 7 }, (_, step): [number, number] => {
    const angle = (step / 6) * Math.PI;
    return [Math.cos(angle) * half, foot + straight + Math.sin(angle) * half];
  });
  return [[-half, foot], [half, foot], ...head, [-half, foot + straight]];
}

function build() {
  const near = new IdentityMesh();
  // The plinth drum, its ledge, and the shaft tapering to the cornice.
  near
    .tube([0, PLINTH_FOOT, 0], [0, PLINTH_TOP, 0], plinthR(PLINTH_FOOT), SIDES, { radiusTo: plinthR(PLINTH_TOP), shadeFrom: 0.86, shadeTo: 0.98 }, "whitewash")
    .tube([0, PLINTH_TOP, 0], [0, LEDGE_TOP, 0], 3.13, SIDES, { cap: true, shadeFrom: 0.8, shadeTo: 1.05 }, "whitewash")
    .tube([0, LEDGE_TOP, 0], [0, SHAFT_TOP, 0], shaftR(LEDGE_TOP), SIDES, { radiusTo: shaftR(SHAFT_TOP), shadeFrom: 0.95, shadeTo: 1.04 }, "whitewash")
    .tube([0, SHAFT_TOP, 0], [0, 24.6, 0], shaftR(SHAFT_TOP), SIDES, { radiusTo: 2.42, shadeFrom: 1.02, shadeTo: 0.9 }, "whitewash")
    .tube([0, 24.6, 0], [0, CORNICE_TOP, 0], 2.42, SIDES, { radiusTo: 2.88, shadeFrom: 0.86, shadeTo: 0.94 }, "whitewash")
    .tube([0, CORNICE_TOP, 0], [0, GALLERY, 0], 2.96, SIDES, { cap: true, shadeFrom: 0.9, shadeTo: 1.06 }, "concrete");
  for (const y of BANDS_M) near.tube([0, y - 0.08, 0], [0, y + 0.08, 0], shaftR(y - 0.08) + 0.035, SIDES, { radiusTo: shaftR(y + 0.08) + 0.035 }, "band-black");
  // The arched door in the plinth, in its dark reveal, and the small windows climbing above it.
  onFront(near, plinthR, arch(1.12, 0, 1.9), 0.02, "steel-dark");
  onFront(near, plinthR, arch(0.9, 0, 1.9), 0.04, "door");
  for (const y of WINDOWS_M) {
    onFront(near, shaftR, [[-0.26, y - 0.52], [0.26, y - 0.52], [0.26, y + 0.52], [-0.26, y + 0.52]], 0.02, "trim");
    onFront(near, shaftR, [[-0.2, y - 0.46], [0.2, y - 0.46], [0.2, y + 0.46], [-0.2, y + 0.46]], 0.04, "glass");
  }

  // The watch room, the lantern on it with its lamp, its frames and storm cage, and the red dome.
  near
    .tube([0, GALLERY, 0], [0, WATCH_TOP, 0], 2.0, SIDES, { cap: true, shadeFrom: 0.85, shadeTo: 1 }, "band-black")
    .tube([0, WATCH_TOP, 0], [0, LANTERN_TOP, 0], LANTERN_R, 12, {}, "lantern-glass")
    .tube([0, LAMP_M - 0.4, 0], [0, LAMP_M + 0.4, 0], 0.36, 6, { cap: true }, "lamp")
    .tube([0, LANTERN_TOP, 0], [0, LANTERN_TOP + 0.14, 0], EAVE_R, 12, { radiusTo: EAVE_R, shadeFrom: 0.8 }, "roof-red")
    .tube([0, LANTERN_TOP + 0.14, 0], [0, 30.45, 0], EAVE_R - 0.04, 12, { radiusTo: 1.55, shadeFrom: 1.08, shadeTo: 1.02 }, "roof-red")
    .tube([0, 30.45, 0], [0, 30.85, 0], 1.55, 12, { radiusTo: 0.95, shadeFrom: 1.02, shadeTo: 0.96 }, "roof-red")
    .tube([0, 30.85, 0], [0, DOME_TOP, 0], 0.95, 12, { radiusTo: 0.3, cap: true, shadeFrom: 0.96, shadeTo: 0.92 }, "roof-red")
    .tube([0, DOME_TOP - 0.02, 0], [0, 31.32, 0], 0.16, 8, { radiusTo: 0.32 }, "roof-red")
    .tube([0, 31.32, 0], [0, 31.65, 0], 0.32, 8, { radiusTo: 0.06, cap: true, shadeFrom: 1.05, shadeTo: 0.9 }, "roof-red")
    .thinTube([0, 31.6, 0], [0, 32.9, 0], 0.03, 3, { radiusTo: 0.01 }, "band-black");
  const lantern = (angle: number, y: number, reach = LANTERN_R + 0.02): V3 => [Math.cos(angle) * reach, y, Math.sin(angle) * reach];
  for (let post = 0; post < 12; post++) {
    const [a, b] = [(post / 12) * 2 * Math.PI, ((post + 1) / 12) * 2 * Math.PI];
    // Tube corners sit a quarter turn from angle 0 of these, so turn them to stand on the lantern's corners.
    const [ca, cb] = [a - Math.PI / 2, b - Math.PI / 2];
    near.thinBeam(lantern(ca, WATCH_TOP), lantern(ca, LANTERN_TOP), 0.07, 0.07, "band-black");
    for (const y of [28.15, 29.15]) near.thinBeam(...short(lantern(ca, y, LANTERN_R + 0.1), lantern(cb, y, LANTERN_R + 0.1)), 0.04, 0.04, "band-black");
  }

  // The gallery rail, and a small solar panel hung on it to the west (-x).
  const RAIL_R = 2.8;
  const rail = (angle: number, y: number): V3 => [Math.cos(angle) * RAIL_R, y, Math.sin(angle) * RAIL_R];
  for (let post = 0; post < 12; post++) {
    const [a, b] = [((post + 0.5) / 12) * 2 * Math.PI, ((post + 1.5) / 12) * 2 * Math.PI];
    near.thinBeam(rail(a, GALLERY), rail(a, GALLERY + 1.025), 0.05, 0.05, "band-black");
    near.thinBeam(...short(rail(a, GALLERY + 1.05), rail(b, GALLERY + 1.05)), 0.05, 0.05, "band-black");
    near.thinBeam(...short(rail(a, GALLERY + 0.55), rail(b, GALLERY + 0.55)), 0.035, 0.035, "band-black");
  }
  near.box([-2.92, GALLERY + 0.45, -0.45], [-2.86, GALLERY + 1.3, 0.45], "solar-panel", { shadeTop: 0.9 });

  // The same tower, plain: plinth, shaft, cornice and gallery, watch room, lantern and dome.
  const far = new IdentityMesh()
    .tube([0, PLINTH_FOOT, 0], [0, LEDGE_TOP, 0], 3.05, 5, { radiusTo: 3.0, cap: true, shadeFrom: 0.86 }, "whitewash")
    .tube([0, LEDGE_TOP, 0], [0, SHAFT_TOP, 0], shaftR(LEDGE_TOP), 5, { radiusTo: shaftR(SHAFT_TOP), shadeFrom: 0.95, shadeTo: 1.04 }, "whitewash")
    .tube([0, SHAFT_TOP, 0], [0, GALLERY, 0], shaftR(SHAFT_TOP), 5, { radiusTo: 2.95, cap: true, shadeFrom: 0.95 }, "whitewash")
    .tube([0, GALLERY, 0], [0, WATCH_TOP, 0], 2.0, 5, { shadeFrom: 0.85 }, "band-black")
    .tube([0, WATCH_TOP, 0], [0, LANTERN_TOP, 0], LANTERN_R, 5, {}, "lantern-glass")
    .tube([0, LANTERN_TOP, 0], [0, 30.45, 0], EAVE_R, 5, { radiusTo: 1.55, shadeFrom: 1.05 }, "roof-red")
    .tube([0, 30.45, 0], [0, 31.5, 0], 1.55, 5, { radiusTo: 0.2, cap: true, shadeFrom: 1, shadeTo: 0.92 }, "roof-red");
  return identityModel(near, far, SWAP_M, REACH_M);
}

export const SALSKAR: LighthouseArt = { name: "Sälskär", build, lampM: LAMP_M, lanternM: EAVE_R };
