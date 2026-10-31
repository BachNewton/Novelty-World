import type { RoadsideModel } from "../roadside/index";
import type { V3 } from "../roadside/mesh";
import { finished, RuralMesh, type RuralPart } from "./mesh";

/*
 * Small things on the water. A y of 0 is the water. A boat's bow is +z. The roadside
 * pier is built to a length for each harbour, one mesh per pier; a jetty here is a
 * fixed module, so the two thousand private ones share one.
 */

/** One section of a private jetty, run end to end along +x. Stretch it to fit a run. */
export const JETTY_SECTION_M = 4;
const JETTY_WIDE_M = 1.4;
const JETTY_DECK_M = 0.7;
const JETTY_PLANKS = 8;
const JETTY_REACH_M = 700;

function deck(mesh: RuralMesh, lengthM: number, wideM: number, planks: number): RuralMesh {
  for (let plank = 0; plank < planks; plank++) {
    const [from, to] = [(plank / planks) * lengthM + 0.012, ((plank + 1) / planks) * lengthM - 0.012];
    mesh.face([[from, JETTY_DECK_M, wideM / 2], [to, JETTY_DECK_M, wideM / 2], [to, JETTY_DECK_M, -wideM / 2], [from, JETTY_DECK_M, -wideM / 2]], plank % 3 === 1 ? "deck" : "deck-pale", 0.97 + ((plank * 5) % 7) * 0.012);
  }
  return mesh;
}

export function buildJettySection(): RoadsideModel {
  const near = deck(new RuralMesh({ grounded: false }), JETTY_SECTION_M, JETTY_WIDE_M, JETTY_PLANKS);
  for (const z of [-0.55, 0.55]) near.beam([0, JETTY_DECK_M - 0.1, z], [JETTY_SECTION_M, JETTY_DECK_M - 0.1, z], 0.08, 0.15, "pile", 0.75);
  near.beam([0.1, JETTY_DECK_M - 0.22, -0.72], [0.1, JETTY_DECK_M - 0.22, 0.72], 0.1, 0.1, "pile", 0.7);
  for (const z of [-0.68, 0.68]) near.tube([0.1, -1.2, z], [0.1, JETTY_DECK_M - 0.04, z], 0.075, 4, { shadeFrom: 0.5, shadeTo: 1 }, "pile");
  const far = new RuralMesh({ grounded: false })
    .face([[0, JETTY_DECK_M, 0.7], [JETTY_SECTION_M, JETTY_DECK_M, 0.7], [JETTY_SECTION_M, JETTY_DECK_M, -0.7], [0, JETTY_DECK_M, -0.7]], "deck-pale")
    .face([[0, JETTY_DECK_M, 0.7], [JETTY_SECTION_M, JETTY_DECK_M, 0.7], [JETTY_SECTION_M, -0.2, 0.7], [0, -0.2, 0.7]], "pile", 0.6);
  return finished(near, far, 120, JETTY_REACH_M);
}

