import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser } from "../parts";
import { bodyOf, driven, faired, handles, plates, type Shape } from "../recipe";

const DYNING = driven("dyning");
const { sill, sillTop, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Aurelle's face, which its other cars share: a low, wide grille framed in bright metal between slim lamps of two
 * strokes of light, one over the other, and the same two strokes in red at the tail's corners; along each flank a gill
 * behind the front wheel and a fine bright line drawn back from it to the rear haunch.
 *
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's. Across an end, the rows from `rail` up are its middle and those below are its corners.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** The grille, in the middle of the nose: as wide as the rail is there. */
  mouth: [{ surface: "grille", from: rail, to: ALL }],
  headDark: [{ surface: "trim", from: belt, to: rail }],
  headLamp: [{ surface: "lensHead", from: belt, to: rail }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  /** A dark band the whole width of the tail, the two strokes of red at its corners. */
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  tailLamp: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "trim", from: rail, to: ALL },
  ],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** The grille's bright frame, standing just off the nose round it, and a bright bar across it. */
const GRILLE: { h: readonly [number, number]; x: number } = { h: [0.315, 0.465], x: 0.4 };
const grilleFrame = (): Decal[] => {
  const [low, high] = GRILLE.h;
  const thick = 0.016;
  return [
    { on: "front", at: [0, high + thick / 2], size: [GRILLE.x * 2 + thick * 2, thick], surface: "rim", cells: [8, 1], liftM: 0.014, fine: true },
    { on: "front", at: [0, low - thick / 2], size: [GRILLE.x * 2 + thick * 2, thick], surface: "rim", cells: [8, 1], liftM: 0.014, fine: true },
    { on: "front", at: [GRILLE.x + thick / 2, (low + high) / 2], size: [thick, high - low], surface: "rim", cells: [1, 3], liftM: 0.014, mirror: true, fine: true },
    // The one bright bar across the mouth, over the plate.
    { on: "front", at: [0, 0.428], size: [GRILLE.x * 2 - 0.02, 0.012], surface: "rim", cells: [8, 1], liftM: 0.02, fine: true },
  ];
};

/** The flank's line: a gill behind each front wheel and a fine bright line drawn back from it over the door to the haunch. */
const flank = (): Decal[] => [
  { on: "side", at: [-0.92, 0.6], size: [0.31, 0.12], surface: "rim", mirror: true, cells: [4, 1], liftM: 0.008, fine: true },
  ...[0.632, 0.6, 0.568].map((h, at): Decal => ({ on: "side", at: [-0.92 - at * 0.012, h], size: [0.27 - at * 0.025, 0.018], surface: "grille", mirror: true, liftM: 0.014 })),
  { on: "side", at: [0.12, 0.645], size: [1.75, 0.01], surface: "rim", mirror: true, cells: [12, 1], liftM: 0.012, fine: true },
];

