import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";
import { projectors } from "../parts";

const BRIS = driven("bris");
const { sill, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's. Across an end, the rows from `rail` up are its middle and those below are its corners.
 */

/**
 * Aurelle's face, as Dyning and Brus wear it, on the maker's open cruiser: a low, wide grille framed in bright metal
 * between slim lamps of two strokes of light, one over the other, and the same two strokes in red at the tail's
 * corners; along each flank a gill behind the front wheel and a fine bright line drawn back from it to the rear haunch.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  mouth: [{ surface: "grille", from: rail, to: ALL }],
  headDark: [{ surface: "trim", from: belt, to: rail }],
  headLamp: [{ surface: "lensHead", from: belt, to: rail }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  /** The raked screen in its frame, its back glass too down to the scuttle's rim. */
  screen: [{ surface: "glass", from: windowBase, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  tailLamp: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "trim", from: rail, to: ALL },
  ],
};

const GRILLE: { h: readonly [number, number]; x: number } = { h: [0.31, 0.46], x: 0.36 };
const grilleFrame = (): Decal[] => {
  const [low, high] = GRILLE.h;
  const thick = 0.016;
  return [
    { on: "front", at: [0, high + thick / 2], size: [GRILLE.x * 2 + thick * 2, thick], surface: "rim", cells: [8, 1], liftM: 0.014, fine: true },
    { on: "front", at: [0, low - thick / 2], size: [GRILLE.x * 2 + thick * 2, thick], surface: "rim", cells: [8, 1], liftM: 0.014, fine: true },
    { on: "front", at: [GRILLE.x + thick / 2, (low + high) / 2], size: [thick, high - low], surface: "rim", cells: [1, 3], liftM: 0.014, mirror: true, fine: true },
    { on: "front", at: [0, 0.422], size: [GRILLE.x * 2 - 0.02, 0.012], surface: "rim", cells: [8, 1], liftM: 0.02, fine: true },
  ];
};

const flank = (): Decal[] => [
  { on: "side", at: [-0.8, 0.58], size: [0.28, 0.11], surface: "rim", mirror: true, cells: [4, 1], liftM: 0.015, fine: true },
  ...[0.61, 0.58, 0.55].map((h, at): Decal => ({ on: "side", at: [-0.8 - at * 0.012, h], size: [0.24 - at * 0.022, 0.016], surface: "grille", mirror: true, liftM: 0.018, fine: true })),
  { on: "side", at: [0.12, 0.62], size: [1.5, 0.01], surface: "rim", mirror: true, cells: [12, 1], liftM: 0.012, fine: true },
];

/**
 * An open four-seat cruiser with a V6: a long bonnet, a raked screen, a cockpit open from the scuttle back over both rows
 * of seats, and a short rounded deck with its lamps at the corners.
 */