/** A jetty's end: a wider landing with mooring posts, a bench and a ladder down to the water. Its +x is out to sea. */
export function buildJettyHead(): RoadsideModel {
  const [lengthM, wideM] = [3.2, 3];
  const near = deck(new RuralMesh({ grounded: false }), lengthM, wideM, 7);
  for (const z of [-1.3, 1.3]) near.beam([0, JETTY_DECK_M - 0.1, z], [lengthM, JETTY_DECK_M - 0.1, z], 0.08, 0.15, "pile", 0.75);
  near.face([[lengthM, JETTY_DECK_M, -wideM / 2], [lengthM, JETTY_DECK_M, wideM / 2], [lengthM, JETTY_DECK_M - 0.2, wideM / 2], [lengthM, JETTY_DECK_M - 0.2, -wideM / 2]], "pile", 0.8);
  for (const [x, z] of [[0.1, -wideM / 2], [0.1, wideM / 2], [lengthM, -wideM / 2], [lengthM, wideM / 2]] as const) near.tube([x, -1.2, z], [x, JETTY_DECK_M + 0.55, z], 0.085, 4, { cap: true, shadeFrom: 0.5, shadeTo: 1.05 }, "pile");
  // The bench.
  near.box([0.8, JETTY_DECK_M + 0.42, -1.38], [2.4, JETTY_DECK_M + 0.47, -1.02], "deck-pale", { shadeTop: 1.08 });
  for (const x of [0.95, 2.25]) near.box([x - 0.04, JETTY_DECK_M, -1.32], [x + 0.04, JETTY_DECK_M + 0.42, -1.08], "pile", { open: true });
  // The ladder.
  for (const z of [-0.25, 0.25]) near.tube([lengthM + 0.06, -0.7, z], [lengthM + 0.06, JETTY_DECK_M + 0.5, z], 0.025, 3, {}, "tractor-steel");
  for (let rung = 0; rung < 3; rung++) near.beam([lengthM + 0.06, -0.3 + rung * 0.32, -0.25], [lengthM + 0.06, -0.3 + rung * 0.32, 0.25], 0.04, 0.04, "tractor-steel");
  const far = new RuralMesh({ grounded: false })
    .face([[0, JETTY_DECK_M, wideM / 2], [lengthM, JETTY_DECK_M, wideM / 2], [lengthM, JETTY_DECK_M, -wideM / 2], [0, JETTY_DECK_M, -wideM / 2]], "deck-pale")
    .face([[0, JETTY_DECK_M, wideM / 2], [lengthM, JETTY_DECK_M, wideM / 2], [lengthM, -0.2, wideM / 2], [0, -0.2, wideM / 2]], "pile", 0.6)
    .face([[lengthM, JETTY_DECK_M, wideM / 2], [lengthM, JETTY_DECK_M, -wideM / 2], [lengthM, -0.2, -wideM / 2], [lengthM, -0.2, wideM / 2]], "pile", 0.6);
  return finished(near, far, 120, JETTY_REACH_M);
}

interface Station {
  z: number;
  halfBeam: number;
  sheer: number;
  /** The bottom of the hull, below the water at this station. */
  keel: number;
}

/** A hull lofted through its stations: a side of two strakes from sheer to chine to keel, on each side. */
function hull(mesh: RuralMesh, stations: readonly Station[], outside: RuralPart, below: RuralPart, inside: RuralPart | null): RuralMesh {
  const at = ({ z, halfBeam, sheer, keel }: Station, side: number) => ({
    sheer: [side * halfBeam, sheer, z] as V3,
    chine: [side * halfBeam * 0.72, (sheer + keel) * 0.42, z] as V3,
    keel: [0, keel, z] as V3,
  });
  for (let index = 0; index < stations.length - 1; index++) {
    for (const side of [-1, 1]) {
      const [a, b] = [at(stations[index], side), at(stations[index + 1], side)];
      mesh.face([a.sheer, b.sheer, b.chine, a.chine], outside, side > 0 ? 1.02 : 0.92);
      mesh.face([a.chine, b.chine, b.keel, a.keel], below, 0.8);
      if (inside !== null) {
        const inset = (point: V3): V3 => [point[0] * 0.93, point[1], point[2]];
        mesh.face([inset(a.sheer), inset(b.sheer), inset(b.chine), inset(a.chine)], inside, 0.82);
      }
    }
  }
  return mesh;
}

const ROWBOAT: Station[] = [
  { z: -2, halfBeam: 0.58, sheer: 0.5, keel: -0.08 },
  { z: -1, halfBeam: 0.74, sheer: 0.44, keel: -0.14 },
  { z: 0.3, halfBeam: 0.76, sheer: 0.44, keel: -0.16 },
  { z: 1.4, halfBeam: 0.52, sheer: 0.52, keel: -0.12 },
  { z: 2.1, halfBeam: 0.03, sheer: 0.68, keel: 0.1 },
];

