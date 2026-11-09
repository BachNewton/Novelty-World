import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const ANKAR = driven("ankar");
const { sill, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's. Across an end, the rows from `rail` up are its middle and those below are its corners.
 */

/**
 * Aurelle's face, as Dyning and Brus wear it, on the maker's long saloon: a grille framed in bright metal between slim
 * lamps of two strokes of light, one over the other, here taller and more upright, with bright slats down it; the same
 * two strokes in red at the tail's corners on a dark band the width of the boot; along each flank a gill behind the
 * front wheel and a fine line drawn back from it to the rear haunch, here a coachline in the stripe colour.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  mouth: [{ surface: "grille", from: rail, to: ALL }],
  headDark: [{ surface: "trim", from: belt, to: rail }],
  headLamp: [{ surface: "lensHead", from: belt, to: rail }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  tailLamp: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "trim", from: rail, to: ALL },
  ],
};

const GRILLE: { h: readonly [number, number]; x: number } = { h: [0.33, 0.55], x: 0.4 };
const grilleFrame = (): Decal[] => {
  const [low, high] = GRILLE.h;
  const thick = 0.016;
  return [
    { on: "front", at: [0, high + thick / 2], size: [GRILLE.x * 2 + thick * 2, thick], surface: "rim", cells: [8, 1], liftM: 0.014, fine: true },
    { on: "front", at: [0, low - thick / 2], size: [GRILLE.x * 2 + thick * 2, thick], surface: "rim", cells: [8, 1], liftM: 0.014, fine: true },
    { on: "front", at: [GRILLE.x + thick / 2, (low + high) / 2], size: [thick, high - low], surface: "rim", cells: [1, 3], liftM: 0.014, mirror: true, fine: true },
    // The saloon's bright slats down the grille, and its one bar across it over the plate.
    ...[0.1, 0.2, 0.3].map((x): Decal => ({ on: "front", at: [x, 0.49], size: [0.01, 0.1], surface: "rim", mirror: true, cells: [1, 2], liftM: 0.018, fine: true })),
    { on: "front", at: [0, 0.49], size: [0.012, 0.1], surface: "rim", cells: [1, 2], liftM: 0.018, fine: true },
    { on: "front", at: [0, 0.432], size: [GRILLE.x * 2 - 0.02, 0.012], surface: "rim", cells: [8, 1], liftM: 0.02, fine: true },
  ];
};

/** The flank's line: a gill behind each front wheel, and the coachline drawn back from it over both doors to the haunch. */
const flank = (): Decal[] => [
  { on: "side", at: [-0.9, 0.62], size: [0.31, 0.12], surface: "rim", mirror: true, cells: [4, 1], liftM: 0.015, fine: true },
  ...[0.652, 0.62, 0.588].map((h, at): Decal => ({ on: "side", at: [-0.9 - at * 0.012, h], size: [0.27 - at * 0.025, 0.018], surface: "grille", mirror: true, liftM: 0.018, fine: true })),
  { on: "side", at: [0.25, 0.665], size: [2.0, 0.012], surface: "stripe", mirror: true, cells: [12, 1], liftM: 0.012 },
];

/** A long, formal four-door saloon with a V12: a long bonnet, the cabin set back, a thick rear pillar and a short boot. */
const shape: Shape = {
  trackM: ANKAR.trackM,
  axleZ: ANKAR.axleZ,
  wheelRadiusM: ANKAR.wheelRadiusM,
  tyreWidthM: 0.245,
  noseZ: -2.55,
  tailZ: 2.55,
  halfWidth: 0.96,
  sillH: 0.19,
  flareM: 0.02,
  archClearM: 0.04,
  grilleH: 0.55,
  lampH: [0.585, 0.677],
  hoodLipH: 0.68,
  hoodH: 0.85,
  cowl: [-0.78, 0.93],
  header: [-0.025, 1.4],
  roof: [0.5, 1.46],
  roofEnd: [1.088, 1.43],
  cornerPullM: [0.16, 0.12],
  shoulder: [
    [-2.55, 0.59],
    [-2.0, 0.73],
    [-1.525, 0.78],
    [-0.8, 0.83],
    [0.4, 0.86],
    [1.525, 0.89],
    [2.55, 0.88],
  ],
  belt: [
    [-2.55, 0.66],
    [-2.0, 0.8],
    [-1.525, 0.85],
    [-0.8, 0.9],
    [0.4, 0.93],
    [1.525, 0.96],
    [2.55, 0.95],
  ],
  windowTop: [
    [-0.75, 0.96],
    [-0.35, 1.15],
    [0, 1.3],
    [0.5, 1.34],
    [1.0, 1.33],
    [1.3, 1.25],
    [1.45, 1.15],
  ],
  windowZ: [-0.75, 1.45],
  railWidth: [
    [-2.55, 0.5],
    [-1.525, 0.74],
    [-0.8, 0.78],
    [0, 0.72],
    [0.8, 0.73],
    [1.6, 0.74],
    [2.4, 0.72],
    [2.55, 0.62],
  ],
  tail: [],
  seams: [-0.7, 0.19, 1.05],
  pillars: [
    [0.15, 0.23],
    [1.1, 1.2],
  ],
  mirror: { z: -0.55, h: 1.0, x: 0.88 },
  rearPlateH: 0.68,
  cabinEndZ: 1.5,
  decals: [...plates(0.68, 0.37), ...handles([-0.2, 0.78], 0.86), ...grilleFrame(), ...flank(), reversing(0.42, 0.8)],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    silhouette: [
      { z: -2.555, h: 0.28, band: "bumper" },
      { z: -2.55, h: 0.31 },
      { z: -2.548, h: GRILLE.h[0], band: "mouth" },
      { z: -2.545, h: GRILLE.h[1] },
      // The lamp: two strokes of light, one over the other, in a dark housing raked back into the bonnet.
      { z: -2.53, h: 0.585, band: "headDark" },
      { z: -2.518, h: 0.597, band: "headLamp" },
      { z: -2.502, h: 0.617, band: "headDark", fine: true },
      { z: -2.486, h: 0.637, band: "headLamp", fine: true },
      { z: -2.47, h: 0.659, band: "headDark" },
      { z: -2.452, h: 0.677 },
      ...faired(
        [
          [-2.45, 0.68],
          [-2.0, 0.79],
          [-1.525, 0.85],
          [-0.85, 0.9],
        ],
        [[-2.45, undefined]],
      ),
      { z: -0.85, h: 0.9, band: "cowl" },
      ...faired(
        [
          [-0.78, 0.93],
          [-0.35, 1.2],
          [-0.025, 1.4],
          [0.5, 1.46],
          [1.088, 1.43],
          [1.45, 1.3],
          [1.75, 1.06],
          [2.0, 1.0],
          [2.4, 0.99],
        ],
        [
          [-0.78, "screen"],
          [-0.025, undefined],
          [1.088, "rearGlass"],
          [1.724, undefined],
        ],
      ),
      { z: 2.44, h: 0.985, band: "gap" },
      { z: 2.45, h: 0.975, band: "tailDark" },
      { z: 2.458, h: 0.96, band: "tailLamp" },
      { z: 2.465, h: 0.933, band: "tailDark", fine: true },
      { z: 2.472, h: 0.918, band: "tailLamp", fine: true },
      { z: 2.479, h: 0.891, band: "tailDark" },
      { z: 2.487, h: 0.871 },
      { z: 2.53, h: 0.6 },
      { z: 2.545, h: 0.42, band: "bumper" },
      { z: 2.55, h: 0.3 },
    ],
    sill: [
      [-2.55, 0.25],
      [-2.1, 0.2],
      [0, 0.19],
      [2.1, 0.2],
      [2.55, 0.25],
    ],
    crown: [
      [-2.55, 0.02],
      [-1.525, 0.02],
      [-0.85, 0.03],
      [-0.3, 0.05],
      [0.5, 0.065],
      [1.3, 0.05],
      [1.8, 0.02],
      [2.55, 0.02],
    ],
    shelf: [
      [-2.55, 0],
      [-1.5, 0.02],
      [-0.7, 0.04],
      [0.5, 0.065],
      [1.3, 0.07],
      [2.0, 0.04],
      [2.55, 0.02],
    ],
    halfWidth: [
      [-2.55, 0.8],
      [-2.3, 0.92],
      [-1.525, 0.95],
      [-0.7, 0.94],
      [0.4, 0.945],
      [1.525, 0.96],
      [2.2, 0.95],
      [2.55, 0.86],
    ],
    hoodSeamZ: [-2.35, -0.9],
    exhausts: { x: [-0.6, 0.6], h: 0.32, z: 2.56, radius: 0.05, open: true },
  },
};

