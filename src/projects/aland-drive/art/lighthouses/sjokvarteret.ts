import type { V3 } from "../roadside/mesh";
import { IdentityMesh, identityModel } from "../identity/mesh";
import { plate } from "../identity/kit";
import type { LighthouseArt } from "./kit";

/*
 * Sjökvarteret's harbour light: the little 1898 lantern from Stegskär, on grass in Mariehamn's Maritime Quarter. A
 * white four-legged steel stand, splayed and X-braced in three bays, carries a round deck with a dark underside and a
 * plain rail. On it a white riveted drum, with one band of tall panes leaning out under a hood on the harbour side, the
 * light's sector; then a low conical roof and a chimney vent with its cap. 6 m from the ground to the vent's cap,
 * measured off a photo (Commons, File:Sjökvarteret,_fyr.jpg). +z, the harbour, holds the glazing; the door is round
 * the back.
 */

const FOOT = 0.08;
const DECK = [3.66, 3.75] as const;
/** The stand's half width at its foot and under the deck. */
const [BASE_HALF, TOP_HALF] = [0.9, 0.62];
const LEG_TOP = DECK[0];
const TIES_M = [0.2, 1.45, 2.95, 3.53];
const DECK_R = 1.16;
const RAIL = { r: 1.1, top: 4.55 } as const;
const DRUM_R = 0.8;
const GLASS = { foot: 4.36, top: 4.82, reach: 1.02, panes: 6 } as const;
/** The panes' foot stands out where each pane's middle clears the drum's corners between its edges. */
const PANE_FOOT_R = DRUM_R / Math.cos(Math.PI / 12) + 0.01;
const HOOD = { out: 1.06, low: 4.8, high: 4.97 } as const;
const [ROOF_EAVE, ROOF_R, ROOF_TOP, ROOF_TOP_R] = [5.21, 0.87, 5.68, 0.16];
const VENT = { r: 0.13, top: 5.92, capR: 0.16, capTop: 6.0 } as const;
/** Every 15° round, so the drum's corners meet the panes' at ±90° and every 30° between. */
const SIDES = 24;
const LAMP_M = (GLASS.foot + GLASS.top) / 2;
const LANTERN_M = HOOD.out;
const SWAP_M = 220;
const REACH_M = 3000;

