import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { louvres, projectors, splitter } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, thirdBrake, type Shape } from "../recipe";

const BRUS = driven("brus");
const { sill, sillTop, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Aurelle's face, as Dyning set it: a low, wide grille framed in bright metal and crossed by one bright bar, between
 * slim lamps of two strokes of light raked back into the bonnet; the same two strokes in red at the corners of a dark
 * band the tail's whole width; a gill behind each front wheel and a fine bright line drawn back from it. Brus is the
 * sports car of the family: a shorter bonnet with two vents in it, a dark intake the nose's width under its grille, a
 * tight fastback ending in a kicked-up lip, hips that stand out over the rear wheels, and four pipes in pairs in a dark
 * valance.
 *
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's. Across an end, the rows from `rail` up are its middle and those below are its corners.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** A dark intake the nose's whole width under the grille, over the splitter. */
  intake: [{ surface: "grille", from: sillTop, to: ALL }],
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

const NOSE_Z = -2.28;
const TAIL_Z = 2.28;

/** The grille's bright frame, standing just off the nose round it, and a bright bar across it. */
const GRILLE: { h: readonly [number, number]; x: number } = { h: [0.29, 0.45], x: 0.39 };
const grilleFrame = (): Decal[] => {
  const [low, high] = GRILLE.h;
  const thick = 0.016;
  return [
    { on: "front", at: [0, high + thick / 2], size: [GRILLE.x * 2 + thick * 2, thick], surface: "rim", cells: [8, 1], liftM: 0.014, fine: true },
    { on: "front", at: [0, low - thick / 2], size: [GRILLE.x * 2 + thick * 2, thick], surface: "rim", cells: [8, 1], liftM: 0.014, fine: true },
    { on: "front", at: [GRILLE.x + thick / 2, (low + high) / 2], size: [thick, high - low], surface: "rim", cells: [1, 3], liftM: 0.014, mirror: true, fine: true },
    // The one bright bar across the mouth, over the plate.
    { on: "front", at: [0, 0.413], size: [GRILLE.x * 2 - 0.02, 0.012], surface: "rim", cells: [8, 1], liftM: 0.02, fine: true },
  ];
};

/** The flank's line: a gill behind each front wheel and a fine bright line drawn back from it over the door to the haunch. */
const flank = (): Decal[] => [
  { on: "side", at: [-0.8, 0.58], size: [0.29, 0.12], surface: "rim", mirror: true, cells: [4, 1], liftM: 0.012, fine: true },
  ...[0.612, 0.58, 0.548].map((h, at): Decal => ({ on: "side", at: [-0.8 - at * 0.012, h], size: [0.25 - at * 0.025, 0.018], surface: "grille", mirror: true, liftM: 0.018 })),
  { on: "side", at: [0.07, 0.625], size: [1.45, 0.01], surface: "rim", mirror: true, cells: [12, 1], liftM: 0.012, fine: true },
];

/** A short-bonneted front-engined 2+2: the cabin just behind the front axle's reach, a tight fastback, hips over the rear wheels. */
const shape: Shape = {
  trackM: BRUS.trackM,
  axleZ: BRUS.axleZ,
  wheelRadiusM: BRUS.wheelRadiusM,
  tyreWidthM: 0.285,
  noseZ: NOSE_Z,
  tailZ: TAIL_Z,
  halfWidth: 0.98,
  sillH: 0.14,
  flareM: 0.035,
  archClearM: 0.035,
  grilleH: 0.45,
  lampH: [0.48, 0.56],
  hoodLipH: 0.575,
  hoodH: 0.75,
  cowl: [-0.34, 0.855],
  header: [0.2, 1.21],
  roof: [0.5, 1.29],
  roofEnd: [0.85, 1.25],
  shoulder: [
    [-2.28, 0.46],
    [-1.9, 0.65],
    [-1.36, 0.765],
    [-0.8, 0.745],
    [-0.2, 0.74],
    [0.5, 0.78],
    [1.27, 0.87],
    [1.9, 0.855],
    [2.28, 0.79],
  ],
  belt: [
    [-2.28, 0.495],
    [-1.9, 0.685],
    [-1.36, 0.8],
    [-0.8, 0.78],
    [-0.2, 0.775],
    [0.5, 0.815],
    [1.27, 0.905],
    [1.9, 0.89],
    [2.28, 0.825],
  ],
  windowTop: [
    [-0.31, 0.83],
    [0.0, 1.02],
    [0.3, 1.15],
    [0.6, 1.185],
    [0.95, 1.12],
    [1.25, 0.99],
    [1.5, 0.9],
  ],
  windowZ: [-0.31, 1.5],
  railWidth: [
    [-2.28, 0.42],
    [-1.36, 0.62],
    [-0.36, 0.74],
    [0.25, 0.62],
    [0.9, 0.58],
    [1.6, 0.66],
    [2.28, 0.56],
  ],
  tail: [],
  seams: [-0.26, 0.86],
  pillars: [[0.92, 0.98]],
  mirror: { z: -0.17, h: 0.94, x: 0.83 },
  rearPlateH: 0.6,
  rearSeats: true,
  cabinEndZ: 1.7,
  decals: [
    // The main beams: lit lenses over the lamp's slits, joining them into one headlamp at night.
    ...projectors({ x: [0.6, 0.71], h: 0.508, size: 0.052, lensLiftM: 0.03, ring: false }),
    ...plates(0.6, 0.355),
    ...handles([0.72], 0.765),
    ...grilleFrame(),
    ...flank(),
    { ...thirdBrake(2.135, 0.36), liftM: 0.012 },
    // Two vents in the bonnet over the engine, three slats each, Aurelle's gill laid flat.
    ...louvres({ x: 0.28, z: -1.42, long: 0.36, wide: 0.17, count: 3 }),
    // Reversing lamps at the outer ends of the dark valance, beside the pipes.
    { ...reversing(0.56, 0.4), liftM: 0.012 },
  ],
  blocks: [splitter({ z: NOSE_Z - 0.01, h: 0.2, halfWidth: 0.66, long: 0.18 })],
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: NOSE_Z - 0.012, h: 0.19, band: "bumper" },
      { z: NOSE_Z - 0.008, h: 0.21, band: "intake" },
      { z: NOSE_Z - 0.003, h: 0.27 },
      { z: NOSE_Z, h: GRILLE.h[0], band: "mouth" },
      { z: NOSE_Z + 0.002, h: GRILLE.h[1] },
      // The lamp: two strokes of light, one over the other, in a dark housing raked back into the bonnet.
      { z: NOSE_Z + 0.014, h: 0.48, band: "headDark" },
      { z: NOSE_Z + 0.027, h: 0.492, band: "headLamp" },
      { z: NOSE_Z + 0.043, h: 0.511, band: "headDark" },
      { z: NOSE_Z + 0.059, h: 0.53, band: "headLamp" },
      { z: NOSE_Z + 0.075, h: 0.551, band: "headDark" },
      { z: NOSE_Z + 0.094, h: 0.568 },
      // The bonnet, then the screen, roof, rear glass and deck, each as one fair line.
      ...faired(
        [
          [NOSE_Z + 0.094, 0.568],
          [-2.02, 0.64],
          [-1.36, 0.75],
          [-0.8, 0.815],
          [-0.4, 0.843],
        ],
        [[NOSE_Z + 0.094, undefined]],
      ),
      { z: -0.4, h: 0.843, band: "cowl" },
      ...faired(
        [
          [-0.34, 0.855],
          [-0.05, 1.035],
          [0.2, 1.21],
          [0.5, 1.29],
          [0.85, 1.25],
          [1.2, 1.12],
          [1.6, 0.99],
          [2.06, 0.92],
        ],
        [
          [-0.34, "screen"],
          [0.2, undefined],
          [0.85, "rearGlass"],
          [1.68, undefined],
        ],
      ),
      // The fastback kicks up into a short lip over the tail.
      { z: 2.06, h: 0.92 },
      { z: 2.13, h: 0.935 },
      { z: 2.17, h: 0.938, band: "gap" },
      { z: 2.18, h: 0.925, band: "tailDark" },
      { z: 2.188, h: 0.91, band: "tailLamp" },
      { z: 2.195, h: 0.883, band: "tailDark" },
      { z: 2.202, h: 0.868, band: "tailLamp" },
      { z: 2.209, h: 0.841, band: "tailDark" },
      { z: 2.217, h: 0.821 },
      { z: 2.25, h: 0.58 },
      { z: 2.262, h: 0.46, band: "diffuser" },
      { z: TAIL_Z, h: 0.22 },
    ],
    crown: [
      [-2.28, 0.02],
      [-1.9, -0.025],
      [-1.36, -0.05],
      [-0.7, -0.02],
      [-0.3, 0.03],
      [0.5, 0.06],
      [1.27, -0.045],
      [1.9, -0.025],
      [2.28, 0.02],
    ],
    shelf: [
      [-2.28, 0],
      [-0.5, 0],
      [-0.2, 0.06],
      [0.5, 0.13],
      [1.27, 0.24],
      [1.85, 0.14],
      [2.28, 0.03],
    ],
    halfWidth: [
      [-2.28, 0.77],
      [-2.0, 0.92],
      [-1.36, 0.965],
      [-0.5, 0.935],
      [0.4, 0.945],
      [1.27, 0.98],
      [1.95, 0.955],
      [2.28, 0.85],
    ],
    hoodSeamZ: [-2.08, -0.5],
    cleanEnds: true,
    scoop: [
      [-1.0, 0],
      [-0.6, 0.015],
      [0.3, 0.025],
      [0.8, 0.01],
      [0.9, 0],
    ],
    // A 2+2: the rear seats drawn forward under the fastback, so their heads stay below the rear glass.
    cabin: { dashZ: -0.32, dashH: 0.77, floorH: 0.28, seatZ: 0.6, rearSeatZ: 1.2, endZ: 1.6, seatX: BRUS.trackM * 0.23, seatSurface: "seat" },
    exhausts: { x: [-0.31, -0.195, 0.195, 0.31], h: 0.3, z: 2.33, radius: 0.05 },
  },
};

