import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, sideIntake, splitter, tailLine } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const BLIXT = driven("blixt");
const { sill, sillTop, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Norrsken's signature: three short streaks of light stacked in each dark lamp, each a little further out than the one
 * under it, and three lines of light stacked across the tail, each shorter than the one above. A closed, painted nose
 * with only a low slot of intake: an electric car has little to cool.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** The one low slot of intake, the width of the nose between its corners. */
  mouth: [{ surface: "grille", from: belt, to: ALL }],
  /** The two dark lamps at the nose's outer corners, the painted nose between them. */
  headDark: [{ surface: "trim", from: belt, to: rail }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  /** The aero tunnels: a dark channel each side between the hips and the painted spine of the fastback. */
  deck: [{ surface: "grille", from: windowBase, to: rail }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** One headlamp's three streaks, each 3.5 cm further out than the one under it. */
const streaks: Decal[] = [0, 1, 2].map((step) => ({
  on: "front",
  at: [0.56 + step * 0.045, 0.364 + step * 0.026],
  size: [0.2, 0.014],
  surface: "lensHead",
  mirror: true,
  cells: [4, 1],
  liftM: 0.012,
}));

/** An electric hypercar, very low and wide: its cabin a teardrop pushed forward, a fastback spine between two aero tunnels behind it. */
const shape: Shape = {
  trackM: BLIXT.trackM,
  axleZ: BLIXT.axleZ,
  wheelRadiusM: BLIXT.wheelRadiusM,
  tyreWidthM: 0.31,
  noseZ: -2.29,
  tailZ: 2.29,
  halfWidth: 1.04,
  sillH: 0.1,
  flareM: 0.035,
  archClearM: 0.035,
  grilleH: 0.31,
  lampH: [0.37, 0.44],
  hoodLipH: 0.455,
  hoodH: 0.64,
  cowl: [-0.9, 0.735],
  header: [-0.22, 1.11],
  roof: [0.08, 1.16],
  roofEnd: [0.45, 1.13],
  shoulder: [
    [-2.29, 0.34],
    [-1.9, 0.56],
    [-1.36, 0.76],
    [-0.8, 0.6],
    [0.2, 0.62],
    [0.9, 0.74],
    [1.38, 0.8],
    [2.29, 0.76],
  ],
  belt: [
    [-2.29, 0.4],
    [-1.9, 0.6],
    [-1.36, 0.79],
    [-0.9, 0.73],
    [-0.3, 0.71],
    [0.4, 0.76],
    [1.38, 0.84],
    [2.29, 0.83],
  ],
  windowTop: [
    [-0.87, 0.74],
    [-0.6, 0.815],
    [-0.25, 1.0],
    [0.1, 1.06],
    [0.4, 1.03],
    [0.62, 0.97],
    [0.8, 0.88],
  ],
  windowZ: [-0.87, 0.8],
  railWidth: [
    [-2.29, 0.44],
    [-1.36, 0.84],
    [-0.9, 0.74],
    [-0.3, 0.58],
    [0.2, 0.55],
    [0.8, 0.52],
    [1.38, 0.48],
    [2.29, 0.58],
  ],
  tail: [],
  seams: [-0.76, 0.42],
  pillars: [],
  mirror: { z: -0.52, h: 0.85, x: 0.82 },
  rearPlateH: 0.61,
  rearSeats: false,
  cabinEndZ: 0.75,
  decals: [
    ...plates(0.61, 0.275, { recessed: true }),
    ...handles([0.05], 0.69),
    ...streaks,
    tailLine({ h: 0.81, wide: 1.6, thick: 0.016 }),
    tailLine({ h: 0.778, wide: 1.44, thick: 0.016 }),
    tailLine({ h: 0.746, wide: 1.28, thick: 0.016 }),
    reversing(0.42, 0.53),
    // The hood's duct: air in at the nose's slot and out here, over the car.
    { on: "top", at: [0, -1.9], size: [0.62, 0.13], surface: "grille", cells: [6, 1], liftM: 0.012 },
    // The air from the front arches out behind them, and into the batteries' cooling ahead of the rear wheels.
    sideIntake({ z: -0.83, h: 0.5, long: 0.1, tall: 0.26 }),
    sideIntake({ z: 0.75, h: 0.45, long: 0.34, tall: 0.3 }),
  ],
  blocks: [
    // The battery's intake: a lip over it, a wall at each end and a blade of paint across, standing out of the scooped flank.
    { at: [0.935, 0.615, 0.75], size: [0.07, 0.018, 0.4], surface: "paint", mirror: true, taper: [1, 0.6], fine: true },
    { at: [0.915, 0.45, 0.575], size: [0.06, 0.3, 0.016], surface: "paint", mirror: true, fine: true },
    { at: [0.905, 0.45, 0.925], size: [0.06, 0.3, 0.016], surface: "paint", mirror: true, fine: true },
    { at: [0.94, 0.46, 0.75], size: [0.05, 0.026, 0.36], surface: "paint", mirror: true, taper: [1, 0.7], fine: true },
    splitter({ z: -2.32, h: 0.23, halfWidth: 0.6, long: 0.2 }),
    ...diffuser({ z: 1.95, tailZ: 2.27, h: 0.25, x: [0, 0.26, 0.52] }),
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.295, h: 0.22, band: "bumper" },
      { z: -2.29, h: 0.24, band: "mouth" },
      { z: -2.29, h: 0.31 },
      { z: -2.285, h: 0.34, band: "headDark" },
      { z: -2.27, h: 0.445 },
      // The hood, then the screen, roof, rear glass and the spine between the tunnels, each as one fair line.
      ...faired(
        [
          [-2.255, 0.455],
          [-1.95, 0.52],
          [-1.45, 0.6],
          [-0.95, 0.715],
        ],
        [[-2.255, undefined]],
      ),
      { z: -0.95, h: 0.715, band: "cowl" },
      ...faired(
        [
          [-0.9, 0.735],
          [-0.55, 0.93],
          [-0.22, 1.1],
          [0.08, 1.16],
          [0.45, 1.13],
          [0.8, 1.03],
          [1.3, 0.94],
          [1.8, 0.875],
          [2.17, 0.875],
        ],
        [
          [-0.9, "screen"],
          [-0.22, undefined],
          [0.45, "rearGlass"],
          [0.8, "deck"],
        ],
      ),
      { z: 2.17, h: 0.875, band: "gap" },
      { z: 2.185, h: 0.87, band: "tailDark" },
      { z: 2.215, h: 0.72 },
      { z: 2.25, h: 0.46, band: "diffuser" },
      { z: 2.29, h: 0.22 },
    ],
    crown: [
      [-2.29, 0.02],
      [-1.9, -0.05],
      [-1.36, -0.12],
      [-0.95, -0.04],
      [-0.7, 0.04],
      [0.2, 0.05],
      [0.8, 0.04],
      [1.38, 0.02],
      [2.0, 0.02],
      [2.29, 0.01],
    ],
    shelf: [
      [-2.29, 0],
      [-1.36, 0.03],
      [-0.9, 0.12],
      [-0.3, 0.3],
      [0.4, 0.33],
      [1.0, 0.28],
      [1.6, 0.24],
      [2.1, 0.2],
      [2.29, 0.1],
    ],
    halfWidth: [
      [-2.29, 0.84],
      [-2.0, 0.97],
      [-1.36, 1.03],
      [-0.6, 0.98],
      [0.3, 1.0],
      [1.38, 1.04],
      [2.0, 1.01],
      [2.29, 0.92],
    ],
    hoodSeamZ: [-2.1, -1.02],
    cleanEnds: true,
    scoop: [
      [-0.9, 0],
      [-0.5, 0.03],
      [0.2, 0.07],
      [0.7, 0.09],
      [0.95, 0],
    ],
  },
};

export const blixt: CarSpec = {
  id: BLIXT.id,
  name: BLIXT.name,
  ride: BLIXT.ride,
  paint: "car-paint-aurora",
  paints: [
    paint("car-paint-aurora", "pearl", { flip: "car-paint-aurora-flip" }),
    paint("car-paint-polar-night", "metallic"),
    paint("car-paint-frost", "pearl", { flip: "car-paint-frost-flip" }),
    paint("car-paint-violet", "metallic"),
    paint("car-paint-volt"),
    paint("car-paint-graphite", "matte"),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: BLIXT.wheelRadiusM, widthM: 0.31, rimShare: 0.77, spokes: 7, twinSpokes: false, style: "aero" },
  shadowHalf: [1.04, 2.29],
  interior: {
    gauges: "digital",
    wheel: "yoke",
    shifter: "selector",
    seats: "bucket",
    screen: true,
    // Low in the car, as its battery floor allows: the roof's edge clears the view and the figures show over the wheel's hub.
    eye: [0, -0.04, 0],
    colours: { dash: "car-cabin-carbon", trim: "car-cabin-carbon", insert: "car-cabin-norrsken", headliner: "car-cabin-headliner-dark", accent: "car-cabin-norrsken", glow: "car-cabin-glow-aurora" },
  },
};
