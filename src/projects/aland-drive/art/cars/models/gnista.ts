import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, splitter, tailLine } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const GNISTA = driven("gnista");
const { sill, sillTop, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Norrsken's signature, as its hypercar Blixt wears it: three short streaks of light stacked in each dark lamp, each a
 * little further out than the one under it, and three lines of light stacked across the tail, each shorter than the
 * one above. A sealed, painted nose with one low slot of intake: an electric car has little to cool.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** The one low slot of intake, between the nose's corners. */
  mouth: [{ surface: "grille", from: belt, to: ALL }],
  /** The two dark lamps at the nose's outer corners, the painted nose between them. */
  headDark: [{ surface: "trim", from: belt, to: rail }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  tailDark: [{ surface: "trim", from: windowBase, to: ALL }],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** One headlamp's three streaks, each a little further out than the one under it. */
const streaks: Decal[] = [0, 1, 2].map((step) => ({
  on: "front",
  at: [0.58 + step * 0.03, 0.525 + step * 0.035],
  size: [0.13, 0.016],
  surface: "lensHead",
  mirror: true,
  cells: [2, 1],
  liftM: 0.012,
}));

/**
 * The livery: three bars stacked along each flank, each shorter and further back than the one under it, the
 * signature's streaks at the size of the car; and a stripe offset over the hood and the roof, as a race number's
 * board would sit.
 */
const livery: Decal[] = [
  { on: "side", at: [-0.02, 0.47], size: [1.72, 0.085], surface: "stripe", mirror: true, cells: [4, 1], liftM: 0.012 },
  { on: "side", at: [0.12, 0.585], size: [1.46, 0.05], surface: "stripe", mirror: true, cells: [4, 1], liftM: 0.012 },
  { on: "side", at: [0.26, 0.67], size: [1.2, 0.03], surface: "stripe", mirror: true, cells: [4, 1], liftM: 0.012 },
  { on: "top", at: [0.26, -1.36], size: [0.14, 0.92], surface: "stripe", cells: [1, 4], liftM: 0.012 },
  { on: "top", at: [0.26, 0.62], size: [0.14, 1.2], surface: "stripe", cells: [1, 4], liftM: 0.012 },
];

/** An electric rallycross car on a short three-door hatch: wide box arches over a narrow cabin, a sealed nose, a wing off the roof. */
const shape: Shape = {
  trackM: GNISTA.trackM,
  axleZ: GNISTA.axleZ,
  wheelRadiusM: GNISTA.wheelRadiusM,
  tyreWidthM: 0.245,
  noseZ: -2.06,
  tailZ: 2.06,
  halfWidth: 0.95,
  sillH: 0.17,
  flareM: 0.08,
  archClearM: 0.03,
  grilleH: 0.44,
  lampH: [0.48, 0.65],
  hoodLipH: 0.68,
  hoodH: 0.86,
  cowl: [-0.8, 0.975],
  header: [-0.1, 1.33],
  roof: [0.45, 1.38],
  roofEnd: [1.42, 1.34],
  shoulder: [
    [-2.06, 0.5],
    [-1.7, 0.74],
    [-1.3, 0.84],
    [-0.75, 0.83],
    [0.3, 0.85],
    [1.26, 0.88],
    [2.06, 0.86],
  ],
  belt: [
    [-2.06, 0.58],
    [-1.7, 0.8],
    [-1.3, 0.88],
    [-0.8, 0.93],
    [0.4, 0.95],
    [1.4, 0.99],
    [2.06, 0.97],
  ],
  windowTop: [
    [-0.76, 0.99],
    [-0.45, 1.14],
    [-0.12, 1.255],
    [0.45, 1.29],
    [1.1, 1.27],
    [1.48, 1.2],
  ],
  windowZ: [-0.76, 1.5],
  railWidth: [
    [-2.06, 0.56],
    [-1.3, 0.72],
    [-0.8, 0.75],
    [-0.1, 0.69],
    [0.45, 0.66],
    [1.42, 0.66],
    [2.06, 0.7],
  ],
  tail: [],
  seams: [-0.72, 0.34],
  pillars: [[0.34, 0.44]],
  mirror: { z: -0.6, h: 1.0, x: 0.83 },
  rearPlateH: 0.5,
  rearSeats: false,
  cabinEndZ: 1.0,
  decals: [
    ...plates(0.5, 0.39, { recessed: true }),
    ...handles([0.2], 0.86),
    ...streaks,
    { ...tailLine({ h: 0.955, wide: 1.5, thick: 0.018 }), cells: [8, 1] },
    { ...tailLine({ h: 0.925, wide: 1.32, thick: 0.018 }), cells: [8, 1] },
    { ...tailLine({ h: 0.895, wide: 1.14, thick: 0.018 }), cells: [8, 1] },
    reversing(0.5, 0.66),
    // The rain light: a race car's square fog lamp in the middle of the tail.
    { on: "rear", at: [0, 0.6], size: [0.1, 0.05], surface: "lensTail", cells: [2, 1], liftM: 0.012, fine: true },
    ...livery,
    // The roof's vent, air for a cabin with no air conditioning.
    { on: "top", at: [0, -0.02], size: [0.26, 0.12], surface: "grille", cells: [3, 1], liftM: 0.012, fine: true },
    // The hood's duct, as Blixt's: air in at the nose's slot and out here, over the car.
    { on: "top", at: [0, -1.78], size: [0.3, 0.1], surface: "grille", cells: [6, 2], liftM: 0.016, fine: true },
  ],
  blocks: [
    splitter({ z: -2.11, h: 0.26, halfWidth: 0.78, long: 0.2 }),
    ...diffuser({ z: 1.8, tailZ: 2.05, h: 0.3, x: [0, 0.3, 0.56] }),
    // A tow strap in the livery's colour, off centre in the nose's slot.
    { at: [0.3, 0.3, -2.085], size: [0.045, 0.06, 0.05], surface: "stripe", fine: true },
    // Mud flaps behind each wheel, hanging under the sills.
    { at: [0.8, 0.2, -0.9], size: [0.26, 0.26, 0.012], surface: "cladding", mirror: true, fine: true },
    { at: [0.8, 0.2, 1.67], size: [0.26, 0.26, 0.012], surface: "cladding", mirror: true, fine: true },
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.075, h: 0.26, band: "bumper" },
      { z: -2.07, h: 0.34, band: "mouth" },
      { z: -2.068, h: 0.44 },
      { z: -2.063, h: 0.48, band: "headDark" },
      { z: -2.05, h: 0.65 },
      // The hood, then the screen, roof and tailgate's glass, each as one fair line.
      ...faired(
        [
          [-2.035, 0.68],
          [-1.45, 0.835],
          [-0.86, 0.95],
        ],
        [[-2.035, undefined]],
      ),
      { z: -0.86, h: 0.95, band: "cowl" },
      ...faired(
        [
          [-0.8, 0.975],
          [-0.45, 1.17],
          [-0.1, 1.33],
          [0.45, 1.38],
          [1.0, 1.37],
          [1.42, 1.34],
          [1.66, 1.22],
          [1.86, 1.02],
        ],
        [
          [-0.8, "screen"],
          [-0.1, undefined],
          [1.42, "rearGlass"],
        ],
      ),
      { z: 1.86, h: 1.02, band: "gap" },
      { z: 1.87, h: 1.0, band: "tailDark" },
      { z: 1.95, h: 0.83 },
      { z: 2.0, h: 0.64, band: "bumper" },
      { z: 2.06, h: 0.42, band: "diffuser" },
      { z: 2.065, h: 0.27 },
    ],
    crown: [
      [-2.06, 0.0],
      [-1.6, -0.03],
      [-1.1, -0.035],
      [-0.8, -0.01],
      [-0.55, 0.05],
      [0.4, 0.06],
      [1.4, 0.06],
      [1.8, 0.03],
      [2.06, 0.02],
    ],
    shelf: [
      [-2.06, 0],
      [-1.3, 0.04],
      [-0.5, 0.06],
      [0.5, 0.08],
      [1.3, 0.11],
      [2.06, 0.06],
    ],
    halfWidth: [
      [-2.06, 0.78],
      [-1.85, 0.9],
      [-1.3, 0.95],
      [-0.85, 0.92],
      [0, 0.912],
      [0.75, 0.92],
      [1.26, 0.95],
      [1.8, 0.93],
      [2.06, 0.84],
    ],
    hoodSeamZ: [-1.95, -0.9],
    cleanEnds: true,
    archLipM: 0.06,
    wing: { z: 1.6, h: 1.42, halfWidth: 0.8, chord: 0.2, rise: 0.05, endplates: true },
  },
};

