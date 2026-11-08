import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, louvres, projectors, sideIntake, splitter } from "../parts";
import { bodyOf, driven, faired, handles, plates, thirdBrake, type Shape } from "../recipe";

const STRIMMA = driven("strimma");
const { sill, sillTop, belt, windowBase, rail, roofInner, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Tärna's signature, as Åska and Virvel wear it: a line of light the whole width of each end, turned down at its outer
 * ends into a short fang. Strimma's sits low on a short, rounded nose over one wide mouth, and high on its tail under
 * the ducktail's lip.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** One wide mouth, which a painted blade (a block) crosses. */
  mouth: [{ surface: "grille", from: sillTop, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  headDark: [{ surface: "trim", from: belt, to: rail }],
  headLamp: [{ surface: "lensHead", from: windowBase, to: ALL }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  /** The fastback's glass, over the engine. */
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  /** The engine cover's vents beside a painted spine, under the ducktail. */
  deck: [{ surface: "grille", from: rail, to: roofInner }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  tailBar: [{ surface: "lensTail", from: windowBase, to: ALL }],
  /** A slim vent across the tail under the lamp. */
  vent: [{ surface: "grille", from: rail, to: ALL }],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** The bracket's fang at each outer end: a lens turned down from the line, in a dark housing that frames it. */
const fangs = (on: "front" | "rear", h: number, surface: Decal["surface"]): Decal[] => [
  { on, at: [0.76, h], size: [0.055, 0.1], surface: "trim", mirror: true, cells: [2, 4], liftM: 0.008, fine: true },
  { on, at: [0.765, h - 0.005], size: [0.028, 0.085], surface, mirror: true, cells: [1, 4], liftM: 0.016 },
];

/**
 * A compact mid-engined sports car: shorter and narrower than Virvel, its cabin pushed forward over a short nose, a
 * fastback of glass falling over the flat six to a ducktail, and intakes scooped into its flanks ahead of the rear wheels.
 */
const shape: Shape = {
  trackM: STRIMMA.trackM,
  axleZ: STRIMMA.axleZ,
  wheelRadiusM: STRIMMA.wheelRadiusM,
  tyreWidthM: 0.27,
  noseZ: -2.1,
  tailZ: 2.1,
  halfWidth: 0.95,
  sillH: 0.12,
  flareM: 0.035,
  archClearM: 0.035,
  grilleH: 0.37,
  lampH: [0.42, 0.44],
  hoodLipH: 0.47,
  hoodH: 0.66,
  cowl: [-0.84, 0.76],
  header: [-0.3, 1.1],
  roof: [0.0, 1.16],
  roofEnd: [0.35, 1.12],
  shoulder: [
    [-2.1, 0.4],
    [-1.76, 0.6],
    [-1.3, 0.74],
    [-0.84, 0.66],
    [0.0, 0.69],
    [0.75, 0.78],
    [1.18, 0.81],
    [2.1, 0.79],
  ],
  belt: [
    [-2.1, 0.44],
    [-1.76, 0.64],
    [-1.3, 0.77],
    [-0.88, 0.75],
    [-0.3, 0.75],
    [0.4, 0.8],
    [1.18, 0.85],
    [2.1, 0.86],
  ],
  windowTop: [
    [-0.81, 0.79],
    [-0.55, 0.92],
    [-0.25, 1.04],
    [0.0, 1.08],
    [0.3, 1.04],
    [0.6, 0.95],
    [0.9, 0.87],
  ],
  windowZ: [-0.81, 0.9],
  railWidth: [
    [-2.1, 0.56],
    [-1.3, 0.8],
    [-0.84, 0.7],
    [-0.3, 0.57],
    [0.0, 0.55],
    [0.6, 0.6],
    [1.18, 0.74],
    [2.1, 0.8],
  ],
  tail: [],
  seams: [-0.74, 0.25],
  pillars: [[0.4, 0.47]],
  mirror: { z: -0.5, h: 0.88, x: 0.79 },
  rearPlateH: 0.56,
  rearSeats: false,
  cabinEndZ: 0.62,
  decals: [
    ...plates(0.56, 0.3),
    ...handles([0.05], 0.73),
    ...fangs("front", 0.415, "lensHead"),
    ...fangs("rear", 0.85, "lensTail"),
    ...projectors({ x: [0.52, 0.63], h: 0.43, size: 0.034 }),
    sideIntake({ z: 0.58, h: 0.52, long: 0.36, tall: 0.3 }),
    thirdBrake(1.9, 0.36),
    // The radiators' outlet in the nose's middle.
    ...louvres({ x: 0, z: -1.9, long: 0.24, wide: 0.42, count: 3 }),
  ],
  blocks: [
    // A strake of the body's colour standing in each intake's mouth, its lip over it and its wall at the back, standing
    // out of the scooped flank, so it reads as a duct and not a hole.
    { at: [0.905, 0.52, 0.48], size: [0.05, 0.28, 0.035], surface: "paint", mirror: true, taper: [0.7, 0.9], fine: true },
    { at: [0.9, 0.685, 0.58], size: [0.07, 0.018, 0.4], surface: "paint", mirror: true, taper: [1, 0.6], fine: true },
    { at: [0.875, 0.52, 0.765], size: [0.06, 0.3, 0.016], surface: "paint", mirror: true, fine: true },
    // A painted blade across the mouth.
    { at: [0, 0.31, -2.08], size: [0.9, 0.025, 0.05], surface: "paint" },
    splitter({ z: -2.14, h: 0.25, halfWidth: 0.52, long: 0.15 }),
    // The diffuser's strakes stand in the dark band under the tail, not below it.
    ...diffuser({ z: 1.82, tailZ: 2.08, h: 0.3, x: [0.22, 0.44] }),
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.105, h: 0.24, band: "bumper" },
      { z: -2.1, h: 0.26, band: "mouth" },
      { z: -2.095, h: 0.37, band: "gap" },
      { z: -2.09, h: 0.38 },
      { z: -2.085, h: 0.405, band: "headDark" },
      // The line of light is a lens set back in its housing, deep enough to read as a lamp and not a stripe.
      { z: -2.068, h: 0.412, band: "headLamp" },
      { z: -2.066, h: 0.44, band: "headDark" },
      // The hood, then the screen, roof, fastback and ducktail, each as one fair line.
      ...faired(
        [
          [-2.05, 0.455],
          [-1.76, 0.55],
          [-1.3, 0.64],
          [-0.9, 0.735],
        ],
        [[-2.05, undefined]],
      ),
      { z: -0.9, h: 0.735, band: "cowl" },
      ...faired(
        [
          [-0.84, 0.76],
          [-0.55, 0.955],
          [-0.25, 1.11],
          [0.05, 1.16],
          [0.4, 1.12],
          [0.85, 1.02],
          [1.35, 0.925],
          [1.72, 0.878],
          [2.0, 0.925],
        ],
        [
          [-0.84, "screen"],
          [-0.3, undefined],
          [0.4, "rearGlass"],
          [1.3, "deck"],
          [1.7, undefined],
        ],
      ),
      { z: 2.0, h: 0.925, band: "gap" },
      { z: 2.01, h: 0.888, band: "tailDark" },
      { z: 2.022, h: 0.865, band: "tailBar" },
      { z: 2.036, h: 0.835, band: "tailDark" },
      // A slim vent the width of the tail under the lamp, the engine's heat out through it.
      { z: 2.048, h: 0.812, band: "vent" },
      { z: 2.056, h: 0.775 },
      { z: 2.085, h: 0.46, band: "diffuser" },
      { z: 2.097, h: 0.36 },
      { z: 2.1, h: 0.22 },
    ],
    crown: [
      [-2.1, 0.02],
      [-1.76, -0.05],
      [-1.3, -0.14],
      [-0.95, -0.05],
      [-0.7, 0.04],
      [0.2, 0.05],
      [0.8, 0.03],
      [1.18, -0.09],
      [1.76, -0.06],
      [2.1, 0.01],
    ],
    shelf: [
      [-2.1, 0],
      [-1.3, 0.03],
      [-0.84, 0.1],
      [-0.3, 0.26],
      [0.35, 0.28],
      [0.95, 0.17],
      [1.6, 0.07],
      [2.1, 0.02],
    ],
    halfWidth: [
      [-2.1, 0.74],
      [-1.82, 0.88],
      [-1.3, 0.94],
      [-0.6, 0.9],
      [0.3, 0.92],
      [1.18, 0.95],
      [1.76, 0.92],
      [2.1, 0.8],
    ],
    cornerPullM: [0.2, 0.18],
    hoodSeamZ: [-1.9, -0.92],
    cleanEnds: true,
    scoop: [
      [-0.5, 0],
      [0.0, 0.02],
      [0.4, 0.05],
      [0.7, 0.06],
      [0.9, 0.02],
      [1.0, 0],
    ],
    exhausts: { x: [-0.11, 0.11], h: 0.4, z: 2.07, radius: 0.045 },
  },
};

export const strimma: CarSpec = {
  id: STRIMMA.id,
  name: STRIMMA.name,
  ride: STRIMMA.ride,
  paint: "car-paint-strimma",
  paints: [
    paint("car-paint-strimma", "metallic"),
    paint("car-paint-signal-red"),
    paint("car-paint-lemon"),
    paint("car-paint-white"),
    paint("car-paint-aska", "metallic"),
    paint("car-paint-silver", "metallic"),
    paint("car-paint-graphite", "matte"),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: STRIMMA.wheelRadiusM, widthM: 0.27, rimShare: 0.74, spokes: 5, twinSpokes: false, style: "blade" },
  shadowHalf: [0.95, 2.15],
  /** Tärna's sporting cabin, the analogue way: one big rev counter front and centre, a flat-bottomed wheel, buckets, no screen. */
  interior: {
    gauges: "tacho",
    wheel: "flat",
    seats: "bucket",
    screen: false,
    colours: { dash: "car-cabin-carbon", trim: "car-cabin-carbon", insert: "car-cabin-tarna", headliner: "car-cabin-headliner-dark", accent: "car-cabin-tarna", glow: "car-cabin-glow-ice" },
    turnsToLock: 1.1,
    // A seat set low, so the roof over a low car reads as a band over the screen and not a slab.
    eye: [0, -0.05, 0],
  },
};