/** A long-bonneted grand tourer: the cabin set back near the rear axle, a fastback falling to a short tail, hips over the rear wheels. */
const shape: Shape = {
  trackM: DYNING.trackM,
  axleZ: DYNING.axleZ,
  wheelRadiusM: DYNING.wheelRadiusM,
  tyreWidthM: 0.275,
  noseZ: -2.42,
  tailZ: 2.36,
  halfWidth: 0.99,
  sillH: 0.14,
  flareM: 0.025,
  archClearM: 0.035,
  grilleH: 0.47,
  lampH: [0.5, 0.6],
  hoodLipH: 0.6,
  hoodH: 0.77,
  cowl: [-0.22, 0.87],
  header: [0.4, 1.225],
  roof: [0.75, 1.27],
  roofEnd: [1.05, 1.235],
  shoulder: [
    [-2.42, 0.48],
    [-2.0, 0.68],
    [-1.47, 0.79],
    [-0.9, 0.765],
    [-0.2, 0.76],
    [0.6, 0.8],
    [1.33, 0.86],
    [2.0, 0.84],
    [2.36, 0.78],
  ],
  belt: [
    [-2.42, 0.515],
    [-2.0, 0.715],
    [-1.47, 0.825],
    [-0.9, 0.8],
    [-0.2, 0.795],
    [0.6, 0.835],
    [1.33, 0.895],
    [2.0, 0.875],
    [2.36, 0.815],
  ],
  windowTop: [
    [-0.19, 0.83],
    [0.1, 1.01],
    [0.45, 1.15],
    [0.8, 1.175],
    [1.15, 1.12],
    [1.45, 1.02],
    [1.65, 0.93],
  ],
  windowZ: [-0.19, 1.65],
  railWidth: [
    [-2.42, 0.42],
    [-1.47, 0.62],
    [-0.22, 0.74],
    [0.4, 0.62],
    [1.0, 0.6],
    [1.6, 0.66],
    [2.36, 0.56],
  ],
  tail: [],
  seams: [-0.1, 1.0],
  pillars: [[1.06, 1.11]],
  mirror: { z: -0.06, h: 0.95, x: 0.84 },
  rearPlateH: 0.64,
  rearSeats: false,
  cabinEndZ: 1.45,
  seat: "seatTan",
  decals: [...plates(0.64, 0.36), ...handles([0.82], 0.79), ...grilleFrame(), ...flank()],
  blocks: diffuser({ z: 1.98, tailZ: 2.34, h: 0.24, x: [0.3] }).map((fin) => ({ ...fin, fine: true })),
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.43, h: 0.21, band: "bumper" },
      { z: -2.425, h: 0.25 },
      { z: -2.42, h: GRILLE.h[0], band: "mouth" },
      { z: -2.418, h: GRILLE.h[1] },
      // The lamp: two strokes of light, one over the other, in a dark housing.
      { z: -2.412, h: 0.5, band: "headDark" },
      { z: -2.405, h: 0.512, band: "headLamp" },
      { z: -2.399, h: 0.532, band: "headDark" },
      { z: -2.391, h: 0.552, band: "headLamp" },
      { z: -2.383, h: 0.574, band: "headDark" },
      { z: -2.372, h: 0.592 },
      // The bonnet, then the screen, roof, rear glass and deck, each as one fair line.
      ...faired(
        [
          [-2.372, 0.592],
          [-2.15, 0.665],
          [-1.47, 0.77],
          [-0.8, 0.83],
          [-0.28, 0.858],
        ],
        [[-2.372, undefined]],
      ),
      { z: -0.28, h: 0.858, band: "cowl" },
      ...faired(
        [
          [-0.22, 0.87],
          [0.1, 1.07],
          [0.4, 1.225],
          [0.75, 1.27],
          [1.1, 1.24],
          [1.5, 1.13],
          [1.9, 1.01],
          [2.22, 0.965],
        ],
        [
          [-0.22, "screen"],
          [0.4, undefined],
          [1.05, "rearGlass"],
          [1.85, undefined],
        ],
      ),
      // A short ducktail lip over the tail.
      { z: 2.22, h: 0.965 },
      { z: 2.265, h: 0.962, band: "gap" },
      { z: 2.275, h: 0.948, band: "tailDark" },
      { z: 2.285, h: 0.925, band: "tailLamp" },
      { z: 2.29, h: 0.905, band: "tailDark" },
      { z: 2.296, h: 0.885, band: "tailLamp" },
      { z: 2.302, h: 0.865, band: "tailDark" },
      { z: 2.31, h: 0.845 },
      { z: 2.345, h: 0.6 },
      { z: 2.355, h: 0.36, band: "diffuser" },
      { z: 2.365, h: 0.235 },
    ],
    crown: [
      [-2.42, 0.02],
      [-2.0, -0.02],
      [-1.47, -0.045],
      [-0.6, -0.02],
      [-0.2, 0.03],
      [0.7, 0.06],
      [1.33, -0.02],
      [2.0, -0.01],
      [2.36, 0.02],
    ],
    shelf: [
      [-2.42, 0],
      [-0.4, 0],
      [-0.1, 0.06],
      [0.6, 0.11],
      [1.33, 0.2],
      [1.9, 0.12],
      [2.36, 0.03],
    ],
    halfWidth: [
      [-2.42, 0.78],
      [-2.1, 0.93],
      [-1.47, 0.985],
      [-0.4, 0.955],
      [0.5, 0.965],
      [1.33, 0.99],
      [2.1, 0.965],
      [2.36, 0.86],
    ],
    hoodSeamZ: [-2.2, -0.36],
    cleanEnds: true,
    scoop: [
      [-1.1, 0],
      [-0.7, 0.015],
      [0.3, 0.02],
      [0.9, 0.008],
      [1.0, 0],
    ],
    exhausts: { x: [-0.56, -0.46, 0.46, 0.56], h: 0.27, z: 2.33, radius: 0.04 },
  },
};

export const dyning: CarSpec = {
  id: DYNING.id,
  name: DYNING.name,
  ride: DYNING.ride,
  paint: "car-paint-swell",
  paints: [
    paint("car-paint-swell", "metallic"),
    paint("car-paint-oxblood", "metallic"),
    paint("car-paint-racing-green", "metallic"),
    paint("car-paint-midnight", "metallic"),
    paint("car-paint-bronze", "metallic"),
    paint("car-paint-ivory", "pearl", { flip: "car-paint-ivory-flip" }),
    paint("car-paint-black"),
  ],
  body: bodyOf(shape),
  /** A grand tourer's cabin: analogue dials, a round wheel, comfortable seats in quilted tan leather, wood on the doors and bright metal round the dials. */
  interior: {
    gauges: "analogue",
    wheel: "round",
    shifter: "lever",
    seats: "comfort",
    quilted: true,
    screen: true,
    // A little below where the roof would seat the eye, so the headliner is a band over the road and not a slab.
    eye: [0, -0.035, 0],
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim-tan", insert: "car-cabin-wood", headliner: "car-cabin-headliner-dark", accent: "car-cabin-metal", glow: "car-cabin-glow-amber" },
  },
  wheel: { radiusM: DYNING.wheelRadiusM, widthM: 0.275, rimShare: 0.74, spokes: 10, twinSpokes: false, style: "mesh" },
  shadowHalf: [0.99, 2.36],
};
