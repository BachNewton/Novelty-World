import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { projectors, tailLine } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const FJARD = driven("fjard");
const { sill, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Västan's face as Pil set it down, on the maker's fast estate: one dark band the width of the nose, slim lamps at its
 * outer ends, the grille between them crossed by a blade of the body's colour, and at the tail the lamps standing up
 * the sides of the rear window and turning in across the tailgate under it, as on every Västan.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
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
  rearGlassLamp: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "glass", from: rail, to: ALL },
  ],
  tailBar: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "trim", from: rail, to: ALL },
  ],
};

const grilleBar: Decal = { on: "front", at: [0, 0.618], size: [1.0, 0.016], surface: "paint", cells: [8, 1], liftM: 0.014 };

const daylights: Decal[] = [
  { on: "front", at: [0.66, 0.652], size: [0.2, 0.014], surface: "lensHead", mirror: true, cells: [4, 1], liftM: 0.016 },
  { on: "front", at: [0.752, 0.634], size: [0.018, 0.045], surface: "lensHead", mirror: true, cells: [1, 2], liftM: 0.016 },
];

/**
 * A long, low Nordic estate with a turbo five and four-wheel drive: a roof that runs flat right to the back under its
 * bars, a near-upright tailgate between tall lamps, and cladding round the arches and along the sills for the gravel.
 */
const shape: Shape = {
  trackM: FJARD.trackM,
  axleZ: FJARD.axleZ,
  wheelRadiusM: FJARD.wheelRadiusM,
  tyreWidthM: 0.215,
  noseZ: -2.38,
  tailZ: 2.38,
  halfWidth: 0.91,
  sillH: 0.2,
  flareM: 0.04,
  archClearM: 0.05,
  cornerPullM: [0.14, 0.1],
  grilleH: 0.47,
  lampH: [0.575, 0.665],
  hoodLipH: 0.695,
  hoodH: 0.86,
  cowl: [-0.82, 0.95],
  header: [-0.065, 1.38],
  roof: [0.5, 1.44],
  roofEnd: [1.92, 1.4],
  shoulder: [
    [-2.38, 0.615],
    [-1.95, 0.785],
    [-1.42, 0.845],
    [-0.82, 0.885],
    [0.4, 0.915],
    [1.38, 0.945],
    [2.38, 0.935],
  ],
  belt: [
    [-2.38, 0.68],
    [-1.95, 0.85],
    [-1.42, 0.91],
    [-0.82, 0.95],
    [0.4, 0.98],
    [1.38, 1.01],
    [2.38, 1.0],
  ],
  windowTop: [
    [-0.79, 0.99],
    [-0.45, 1.16],
    [-0.05, 1.3],
    [0.5, 1.345],
    [1.4, 1.335],
    [1.55, 1.32],
    [1.65, 1.26],
  ],
  windowZ: [-0.79, 1.65],
  railWidth: [
    [-2.38, 0.46],
    [-1.42, 0.68],
    [-0.82, 0.74],
    [-0.05, 0.69],
    [0.8, 0.68],
    [1.9, 0.66],
    [2.2, 0.6],
    [2.38, 0.52],
  ],
  tail: [],
  seams: [-0.74, 0.34, 1.16],
  pillars: [
    [0.3, 0.38],
    [1.12, 1.2],
  ],
  mirror: { z: -0.62, h: 1.03, x: 0.86 },
  rearPlateH: 0.76,
  cabinEndZ: 1.8,
  decals: [
    ...plates(0.76, 0.4),
    ...handles([-0.25, 0.75], 0.92),
    grilleBar,
    ...daylights,
    ...projectors({ x: [0.52, 0.6], h: 0.62, size: 0.034 }),
    // Fog lamps at the bumper's corners, either side of the intake.
    { on: "front", at: [0.62, 0.4], size: [0.12, 0.045], surface: "lensHead", mirror: true, cells: [3, 1], liftM: 0.012 },
    { ...tailLine({ h: 1.035, wide: 1.0, thick: 0.022 }), cells: [10, 1], liftM: 0.012 },
    reversing(0.42, 0.62),
  ],
  blocks: [
    // A lip over the tailgate, the roof drawn on past its glass.
    { at: [0, 1.39, 1.97], size: [1.1, 0.05, 0.14], surface: "paint", taper: [0.94, 0.4] },
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    archLipM: 0.04,
    silhouette: [
      { z: -2.345, h: 0.3, band: "bumper" },
      { z: -2.365, h: 0.33, band: "intake" },
      { z: -2.38, h: 0.47 },
      { z: -2.378, h: 0.555, band: "gap" },
      { z: -2.376, h: 0.56, band: "headDark" },
      { z: -2.368, h: 0.575, band: "headLamp" },
      { z: -2.345, h: 0.665, band: "headDark" },
      { z: -2.338, h: 0.68 },
      ...faired(
        [
          [-2.325, 0.695],
          [-1.9, 0.8],
          [-1.42, 0.86],
          [-0.9, 0.925],
        ],
        [[-2.325, undefined]],
      ),
      { z: -0.9, h: 0.925, band: "cowl" },
      ...faired(
        [
          [-0.82, 0.95],
          [-0.45, 1.18],
          [-0.065, 1.38],
          [0.5, 1.44],
          [1.4, 1.43],
          [1.92, 1.4],
          [2.12, 1.3],
          [2.2, 1.12],
        ],
        [
          [-0.82, "screen"],
          [-0.065, undefined],
          [1.92, "rearGlass"],
          [2.08, "rearGlassLamp"],
        ],
      ),
      { z: 2.2, h: 1.12, band: "tailBar" },
      { z: 2.25, h: 0.94 },
      { z: 2.32, h: 0.72, band: "gap" },
      { z: 2.325, h: 0.71 },
      { z: 2.375, h: 0.49, band: "bumper" },
      { z: 2.38, h: 0.3 },
    ],
    crown: [
      [-2.38, 0.02],
      [-1.42, 0.0],
      [-0.85, 0.02],
      [-0.4, 0.055],
      [0.5, 0.07],
      [1.8, 0.06],
      [2.38, 0.03],
    ],
    shelf: [
      [-2.38, 0],
      [-1.42, 0.02],
      [-0.6, 0.035],
      [0.5, 0.045],
      [1.6, 0.055],
      [2.38, 0.04],
    ],
    halfWidth: [
      [-2.38, 0.74],
      [-2.1, 0.86],
      [-1.42, 0.91],
      [-0.7, 0.89],
      [0.4, 0.895],
      [1.38, 0.91],
      [2.0, 0.9],
      [2.38, 0.8],
    ],
    hoodSeamZ: [-2.26, -0.95],
    sill: [
      [-2.38, 0.29],
      [-1.95, 0.21],
      [0, 0.2],
      [1.95, 0.22],
      [2.38, 0.27],
    ],
    roofBars: { from: 0.25, to: 1.75, x: 0.55, rise: 0.05 },
    exhausts: { x: [-0.62, 0.62], h: 0.32, z: 2.395, radius: 0.04, open: true },
  },
};