export type BoatPaint = "white" | "blue" | "wood";

/** A clinker rowing boat, 4 m, its oars shipped. */
export function buildRowingBoat(paint: BoatPaint = "white"): RoadsideModel {
  const outside: RuralPart = paint === "white" ? "hull-white" : paint === "blue" ? "hull-blue" : "hull-inside";
  const near = hull(new RuralMesh({ grounded: false }), ROWBOAT, outside, outside, "hull-inside");
  near.face([[-0.58, 0.5, -2], [0.58, 0.5, -2], [0.42, 0.04, -2], [-0.42, 0.04, -2]], outside, 0.9);
  near.face([[-0.6, 0.18, -1.75], [0.6, 0.18, -1.75], [0.6, 0.18, 1.2], [-0.6, 0.18, 1.2]], "hull-inside", 0.72);
  for (const [z, half] of [[-1.5, 0.61], [-0.3, 0.72], [0.8, 0.62]] as const) near.box([-half, 0.3, z - 0.11], [half, 0.34, z + 0.11], "thwart", { open: true, shadeTop: 1.08 });
  for (const side of [-1, 1]) {
    near.beam([side * 0.58, 0.54, -2], [side * 0.74, 0.47, -0.3], 0.06, 0.05, "thwart", 0.95, 1.05);
    near.beam([side * 0.74, 0.47, -0.3], [side * 0.03, 0.7, 2.1], 0.06, 0.05, "thwart", 0.95, 1.05);
    near.tube([side * 0.45, 0.4, -1.5], [side * 0.28, 0.42, 1.2], 0.022, 3, {}, "spar");
    near.face([[side * 0.5, 0.41, -1.55], [side * 0.36, 0.41, -1.5], [side * 0.34, 0.41, -0.95], [side * 0.48, 0.41, -1]], "spar", 1.05);
  }
  const far = new RuralMesh({ grounded: false })
    .face([[-0.72, 0.46, -2], [0.72, 0.46, -2], [0.72, 0.46, 0.5], [0, 0.6, 2.1], [-0.72, 0.46, 0.5]], "hull-inside", 0.8)
    .face([[-0.72, 0.46, -2], [-0.72, 0.46, 0.5], [0, 0.6, 2.1], [0, 0, 2.1], [-0.6, 0, -2]], outside, 0.92)
    .face([[0.72, 0.46, -2], [0.72, 0.46, 0.5], [0, 0.6, 2.1], [0, 0, 2.1], [0.6, 0, -2]], outside);
  return finished(near, far, 80, 480);
}

const SAILBOAT: Station[] = [
  { z: -3.1, halfBeam: 0.62, sheer: 0.72, keel: 0.02 },
  { z: -2, halfBeam: 1, sheer: 0.66, keel: -0.3 },
  { z: -0.4, halfBeam: 1.12, sheer: 0.62, keel: -0.42 },
  { z: 1.4, halfBeam: 0.88, sheer: 0.7, keel: -0.34 },
  { z: 3.5, halfBeam: 0.04, sheer: 0.96, keel: 0.1 },
];

export type SailboatRig = "moored" | "sailing";

const MAST_Z = 0.5;
const MAST_M = 8.8;