const shape: Shape = {
  trackM: BRIS.trackM,
  axleZ: BRIS.axleZ,
  wheelRadiusM: BRIS.wheelRadiusM,
  tyreWidthM: 0.225,
  noseZ: -2.15,
  tailZ: 2.15,
  halfWidth: 0.9,
  sillH: 0.18,
  flareM: 0.025,
  archClearM: 0.04,
  grilleH: 0.46,
  lampH: [0.495, 0.587],
  hoodLipH: 0.59,
  hoodH: 0.75,
  cowl: [-0.62, 0.84],
  header: [-0.32, 1.22],
  roof: [-0.3, 0.88],
  roofEnd: [-0.28, 0.88],
  cornerPullM: [0.16, 0.12],
  shoulder: [
    [-2.15, 0.48],
    [-1.7, 0.61],
    [-1.275, 0.67],
    [-0.68, 0.73],
    [0.3, 0.75],
    [1.275, 0.77],
    [2.15, 0.73],
  ],
  belt: [
    [-2.15, 0.55],
    [-1.7, 0.68],
    [-1.275, 0.74],
    [-0.68, 0.8],
    [0.3, 0.82],
    [1.275, 0.84],
    [2.15, 0.8],
  ],
  windowTop: [
    [-9, 0],
    [9, 0],
  ],
  windowZ: [0, 0],
  railWidth: [
    [-2.15, 0.46],
    [-1.275, 0.66],
    [-0.68, 0.7],
    [0.3, 0.72],
    [1.275, 0.7],
    [2.15, 0.62],
  ],
  tail: [],
  seams: [-0.56, 0.5],
  pillars: [],
  mirror: { z: -0.45, h: 0.9, x: 0.82 },
  rearPlateH: 0.63,
  decals: [...plates(0.63, 0.36), ...handles([0.32], 0.7), ...grilleFrame(), ...flank(), reversing(0.4, 0.68), ...projectors({ x: [0.57, 0.685], h: 0.53, size: 0.055, lensLiftM: 0.03, ring: false })],
  blocks: [
    // The screen's bright frame along its top.
    { at: [0, 1.225, -0.32], size: [1.18, 0.016, 0.02], surface: "rim", fine: true },
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    bedFloorH: 0.32,
    bedSurface: "interior",
    silhouette: [
      { z: -2.155, h: 0.27, band: "bumper" },
      { z: -2.15, h: 0.29 },
      { z: -2.148, h: GRILLE.h[0], band: "mouth" },
      { z: -2.145, h: GRILLE.h[1] },
      // The lamp: two strokes of light, one over the other, in a dark housing raked back into the bonnet.
      { z: -2.13, h: 0.495, band: "headDark" },
      { z: -2.118, h: 0.507, band: "headLamp" },
      { z: -2.102, h: 0.527, band: "headDark" },
      { z: -2.086, h: 0.547, band: "headLamp" },
      { z: -2.07, h: 0.569, band: "headDark" },
      { z: -2.052, h: 0.587 },
      ...faired(
        [
          [-2.05, 0.59],
          [-1.7, 0.69],
          [-1.275, 0.75],
          [-0.68, 0.82],
        ],
        [[-2.05, undefined]],
      ),
      { z: -0.68, h: 0.82, band: "cowl" },
      { z: -0.62, h: 0.84, band: "screen" },
      { z: -0.32, h: 1.22, band: "screen" },
      // The scuttle's rim right behind the screen, and the cockpit open from it back over both rows of seats.
      { z: -0.28, h: 0.88, bed: true },
      { z: 0.5, h: 0.87, bed: true },
      ...faired(
        [
          [1.1, 0.88],
          [1.5, 0.9],
          [1.98, 0.87],
        ],
        [[1.1, undefined]],
      ),
      { z: 1.98, h: 0.865, band: "gap" },
      { z: 1.99, h: 0.855, band: "tailDark" },
      { z: 1.998, h: 0.84, band: "tailLamp" },
      { z: 2.005, h: 0.813, band: "tailDark" },
      { z: 2.012, h: 0.798, band: "tailLamp" },
      { z: 2.019, h: 0.771, band: "tailDark" },
      { z: 2.027, h: 0.751 },
      { z: 2.1, h: 0.55 },
      { z: 2.14, h: 0.4, band: "bumper" },
      { z: 2.15, h: 0.29 },
    ],
    sill: [
      [-2.15, 0.26],
      [-1.8, 0.2],
      [0, 0.18],
      [1.8, 0.2],
      [2.15, 0.25],
    ],
    crown: [
      [-2.15, 0.02],
      [-1.275, -0.02],
      [-0.7, 0.02],
      [0, 0.03],
      [1.275, -0.02],
      [2.15, 0.01],
    ],
    halfWidth: [
      [-2.15, 0.74],
      [-1.9, 0.86],
      [-1.275, 0.9],
      [-0.6, 0.87],
      [0.3, 0.875],
      [1.275, 0.9],
      [1.85, 0.89],
      [2.15, 0.8],
    ],
    hoodSeamZ: [-1.95, -0.74],
    exhausts: { x: [-0.5, 0.5], h: 0.28, z: 2.16, radius: 0.04, open: true },
    cabin: { dashZ: -0.6, dashH: 0.8, floorH: 0.32, seatZ: 0.15, rearSeatZ: 0.82, endZ: 1.05, seatX: BRIS.trackM * 0.23, seatSurface: "seat" },
  },
};

export const bris: CarSpec = {
  id: BRIS.id,
  name: BRIS.name,
  ride: BRIS.ride,
  paint: "car-paint-white",
  paints: [
    paint("car-paint-white"),
    paint("car-paint-sky"),
    paint("car-paint-mint"),
    paint("car-paint-coral"),
    paint("car-paint-navy", "metallic"),
    paint("car-paint-champagne", "metallic"),
    paint("car-paint-swell", "metallic"),
  ],
  body: bodyOf(shape),
  /** An open cruiser's cabin: analogue dials with a fine display between, a round wheel, tan leather with wood on the doors and bright metal round the dials. */
  interior: {
    gauges: "analogue",
    wheel: "round",
    shifter: "lever",
    seats: "comfort",
    centreDisplay: true,
    screen: true,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim-tan", insert: "car-cabin-wood", headliner: "car-cabin-headliner-dark", accent: "car-cabin-metal", glow: "car-cabin-glow-amber", seat: "car-cabin-seat-tan" },
  },
  wheel: { radiusM: BRIS.wheelRadiusM, widthM: 0.225, rimShare: 0.72, spokes: 10, twinSpokes: false, style: "mesh" },
  shadowHalf: [0.9, 2.15],
};
