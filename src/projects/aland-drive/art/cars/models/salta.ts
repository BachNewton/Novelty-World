import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const SALTA = driven("salta");
const { sill, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Västan's face as it was first drawn, the one Pil takes up: one band the width of the nose, square lamps at its outer
 * ends and the grille between them, framed dark, with a blade across the grille, here in chrome. At the tail, the lamps
 * already stand up the sides of the rear window and turn in across the tailgate under it.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  /** Chrome bumpers at both ends. */
  chrome: [{ surface: "rim", from: sill, to: ALL }],
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

const face: Decal[] = [
  // The blade across the grille, in chrome.
  { on: "front", at: [0, 0.548], size: [0.96, 0.016], surface: "rim", cells: [8, 1], liftM: 0.014 },
  // A dark mullion between each headlamp and its indicator at the band's outer end.
  { on: "front", at: [0.715, 0.548], size: [0.012, 0.13], surface: "trim", mirror: true, cells: [1, 2], liftM: 0.012, fine: true },
  // Amber indicators in the bumper's corners.
  { on: "front", at: [0.66, 0.37], size: [0.12, 0.04], surface: "lensAmber", mirror: true, cells: [3, 1], liftM: 0.014 },
];

/**
 * An old Nordic estate, square-cut: a flat bonnet and an upright screen, a tall glasshouse on thin pillars, a long flat
 * roof under rails to a near-vertical tailgate, chrome bumpers and steel wheels with caps, a rubbing strip along its doors.
 */
const shape: Shape = {
  trackM: SALTA.trackM,
  axleZ: SALTA.axleZ,
  wheelRadiusM: SALTA.wheelRadiusM,
  tyreWidthM: 0.185,
  noseZ: -2.375,
  tailZ: 2.375,
  halfWidth: 0.86,
  sillH: 0.2,
  flareM: 0.015,
  archClearM: 0.05,
  cornerPullM: [0.07, 0.06],
  grilleH: 0.45,
  lampH: [0.475, 0.62],
  hoodLipH: 0.66,
  hoodH: 0.8,
  cowl: [-0.93, 0.86],
  header: [-0.33, 1.38],
  roof: [0.3, 1.44],
  roofEnd: [2.06, 1.42],
  shoulder: [
    [-2.375, 0.6],
    [-1.9, 0.74],
    [-1.36, 0.79],
    [-0.95, 0.81],
    [0.4, 0.84],
    [1.36, 0.84],
    [2.375, 0.84],
  ],
  belt: [
    [-2.375, 0.66],
    [-1.9, 0.8],
    [-1.36, 0.85],
    [-0.95, 0.87],
    [0.4, 0.9],
    [1.36, 0.9],
    [2.375, 0.9],
  ],
  windowTop: [
    [-0.9, 0.9],
    [-0.6, 1.06],
    [-0.3, 1.3],
    [0.3, 1.35],
    [1.85, 1.35],
  ],
  windowZ: [-0.9, 1.85],
  railWidth: [
    [-2.375, 0.5],
    [-1.36, 0.66],
    [-0.95, 0.72],
    [-0.3, 0.7],
    [1.0, 0.7],
    [2.0, 0.7],
    [2.26, 0.66],
    [2.375, 0.6],
  ],
  tail: [],
  seams: [-0.85, 0.16, 1.06],
  pillars: [
    [0.12, 0.2],
    [1.02, 1.1],
  ],
  mirror: { z: -0.72, h: 0.98, x: 0.82 },
  rearPlateH: 0.75,
  cabinEndZ: 1.9,
  decals: [
    ...plates(0.75, 0.36),
    ...handles([-0.3, 0.72], 0.78),
    ...face,
    // The black rubbing strip along the doors.
    { on: "side", at: [0.05, 0.6], size: [1.86, 0.03], surface: "trim", mirror: true, cells: [8, 1], liftM: 0.01, fine: true },
    reversing(0.4, 0.84),
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    silhouette: [
      { z: -2.377, h: 0.3, band: "chrome" },
      { z: -2.375, h: 0.42 },
      { z: -2.373, h: 0.45, band: "gap" },
      { z: -2.371, h: 0.46, band: "headDark" },
      { z: -2.369, h: 0.475, band: "headLamp" },
      { z: -2.36, h: 0.62, band: "headDark" },
      { z: -2.355, h: 0.64 },
      ...faired(
        [
          [-2.35, 0.66],
          [-1.9, 0.75],
          [-1.36, 0.8],
          [-1.0, 0.83],
        ],
        [[-2.35, undefined]],
      ),
      { z: -1.0, h: 0.83, band: "cowl" },
      ...faired(
        [
          [-0.93, 0.86],
          [-0.6, 1.1],
          [-0.33, 1.38],
          [0.3, 1.44],
          [1.5, 1.44],
          [2.06, 1.42],
          [2.2, 1.3],
          [2.26, 1.1],
        ],
        [
          [-0.93, "screen"],
          [-0.33, undefined],
          [2.06, "rearGlass"],
          [2.14, "rearGlassLamp"],
        ],
      ),
      { z: 2.26, h: 1.1, band: "tailBar" },
      { z: 2.3, h: 0.92 },
      { z: 2.33, h: 0.82 },
      { z: 2.355, h: 0.56, band: "gap" },
      { z: 2.36, h: 0.55, band: "chrome" },
      { z: 2.373, h: 0.43 },
      { z: 2.375, h: 0.3 },
    ],
    crown: [
      [-2.375, 0.01],
      [-1.36, 0.01],
      [-0.9, 0.02],
      [-0.3, 0.04],
      [1.8, 0.04],
      [2.375, 0.02],
    ],
    shelf: [
      [-2.375, 0],
      [-0.9, 0.02],
      [0, 0.03],
      [2.375, 0.03],
    ],
    halfWidth: [
      [-2.375, 0.8],
      [-2.2, 0.85],
      [-1.36, 0.86],
      [0, 0.86],
      [1.36, 0.86],
      [2.2, 0.86],
      [2.375, 0.81],
    ],
    hoodSeamZ: [-2.25, -1.05],
    sill: [
      [-2.375, 0.25],
      [-2.0, 0.21],
      [0, 0.2],
      [2.0, 0.21],
      [2.375, 0.25],
    ],
    roofBars: { from: -0.1, to: 1.9, x: 0.52, rise: 0.05 },
    exhausts: { x: [0.45], h: 0.27, z: 2.385, radius: 0.03, open: true },
  },
};

export const salta: CarSpec = {
  id: SALTA.id,
  name: SALTA.name,
  ride: SALTA.ride,
  paint: "car-paint-sky",
  paints: [
    paint("car-paint-sky"),
    paint("car-paint-cream"),
    paint("car-paint-saddle"),
    paint("car-paint-avocado"),
    paint("car-paint-mint"),
    paint("car-paint-oxblood"),
  ],
  body: bodyOf(shape),
  /** An old estate's cockpit: chrome-ringed ivory dials and a row of small ones, a wood strip, a thin-rimmed wheel, no screen, tan cloth. */
  interior: {
    gauges: "classic",
    wheel: "classic",
    shifter: "lever",
    seats: "comfort",
    screen: false,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim-tan", insert: "car-cabin-wood", headliner: "car-cabin-headliner", accent: "car-cabin-metal", glow: "car-cabin-glow-amber" },
  },
  wheel: { radiusM: SALTA.wheelRadiusM, widthM: 0.185, rimShare: 0.62, spokes: 8, twinSpokes: false, style: "steel" },
  shadowHalf: [0.86, 2.375],
};