export const fjard: CarSpec = {
  id: FJARD.id,
  name: FJARD.name,
  ride: FJARD.ride,
  paint: "car-paint-navy",
  paints: [
    paint("car-paint-navy"),
    paint("car-paint-silver", "metallic"),
    paint("car-paint-graphite", "metallic"),
    paint("car-paint-glacier", "metallic"),
    paint("car-paint-bronze", "metallic"),
    paint("car-paint-white"),
    paint("car-paint-lichen", "metallic"),
  ],
  body: bodyOf(shape),
  // A family estate on gravel-wise tyres, not a stage car: its cabin stays a road car's whatever its grip class says,
  // two dials and a screen, a round wheel, seats with Västan's blue band across their shoulders, a pale headliner.
  interior: {
    gauges: "analogue",
    wheel: "round",
    shifter: "lever",
    seats: "comfort",
    screen: true,
    cage: false,
    turnsToLock: 1.5,
    seatBand: "car-cabin-vastan",
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-insert", headliner: "car-cabin-headliner", accent: "car-cabin-vastan", glow: "car-cabin-glow-white" },
  },
  wheel: { radiusM: FJARD.wheelRadiusM, widthM: 0.215, rimShare: 0.7, spokes: 5, twinSpokes: true, style: "split" },
  shadowHalf: [0.92, 2.38],
};