/** A 7 m wooden sloop: white topsides, a low cabin and a mast. Moored, its sail is under its cover on the boom; `sailing` shows main and jib, for out on the water. */
export function buildSailboat(rig: SailboatRig = "moored"): RoadsideModel {
  const near = hull(new RuralMesh({ grounded: false }), SAILBOAT, "hull-white", "antifoul", null);
  const outline: V3[] = SAILBOAT.flatMap(({ z, halfBeam, sheer }) => [[halfBeam, sheer, z] as V3]);
  near.face([...outline, ...[...outline].reverse().map(([x, y, z]): V3 => [-x, y, z])], "thwart", 0.92);
  near.face([[-0.62, 0.72, -3.1], [0.62, 0.72, -3.1], [0.5, 0.2, -3.1], [-0.5, 0.2, -3.1]], "hull-white", 0.9);
  // The cabin, its windows and the cockpit well.
  near.box([-0.72, 0.62, -0.7], [0.72, 1.12, 1.25], "trim", { open: true, shadeTop: 1 });
  near.face([[-0.72, 1.13, -0.7], [0.72, 1.13, -0.7], [0.72, 1.13, 1.25], [-0.72, 1.13, 1.25]], "deck-pale");
  for (const side of [-1, 1]) near.face([[side * 0.725, 0.84, 0], [side * 0.725, 0.84, 1], [side * 0.725, 1.02, 1], [side * 0.725, 1.02, 0]], "glass");
  near.face([[-0.55, 0.42, -2.5], [0.55, 0.42, -2.5], [0.55, 0.42, -0.74], [-0.55, 0.42, -0.74]], "hull-inside", 0.75);
  near.face([[0, 0.7, -3.1], [0, 0.7, -3.26], [0, -0.6, -3.3], [0, -0.6, -2.7]], "antifoul", 0.8);
  // Mast, boom and stays.
  const mastTop: V3 = [0, MAST_M, MAST_Z];
  near.tube([0, 1.1, MAST_Z], mastTop, 0.07, 4, { radiusTo: 0.04 }, "spar");
  near.tube([0, 1.8, MAST_Z - 0.05], [0, 1.72, -2.9], 0.035, 3, {}, "spar");
  const stay = (from: V3, to: V3) => near.face([from, to, [to[0] + 0.03, to[1], to[2]], [from[0] + 0.03, from[1], from[2]]], "roof-dark", 0.9);
  stay(mastTop, [0, 0.96, 3.45]);
  stay(mastTop, [0, 0.74, -3.05]);
  if (rig === "moored") {
    near.tube([0, 1.82, MAST_Z - 0.1], [0, 1.74, -2.5], 0.13, 5, { radiusTo: 0.07, cap: true }, "cover");
  } else {
    near.face([[0.02, 8.3, MAST_Z - 0.05], [0.42, 1.95, -2.85], [0.02, 1.9, MAST_Z - 0.05]], "sail", 1.04);
    near.face([[-0.02, 7.6, MAST_Z + 0.05], [0.22, 1.25, 3.4], [-0.32, 1.1, 0.75]], "sail", 0.96);
  }
  const far = new RuralMesh({ grounded: false })
    .face([[-1, 0.66, -3], [1, 0.66, -3], [1, 0.66, 1.4], [0, 0.96, 3.5], [-1, 0.66, 1.4]], "thwart", 0.9)
    .face([[-1, 0.66, -3], [-1, 0.66, 1.4], [0, 0.96, 3.5], [0, -0.1, 3.5], [-0.8, -0.1, -3]], "hull-white", 0.92)
    .face([[1, 0.66, -3], [1, 0.66, 1.4], [0, 0.96, 3.5], [0, -0.1, 3.5], [0.8, -0.1, -3]], "hull-white")
    .face([[-0.06, 0.8, MAST_Z], [0.06, 0.8, MAST_Z], [0.04, MAST_M, MAST_Z], [-0.04, MAST_M, MAST_Z]], "spar")
    .face([[0, 0.8, MAST_Z + 0.06], [0, 0.8, MAST_Z - 0.06], [0, MAST_M, MAST_Z - 0.04], [0, MAST_M, MAST_Z + 0.04]], "spar");
  if (rig === "sailing") far.face([[0, 8.3, MAST_Z], [0.42, 1.95, -2.85], [0, 1.9, MAST_Z]], "sail").face([[0, 7.6, MAST_Z], [0.22, 1.25, 3.4], [0, 1.1, 0.75]], "sail", 0.96);
  return finished(near, far, 130, 1200);
}
