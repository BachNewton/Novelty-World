import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { projectors, tailLine } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const LJUS = driven("ljus");
const { sill, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Västan's face as Pil set it down, on the smallest car of the range: one dark band the width of the nose, slim lamps at
 * its outer ends and the grille between them with a blade of the body's colour across it, so lamps and grille read as
 * one line. At the tail, as on every Västan, the lamps stand up the sides of the rear window and turn in across the
 * tailgate under it.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** A small lower intake, the bumper's paint wrapping round its ends. */
  intake: [
    { surface: "paint", from: sill, to: rail },
    { surface: "grille", from: rail, to: ALL },
  ],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  headDark: [{ surface: "trim", from: belt, to: ALL }],
  headLamp: [
    { surface: "lensHead", from: belt, to: rail },
    { surface: "grille", from: rail, to: ALL },
  ],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  /** The lamps standing up the sides of the rear window's lower half. */
  rearGlassLamp: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "glass", from: rail, to: ALL },
  ],
  /** Under the glass, the lamps turning in at the corners, joined across the tailgate by a dark band. */
  tailBar: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "trim", from: rail, to: ALL },
  ],
};

const grilleBar: Decal = { on: "front", at: [0, 0.638], size: [0.8, 0.016], surface: "paint", cells: [8, 1], liftM: 0.014 };

/** Each headlamp's daytime line along its top, turned down at its outer end like an arrowhead: Pil's, a little shorter. */
const daylights: Decal[] = [
  { on: "front", at: [0.555, 0.676], size: [0.17, 0.013], surface: "lensHead", mirror: true, cells: [4, 1], liftM: 0.016 },
  { on: "front", at: [0.638, 0.66], size: [0.016, 0.04], surface: "lensHead", mirror: true, cells: [1, 2], liftM: 0.016 },
];

/**
 * A small upright five-door: a short sloping nose, a tall cabin with a near-vertical tailgate, tall lamps up the rear
 * window's sides and a lip of a spoiler, on small wheels. Rounder and softer than Pil, its hot sister.
 */