export const ankar: CarSpec = {
  id: ANKAR.id,
  name: ANKAR.name,
  ride: ANKAR.ride,
  paint: "car-paint-black",
  paints: [
    paint("car-paint-black", "solid", { stripe: "car-paint-champagne" }),
    paint("car-paint-midnight", "metallic", { stripe: "car-paint-silver" }),
    paint("car-paint-aubergine", "metallic", { stripe: "car-paint-champagne" }),
    paint("car-paint-racing-green", "metallic", { stripe: "car-paint-champagne" }),
    paint("car-paint-graphite", "metallic", { stripe: "car-paint-silver" }),
    paint("car-paint-champagne", "metallic", { stripe: "car-paint-saddle" }),
    paint("car-paint-ivory", "pearl", { flip: "car-paint-ivory-flip", stripe: "car-paint-oxblood" }),
  ],
  body: bodyOf(shape),
  /** A V12 saloon's cabin: analogue dials with a fine display between them, a round wheel, quilted oxblood leather, wood on the doors and bright metal round the dials. */
  interior: {
    gauges: "analogue",
    wheel: "round",
    shifter: "lever",
    seats: "comfort",
    quilted: true,
    centreDisplay: true,
    screen: true,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-wood", headliner: "car-cabin-headliner", accent: "car-cabin-metal", glow: "car-cabin-glow-amber", seat: "car-cabin-seat-oxblood" },
  },
  wheel: { radiusM: ANKAR.wheelRadiusM, widthM: 0.245, rimShare: 0.74, spokes: 10, twinSpokes: false, style: "mesh" },
  shadowHalf: [0.96, 2.55],
};
