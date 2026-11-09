import { ROWS, type Band, type Block, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { tailLine } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, thirdBrake, type Shape } from "../recipe";

const MYR = driven("myr");
const { sill, sillTop, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Norrsken's signature at a pickup's size: a sealed, painted nose with one low slot of intake, a dark lamp at each
 * corner with three stepped streaks of light in it, and one line of light the whole width of the nose over them; at
 * the tail, three lines of light stacked across a dark band on the tailgate, each shorter than the one above.
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
  /** The tailgate's dark band, the width of the tail, that carries the three lines of light. */
  tailDark: [{ surface: "trim", from: sillTop, to: ALL }],
};

/** One headlamp's three streaks, each a little further out than the one under it. */
const streaks: Decal[] = [0, 1, 2].map((step) => ({
  on: "front",
  at: [0.66 + step * 0.035, 0.875 + step * 0.04],
  size: [0.17, 0.018],
  surface: "lensHead",
  mirror: true,
  cells: [4, 1],
  liftM: 0.012,
}));

/** Norrsken's three streaks once more, small, on each flank of the bed: each shorter and further back than the one under it. */
const flankMark: Decal[] = [0, 1, 2].map((step) => ({
  on: "side",
  at: [2.12 + step * 0.05, 1.0 + step * 0.045],
  size: [0.56 - step * 0.1, 0.022],
  surface: "stripe",
  mirror: true,
  cells: [4, 1],
  liftM: 0.012,
  fine: true,
}));

const blocks: Block[] = [
  // A running board between the wheels, under the sill, for a tall cab.
  { at: [0.95, 0.395, 0.02], size: [0.16, 0.03, 2.16], surface: "cladding", mirror: true },
  // Tow hooks in the paint's accent colour, either side of the skid plate.
  { at: [0.3, 0.6, -2.715], size: [0.05, 0.07, 0.07], surface: "stripe", mirror: true, fine: true },
];