/** A point round the lantern's axis: `angle` from +z towards +x. A tube's corners stand at multiples of its side. */
const round = (angle: number, reach: number, y: number): V3 => [Math.sin(angle) * reach, y, Math.cos(angle) * reach];
const half = (y: number) => BASE_HALF + ((TOP_HALF - BASE_HALF) * (y - FOOT)) / (LEG_TOP - FOOT);
const corner = (sx: number, sz: number, y: number): V3 => [sx * half(y), y, sz * half(y)];
const toward = (from: V3, way: V3, by: number): V3 => [from[0] + way[0] * by, from[1] + way[1] * by, from[2] + way[2] * by];
/** The stand's four sides, each by its two legs and its outward way. */
const PANELS: readonly [[number, number], [number, number], V3][] = [
  [[-1, 1], [1, 1], [0, 0, 1]],
  [[1, 1], [1, -1], [1, 0, 0]],
  [[1, -1], [-1, -1], [0, 0, -1]],
  [[-1, -1], [-1, 1], [-1, 0, 0]],
];
const LEGS = [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const;

/** The panes' edges, from one side of the bay to the other. */
const paneAngles = Array.from({ length: GLASS.panes + 1 }, (_, edge) => -Math.PI / 2 + (edge / GLASS.panes) * Math.PI);

/** The leaning band of panes and the hood over it, at a given number of panes. */
function bay(mesh: IdentityMesh, angles: readonly number[], shade: number): void {
  for (let pane = 0; pane + 1 < angles.length; pane++) {
    const [a, b] = [angles[pane], angles[pane + 1]];
    mesh.face([round(a, PANE_FOOT_R, GLASS.foot), round(b, PANE_FOOT_R, GLASS.foot), round(b, GLASS.reach, GLASS.top), round(a, GLASS.reach, GLASS.top)], "lantern-glass", shade);
    mesh.face([round(a, HOOD.out, HOOD.low), round(b, HOOD.out, HOOD.low), round(b, DRUM_R - 0.03, HOOD.high), round(a, DRUM_R - 0.03, HOOD.high)], "whitewash", 1.08);
  }
  // The cheeks closing the bay's two ends, a hair outside its last panes.
  for (const side of [-1, 1]) {
    const angle = side * (Math.PI / 2 + 0.012);
    mesh.face([round(angle, DRUM_R - 0.02, GLASS.foot - 0.02), round(angle, GLASS.reach + 0.01, GLASS.top), round(angle, HOOD.out - 0.02, HOOD.low + 0.01), round(angle, DRUM_R - 0.02, HOOD.high - 0.02)], "whitewash", 0.9);
  }
}

function build() {
  const near = new IdentityMesh();

  // The stand: concrete footings, four splayed legs, ties at four levels and an X in each bay between them.
  for (const [sx, sz] of LEGS) {
    const [x, , z] = corner(sx, sz, FOOT);
    near.box([x - 0.16, -0.2, z - 0.16], [x + 0.16, FOOT, z + 0.16], "concrete", { open: true, shadeTop: 1.06 });
    near.thinBeam(corner(sx, sz, FOOT), corner(sx, sz, LEG_TOP), 0.08, 0.08, "whitewash");
  }
  PANELS.forEach(([[ax, az], [bx, bz], out], side) => {
    // Ties on the x sides stand 3 cm above those on the z sides, so no two meet in one face at a leg.
    const lift = side % 2 === 0 ? 0 : 0.03;
    for (const y of TIES_M) near.thinBeam(corner(ax, az, y + lift), corner(bx, bz, y + lift), 0.05, 0.05, "whitewash");
    for (let level = 0; level + 1 < TIES_M.length; level++) {
      const [y0, y1] = [TIES_M[level] + 0.04, TIES_M[level + 1] - 0.01];
      near.thinBeam(corner(ax, az, y0), corner(bx, bz, y1), 0.04, 0.04, "whitewash");
      // The other one of the X lies on the outside of the first, as it's bolted there.
      near.thinBeam(toward(corner(bx, bz, y0), out, 0.04), toward(corner(ax, az, y1), out, 0.04), 0.04, 0.04, "whitewash");
    }
  });

  // The deck, its dark steel underside, and the rail round it.
  near.tube([0, DECK[0], 0], [0, DECK[1], 0], DECK_R, SIDES, { cap: true, shadeFrom: 0.7, shadeTo: 1.02 }, "whitewash");
  near.face(Array.from({ length: SIDES }, (_, side) => round((side / SIDES) * 2 * Math.PI, DECK_R, DECK[0])), "steel-dark", 0.8);
  const posts = 12;
  for (let post = 0; post < posts; post++) {
    const [a, b] = [((post + 0.5) / posts) * 2 * Math.PI, ((post + 1.5) / posts) * 2 * Math.PI];
    near.thinBeam(round(a, RAIL.r, DECK[1]), round(a, RAIL.r, RAIL.top - 0.03), 0.035, 0.035, "whitewash");
    // Every other rail a hair higher, so no two meet in one face over a post.
    const y = RAIL.top + (post % 2) * 0.012;
    near.thinBeam(round(a, RAIL.r, y), round(b, RAIL.r, y), 0.04, 0.04, "whitewash");
  }

  // The lantern house: its base flange, the drum, the leaning panes under their hood with their bars, the lamp.
  near
    .tube([0, DECK[1], 0], [0, DECK[1] + 0.09, 0], DRUM_R + 0.04, SIDES / 2, { shadeFrom: 0.8, shadeTo: 1 }, "whitewash")
    .tube([0, DECK[1] + 0.09, 0], [0, ROOF_EAVE - 0.02, 0], DRUM_R, SIDES, { shadeFrom: 0.9, shadeTo: 1.02 }, "whitewash")
    .tube([0, LAMP_M - 0.16, 0], [0, LAMP_M + 0.16, 0], 0.12, 6, { cap: true }, "lamp");
  bay(near, paneAngles, 1);
  for (const angle of paneAngles) near.thinBeam(round(angle, PANE_FOOT_R + 0.02, GLASS.foot), round(angle, GLASS.reach + 0.02, GLASS.top - 0.01), 0.045, 0.045, "whitewash");
  for (let pane = 0; pane < GLASS.panes; pane++) {
    const [a, b] = [paneAngles[pane], paneAngles[pane + 1]];
    // Every other sill a hair higher, so no two meet in one face at a bar.
    const y = GLASS.foot + 0.01 + (pane % 2) * 0.012;
    near.thinBeam(round(a, PANE_FOOT_R + 0.015, y), round(b, PANE_FOOT_R + 0.015, y), 0.06, 0.04, "whitewash");
  }

  // The door round the back, on the drum's flat between two corners.
  const [d0, d1] = [Math.PI - Math.PI / 12, Math.PI];
  const [p0, p1] = [round(d0, DRUM_R, 0), round(d1, DRUM_R, 0)];
  const out: V3 = [Math.sin((d0 + d1) / 2) * 0.02, 0, Math.cos((d0 + d1) / 2) * 0.02];
  plate(near, [p0[0] + out[0], DECK[1] + 0.14, p0[2] + out[2]], [p1[0] - p0[0], 0, p1[2] - p0[2]], [0, 1.0, 0], "steel", 0.95);

  // The low conical roof on its eave, the vent and the vent's cap.
  near
    .tube([0, ROOF_EAVE - 0.03, 0], [0, ROOF_EAVE, 0], DRUM_R - 0.01, SIDES / 2, { radiusTo: ROOF_R, shadeFrom: 0.7 }, "whitewash")
    .tube([0, ROOF_EAVE, 0], [0, ROOF_TOP, 0], ROOF_R, SIDES / 2, { radiusTo: ROOF_TOP_R, cap: true, shadeFrom: 1.0, shadeTo: 1.12 }, "whitewash")
    .tube([0, ROOF_TOP - 0.05, 0], [0, VENT.top, 0], VENT.r, 8, { shadeFrom: 0.95, shadeTo: 1.0 }, "whitewash")
    .tube([0, VENT.top, 0], [0, VENT.top + 0.02, 0], VENT.r, 8, { radiusTo: VENT.capR, shadeFrom: 0.8 }, "whitewash")
    .tube([0, VENT.top + 0.02, 0], [0, VENT.capTop, 0], VENT.capR, 8, { radiusTo: 0.05, cap: true, shadeTo: 1.1 }, "whitewash");

  // Far off: the four legs, the deck, the drum with its band of panes under the hood, the roof and the vent.
  const far = new IdentityMesh();
  for (const [sx, sz] of LEGS) far.thinBeam(corner(sx, sz, 0), corner(sx, sz, LEG_TOP), 0.09, 0.09, "whitewash");
  far
    .tube([0, DECK[0], 0], [0, DECK[1], 0], DECK_R, 8, { cap: true, shadeFrom: 0.7, shadeTo: 1.02 }, "whitewash")
    .tube([0, DECK[1], 0], [0, ROOF_EAVE, 0], DRUM_R, 12, { shadeFrom: 0.9, shadeTo: 1.02 }, "whitewash")
    .tube([0, ROOF_EAVE, 0], [0, VENT.top, 0], ROOF_R, 6, { radiusTo: VENT.r, cap: true, shadeFrom: 1.0, shadeTo: 1.12 }, "whitewash");
  bay(far, paneAngles, 1);
  return identityModel(near, far, SWAP_M, REACH_M);
}

export const SJOKVARTERET: LighthouseArt = { name: "Sjökvarteret's harbour light", build, lampM: LAMP_M, lanternM: LANTERN_M };