const shape: Shape = {
  trackM: LJUS.trackM,
  axleZ: LJUS.axleZ,
  wheelRadiusM: LJUS.wheelRadiusM,
  tyreWidthM: 0.195,
  noseZ: -1.96,
  tailZ: 1.96,
  halfWidth: 0.86,
  sillH: 0.2,
  flareM: 0.025,
  archClearM: 0.04,
  cornerPullM: [0.16, 0.12],
  grilleH: 0.47,
  lampH: [0.595, 0.69],
  hoodLipH: 0.72,
  hoodH: 0.89,
  cowl: [-0.88, 1.0],
  header: [-0.115, 1.45],
  roof: [0.35, 1.5],
  roofEnd: [1.42, 1.45],
  shoulder: [
    [-1.96, 0.635],
    [-1.6, 0.795],
    [-1.23, 0.855],
    [-0.85, 0.905],
    [0.4, 0.935],
    [1.23, 0.965],
    [1.96, 0.945],
  ],
  belt: [
    [-1.96, 0.7],
    [-1.6, 0.86],
    [-1.23, 0.92],
    [-0.85, 0.97],
    [0.4, 1.0],
    [1.23, 1.03],
    [1.96, 1.01],
  ],
  windowTop: [
    [-0.85, 0.99],
    [-0.5, 1.2],
    [-0.15, 1.4],
    [0.35, 1.445],
    [1.0, 1.43],
    [1.15, 1.4],
    [1.3, 1.33],
  ],
  windowZ: [-0.85, 1.3],
  railWidth: [
    [-1.96, 0.44],
    [-1.23, 0.64],
    [-0.85, 0.7],
    [-0.1, 0.66],
    [0.8, 0.65],
    [1.45, 0.63],
    [1.8, 0.56],
    [1.96, 0.5],
  ],
  tail: [],
  seams: [-0.8, 0.24, 0.92],
  pillars: [
    [0.2, 0.28],
    [0.93, 1.0],
  ],
  mirror: { z: -0.62, h: 1.04, x: 0.8 },
  rearPlateH: 0.74,
  cabinEndZ: 1.35,
  decals: [
    ...plates(0.74, 0.4),
    ...handles([-0.18, 0.64], 0.91),
    grilleBar,
    ...daylights,
    ...projectors({ x: [0.49, 0.57], h: 0.64, size: 0.03 }),
    // The light bar across the tailgate's dark band, joining the lamps at its ends.
    { ...tailLine({ h: 0.995, wide: 0.86, thick: 0.02 }), cells: [10, 1], liftM: 0.012 },
    reversing(0.38, 0.6),
  ],
  blocks: [
    // A lip of a spoiler: the roof drawn on a hand's width past the tailgate's glass.
    { at: [0, 1.44, 1.5], size: [1.06, 0.05, 0.16], surface: "paint", taper: [0.94, 0.4] },
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    silhouette: [
      { z: -1.93, h: 0.3, band: "bumper" },
      { z: -1.95, h: 0.33, band: "intake" },
      { z: -1.96, h: 0.47 },
      { z: -1.958, h: 0.575, band: "gap" },
      { z: -1.956, h: 0.58, band: "headDark" },
      { z: -1.948, h: 0.595, band: "headLamp" },
      { z: -1.928, h: 0.69, band: "headDark" },
      { z: -1.921, h: 0.705 },
      ...faired(
        [
          [-1.91, 0.72],
          [-1.5, 0.84],
          [-1.23, 0.89],
          [-0.95, 0.975],
        ],
        [[-1.91, undefined]],
      ),
      { z: -0.95, h: 0.975, band: "cowl" },
      ...faired(
        [
          [-0.88, 1.0],
          [-0.5, 1.24],
          [-0.115, 1.45],
          [0.35, 1.5],
          [1.0, 1.49],
          [1.42, 1.45],
          [1.62, 1.3],
          [1.78, 1.08],
        ],
        [
          [-0.88, "screen"],
          [-0.115, undefined],
          [1.42, "rearGlass"],
          [1.578, "rearGlassLamp"],
        ],
      ),
      { z: 1.78, h: 1.08, band: "tailBar" },
      { z: 1.83, h: 0.9 },
      { z: 1.9, h: 0.7, band: "gap" },
      { z: 1.905, h: 0.69 },
      { z: 1.955, h: 0.47, band: "bumper" },
      { z: 1.96, h: 0.29 },
    ],
    crown: [
      [-1.96, 0.02],
      [-1.23, 0.0],
      [-0.8, 0.02],
      [-0.4, 0.06],
      [0.5, 0.075],
      [1.4, 0.065],
      [1.96, 0.03],
    ],
    shelf: [
      [-1.96, 0],
      [-1.23, 0.02],
      [-0.6, 0.035],
      [0.5, 0.045],
      [1.3, 0.06],
      [1.96, 0.04],
    ],
    halfWidth: [
      [-1.96, 0.7],
      [-1.75, 0.8],
      [-1.23, 0.86],
      [-0.6, 0.84],
      [0.4, 0.845],
      [1.23, 0.86],
      [1.75, 0.845],
      [1.96, 0.77],
    ],
    hoodSeamZ: [-1.84, -1.0],
    sill: [
      [-1.96, 0.29],
      [-1.6, 0.21],
      [0, 0.2],
      [1.6, 0.22],
      [1.96, 0.27],
    ],
    exhausts: { x: [-0.42], h: 0.32, z: 1.975, radius: 0.034, open: true },
  },
};

export const ljus: CarSpec = {
  id: LJUS.id,
  name: LJUS.name,
  ride: LJUS.ride,
  paint: "car-paint-teal",
  paints: [
    paint("car-paint-teal"),
    paint("car-paint-white"),
    paint("car-paint-coral"),
    paint("car-paint-lemon"),
    paint("car-paint-silver", "metallic"),
    paint("car-paint-graphite", "metallic"),
    paint("car-paint-sky", "pearl", { flip: "car-paint-powder-blue" }),
  ],
  body: bodyOf(shape),
  /** A small hatch's cabin made warm: two dials, a round wheel, a short lever, sports seats with Västan's blue band across their shoulders, a pale headliner. */
  interior: {
    gauges: "analogue",
    wheel: "round",
    shifter: "lever",
    seats: "sport",
    screen: true,
    seatBand: "car-cabin-vastan",
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-insert", headliner: "car-cabin-headliner", accent: "car-cabin-vastan", glow: "car-cabin-glow-white" },
  },
  wheel: { radiusM: LJUS.wheelRadiusM, widthM: 0.195, rimShare: 0.68, spokes: 5, twinSpokes: false, style: "blade" },
  shadowHalf: [0.86, 1.98],
};