export const brus: CarSpec = {
  id: BRUS.id,
  name: BRUS.name,
  ride: BRUS.ride,
  paint: "car-paint-garnet",
  paints: [
    paint("car-paint-garnet", "metallic"),
    paint("car-paint-racing-green", "metallic"),
    paint("car-paint-storm-grey", "metallic"),
    paint("car-paint-midnight", "metallic"),
    paint("car-paint-bronze", "metallic"),
    paint("car-paint-orange"),
    paint("car-paint-ivory", "pearl", { flip: "car-paint-ivory-flip" }),
  ],
  body: bodyOf(shape),
  /** Aurelle's cabin made sportier: analogue dials with the fine display between them, a flat-bottomed wheel, bolstered seats quilted in dark leather, garnet on the doors and bright metal round the dials. */
  interior: {
    gauges: "analogue",
    wheel: "flat",
    shifter: "lever",
    seats: "sport",
    quilted: true,
    centreDisplay: true,
    screen: true,
    eye: [0, -0.035, 0],
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-garnet", headliner: "car-cabin-headliner-dark", accent: "car-cabin-metal", glow: "car-cabin-glow-amber" },
  },
  wheel: { radiusM: BRUS.wheelRadiusM, widthM: 0.285, rimShare: 0.75, spokes: 5, twinSpokes: true, style: "split" },
  shadowHalf: [0.98, TAIL_Z],
};