/** An electric pickup: a crew cab on a long, slab-sided body, a short sealed nose, and a bed behind. */
const shape: Shape = {
  trackM: MYR.trackM,
  axleZ: MYR.axleZ,
  wheelRadiusM: MYR.wheelRadiusM,
  tyreWidthM: 0.29,
  noseZ: -2.71,
  tailZ: 2.71,
  halfWidth: 1.0,
  sillH: 0.42,
  rearSillH: 0.46,
  flareM: 0.05,
  archClearM: 0.06,
  grilleH: 0.76,
  lampH: [0.84, 1.0],
  hoodLipH: 1.05,
  hoodH: 1.16,
  cowl: [-1.0, 1.23],
  header: [-0.25, 1.8],
  roof: [0.2, 1.87],
  roofEnd: [0.84, 1.85],
  shoulder: [
    [-2.71, 0.9],
    [-2.3, 1.0],
    [-1.74, 1.06],
    [0, 1.1],
    [1.74, 1.14],
    [2.71, 1.14],
  ],
  belt: [
    [-2.71, 0.98],
    [-2.3, 1.08],
    [-1.74, 1.13],
    [-1.0, 1.2],
    [0, 1.23],
    [0.9, 1.26],
    [2.71, 1.27],
  ],
  windowTop: [
    [-0.98, 1.27],
    [-0.6, 1.52],
    [-0.25, 1.72],
    [0.2, 1.77],
    [0.76, 1.75],
    [0.8, 1.7],
  ],
  windowZ: [-0.98, 0.8],
  railWidth: [
    [-2.71, 0.6],
    [-1.74, 0.8],
    [-1.0, 0.86],
    [-0.25, 0.8],
    [0.84, 0.8],
    [0.9, 0.88],
    [2.71, 0.9],
  ],
  tail: [],
  seams: [-0.96, 0.02, 0.82],
  pillars: [[-0.03, 0.07]],
  mirror: { z: -0.8, h: 1.34, x: 1.0 },
  rearPlateH: 0.94,
  decals: [
    ...plates(0.94, 0.71, { recessed: true }),
    ...handles([-0.42, 0.42], 1.14),
    ...streaks,
    // The line of light the width of the nose, over the lamps.
    { on: "front", at: [0, 0.975], size: [1.5, 0.016], surface: "lensHead", cells: [16, 1], liftM: 0.012 },
    { ...tailLine({ h: 1.245, wide: 1.72, thick: 0.022 }), cells: [8, 1] },
    { ...tailLine({ h: 1.19, wide: 1.48, thick: 0.022 }), cells: [8, 1] },
    { ...tailLine({ h: 1.135, wide: 1.24, thick: 0.022 }), cells: [8, 1] },
    reversing(0.62, 0.74),
    thirdBrake(0.74, 0.6),
    ...flankMark,
  ],
  blocks,
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.71, h: 0.52, band: "bumper" },
      { z: -2.707, h: 0.63 },
      { z: -2.705, h: 0.67, band: "mouth" },
      { z: -2.7, h: 0.75 },
      { z: -2.695, h: 0.84, band: "headDark" },
      { z: -2.688, h: 1.0 },
      // The hood, then the screen and roof, each as one fair line.
      ...faired(
        [
          [-2.675, 1.05],
          [-2.4, 1.11],
          [-1.74, 1.16],
          [-1.08, 1.2],
        ],
        [[-2.675, undefined]],
      ),
      { z: -1.08, h: 1.2, band: "cowl" },
      ...faired(
        [
          [-1.0, 1.23],
          [-0.6, 1.55],
          [-0.25, 1.8],
          [0.2, 1.87],
          [0.84, 1.85],
        ],
        [
          [-1.0, "screen"],
          [-0.25, undefined],
        ],
      ),
      { z: 0.84, h: 1.85, band: "rearGlass" },
      { z: 0.856, h: 1.52 },
      { z: 0.87, h: 1.36 },
      { z: 0.89, h: 1.3, bed: true },
      { z: 2.58, h: 1.3 },
      { z: 2.62, h: 1.28, band: "tailDark" },
      { z: 2.64, h: 1.08 },
      { z: 2.68, h: 0.8, band: "bumper" },
      { z: 2.71, h: 0.56 },
    ],
    crown: [
      [-2.71, 0.0],
      [-2.3, -0.025],
      [-1.3, -0.03],
      [-1.0, 0.03],
      [-0.4, 0.06],
      [0.84, 0.06],
      [2.71, 0.02],
    ],
    shelf: [
      [-2.71, 0],
      [-1.0, 0.02],
      [0.84, 0.03],
      [2.71, 0],
    ],
    scoop: [
      [-1.3, 0],
      [-0.8, 0.025],
      [0.6, 0.025],
      [1.2, 0],
    ],
    halfWidth: [
      [-2.71, 0.88],
      [-2.5, 0.98],
      [-1.74, 1.01],
      [-1.0, 0.99],
      [0, 0.985],
      [1.0, 0.99],
      [1.74, 1.01],
      [2.5, 1.0],
      [2.71, 0.96],
    ],
    // The frunk's lid: shut lines along the hood's edges, short of the nose where the hood rolls over into it.
    hoodSeamZ: [-2.45, -1.15],
    cleanEnds: true,
    archLipM: 0.07,
    bedFloorH: 0.9,
    bedSurface: "trim",
    roofBars: { from: -0.1, to: 0.7, x: 0.62, rise: 0.05 },
    // A crew cab: the rear bench set forward of where the recipe would put it, so its back stays inside the cab's.
    cabin: { dashZ: -0.98, dashH: 1.18, floorH: 0.56, seatZ: -0.06, rearSeatZ: 0.66, endZ: 0.82, seatX: MYR.trackM * 0.23, seatSurface: "seat" },
  },
};

export const myr: CarSpec = {
  id: MYR.id,
  name: MYR.name,
  ride: MYR.ride,
  paint: "car-paint-frost",
  paints: [
    paint("car-paint-frost", "pearl", { flip: "car-paint-frost-flip", stripe: "car-paint-volt" }),
    paint("car-paint-polar-night", "metallic", { stripe: "car-paint-aurora" }),
    paint("car-paint-aurora", "pearl", { flip: "car-paint-aurora-flip", stripe: "car-paint-frost" }),
    paint("car-paint-sand", "matte", { stripe: "car-paint-polar-night" }),
    paint("car-paint-olive", "matte", { stripe: "car-paint-volt" }),
    paint("car-paint-volt", "solid", { stripe: "car-paint-polar-night" }),
    paint("car-paint-graphite", "matte", { stripe: "car-paint-aurora" }),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: MYR.wheelRadiusM, widthM: 0.29, rimShare: 0.58, spokes: 6, twinSpokes: false, style: "aero" },
  shadowHalf: [1.0, 2.71],
  /** Norrsken's cabin, tall: a digital cluster, a big centre screen, a flat-bottomed wheel, carbon and Norrsken green. */
  interior: {
    gauges: "digital",
    wheel: "flat",
    shifter: "selector",
    seats: "comfort",
    screen: true,
    colours: { dash: "car-cabin-carbon", trim: "car-cabin-carbon", insert: "car-cabin-norrsken", headliner: "car-cabin-headliner-dark", accent: "car-cabin-norrsken", glow: "car-cabin-glow-aurora" },
  },
};