export const gnista: CarSpec = {
  id: GNISTA.id,
  name: GNISTA.name,
  ride: GNISTA.ride,
  paint: "car-paint-volt",
  paints: [
    paint("car-paint-volt", "solid", { stripe: "car-paint-polar-night" }),
    paint("car-paint-frost", "pearl", { flip: "car-paint-frost-flip", stripe: "car-paint-aurora" }),
    paint("car-paint-polar-night", "metallic", { stripe: "car-paint-volt" }),
    paint("car-paint-aurora", "pearl", { flip: "car-paint-aurora-flip", stripe: "car-paint-frost" }),
    paint("car-paint-violet", "metallic", { stripe: "car-paint-volt" }),
    paint("car-paint-graphite", "matte", { stripe: "car-paint-aurora" }),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: GNISTA.wheelRadiusM, widthM: 0.245, rimShare: 0.68, spokes: 6, twinSpokes: false, style: "aero" },
  shadowHalf: [0.99, 2.06],
  /** A rallycross cockpit: a cage, buckets, one digital race display, a small dished wheel, bare carbon with Norrsken green. */
  interior: {
    gauges: "digital",
    wheel: "rally",
    shifter: "selector",
    seats: "bucket",
    screen: false,
    cage: true,
    turnsToLock: 0.9,
    colours: { dash: "car-cabin-carbon", trim: "car-cabin-carbon", insert: "car-cabin-norrsken", headliner: "car-cabin-headliner-dark", accent: "car-cabin-norrsken", glow: "car-cabin-glow-aurora" },
  },
};
