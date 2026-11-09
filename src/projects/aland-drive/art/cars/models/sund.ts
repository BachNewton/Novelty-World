import { ROWS, type Band, type Block, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, louvres, projectors, sideIntake, splitter } from "../parts";
import { bodyOf, driven, faired, handles, plates, reflector, reversing, type Shape } from "../recipe";

const SUND = driven("sund");
const { sill, sillTop, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Tärna's signature, as Åska, Virvel and Strimma wear it: a line of light the whole width of each end, turned down at
 * its outer ends into a short fang. Sund's sits low, under a bonnet lip that reaches over it like a shark's snout, above
 * a slim mouth; on the tail it runs high under the wing.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  mouth: [{ surface: "grille", from: sillTop, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  headDark: [{ surface: "trim", from: belt, to: rail }],
  headLamp: [{ surface: "lensHead", from: windowBase, to: ALL }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  tailBar: [{ surface: "lensTail", from: windowBase, to: ALL }],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** The bracket's fang at each outer end: a lens turned down from the line, in a dark housing that frames it. */
const fangs = (on: "front" | "rear", x: number, h: number, surface: Decal["surface"]): Decal[] => [
  { on, at: [x, h], size: [0.055, 0.1], surface: "trim", mirror: true, cells: [2, 4], liftM: 0.008, fine: true },
  { on, at: [x + 0.005, h - 0.005], size: [0.028, 0.085], surface, mirror: true, cells: [1, 4], liftM: 0.016 },
];

/** The duct ahead of each rear wheel that cools its brake: a strake standing in its mouth, a lip over it, a wall at its back. */
const ducts: Block[] = [
  { at: [0.9, 0.52, 0.62], size: [0.05, 0.2, 0.035], surface: "paint", mirror: true, taper: [0.7, 0.9], fine: true },
  { at: [0.895, 0.635, 0.72], size: [0.07, 0.018, 0.34], surface: "paint", mirror: true, taper: [1, 0.6], fine: true },
  { at: [0.87, 0.52, 0.875], size: [0.06, 0.22, 0.016], surface: "paint", mirror: true, fine: true },
];

/**
 * A low front-mid-engined two-seater with a flat-plane V8: the longest bonnet in Tärna's range, the cabin pushed back
 * almost to the rear wheels, a short steep rear window over a short deck, a wing on stays, and ducts cut into the flanks
 * ahead of the rear wheels.
 */
const shape: Shape = {
  trackM: SUND.trackM,
  axleZ: SUND.axleZ,
  wheelRadiusM: SUND.wheelRadiusM,
  tyreWidthM: 0.265,
  noseZ: -2.2,
  tailZ: 2.15,
  halfWidth: 0.93,
  sillH: 0.16,
  flareM: 0.035,
  archClearM: 0.04,
  grilleH: 0.44,
  lampH: [0.497, 0.525],
  hoodLipH: 0.54,
  hoodH: 0.74,
  cowl: [-0.4, 0.86],
  header: [0.197, 1.2],
  roof: [0.45, 1.27],
  roofEnd: [0.78, 1.24],
  shoulder: [
    [-2.2, 0.44],
    [-1.85, 0.6],
    [-1.27, 0.7],
    [-0.4, 0.72],
    [0.4, 0.76],
    [1.23, 0.84],
    [2.15, 0.84],
  ],
  belt: [
    [-2.2, 0.49],
    [-1.85, 0.65],
    [-1.27, 0.76],
    [-0.4, 0.82],
    [0.4, 0.86],
    [1.23, 0.93],
    [2.15, 0.92],
  ],
  windowTop: [
    [-0.37, 0.86],
    [-0.1, 1.0],
    [0.17, 1.14],
    [0.45, 1.2],
    [0.7, 1.17],
    [0.83, 1.1],
  ],
  windowZ: [-0.37, 0.83],
  railWidth: [
    [-2.2, 0.46],
    [-1.27, 0.7],
    [-0.4, 0.72],
    [0.2, 0.58],
    [0.6, 0.56],
    [1.23, 0.72],
    [2.15, 0.66],
  ],
  tail: [],
  seams: [-0.34, 0.66],
  pillars: [],
  mirror: { z: -0.2, h: 0.93, x: 0.82 },
  rearPlateH: 0.68,
  rearSeats: false,
  cabinEndZ: 0.95,
  decals: [
    ...plates(0.68, 0.3),
    ...handles([0.52], 0.79),
    ...fangs("front", 0.68, 0.505, "lensHead"),
    ...fangs("rear", 0.74, 0.94, "lensTail"),
    ...projectors({ x: [0.5, 0.6], h: 0.511, size: 0.024 }),
    reversing(0.36, 0.8),
    reflector(0.62, 0.52),
    { ...sideIntake({ z: 0.72, h: 0.52, long: 0.3, tall: 0.22 }), liftM: 0.016 },
    // The V8's heat out through the bonnet's middle.
    ...louvres({ x: 0, z: -1.45, long: 0.4, wide: 0.34, count: 5, liftM: 0.016 }),
  ],
  blocks: [
    // A prow of the body's colour down the mouth's middle, so the nose is two intakes and not one dark slab.
    { at: [0, 0.395, -2.19], size: [0.3, 0.09, 0.06], surface: "paint", taper: [1.25, 1] },
    splitter({ z: -2.27, h: 0.22, halfWidth: 0.72, long: 0.14 }),
    ...diffuser({ z: 1.85, tailZ: 2.14, h: 0.27, x: [0.24, 0.42] }),
    ...ducts,
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    silhouette: [
      { z: -2.205, h: 0.22, band: "bumper" },
      { z: -2.2, h: 0.24, band: "mouth" },
      { z: -2.195, h: 0.44, band: "gap" },
      { z: -2.19, h: 0.45 },
      { z: -2.185, h: 0.49, band: "headDark" },
      // The line of light is a lens set back in its housing, under the bonnet's lip.
      { z: -2.168, h: 0.497, band: "headLamp" },
      { z: -2.166, h: 0.525, band: "headDark" },
      ...faired(
        [
          [-2.15, 0.54],
          [-1.8, 0.64],
          [-1.27, 0.74],
          [-0.46, 0.84],
        ],
        [[-2.15, undefined]],
      ),
      { z: -0.46, h: 0.84, band: "cowl" },
      ...faired(
        [
          [-0.4, 0.86],
          [-0.1, 1.05],
          [0.197, 1.2],
          [0.45, 1.27],
          [0.78, 1.24],
          [1.05, 1.12],
          [1.306, 1.005],
          [1.7, 0.99],
          [1.98, 1.0],
        ],
        [
          [-0.4, "screen"],
          [0.197, undefined],
          [0.83, "rearGlass"],
          [1.306, undefined],
        ],
      ),
      { z: 1.98, h: 1.0, band: "gap" },
      { z: 1.99, h: 0.975, band: "tailDark" },
      { z: 2.005, h: 0.955, band: "tailBar" },
      { z: 2.02, h: 0.915, band: "tailDark" },
      { z: 2.035, h: 0.89 },
      { z: 2.12, h: 0.6 },
      { z: 2.145, h: 0.42, band: "diffuser" },
      { z: 2.15, h: 0.24 },
    ],
    sill: [
      [-2.2, 0.18],
      [-1.8, 0.17],
      [0, 0.16],
      [1.8, 0.18],
      [2.15, 0.22],
    ],
    crown: [
      [-2.2, 0.0],
      [-1.8, -0.04],
      [-1.27, -0.08],
      [-0.7, -0.03],
      [-0.4, 0.03],
      [0.4, 0.05],
      [0.9, 0.03],
      [1.23, -0.05],
      [1.8, -0.04],
      [2.15, 0.0],
    ],
    shelf: [
      [-2.2, 0],
      [-1.27, 0.03],
      [-0.4, 0.08],
      [0.3, 0.2],
      [0.8, 0.2],
      [1.3, 0.1],
      [2.15, 0.03],
    ],
    halfWidth: [
      [-2.2, 0.76],
      [-1.9, 0.88],
      [-1.27, 0.92],
      [-0.6, 0.88],
      [0.3, 0.89],
      [1.23, 0.93],
      [1.8, 0.92],
      [2.15, 0.85],
    ],
    scoop: [
      [0, 0],
      [0.45, 0.025],
      [0.75, 0.04],
      [0.95, 0],
    ],
    hoodSeamZ: [-2.0, -0.52],
    cornerPullM: [0.18, 0.12],
    wing: { z: 1.88, h: 1.17, halfWidth: 0.78, chord: 0.18, rise: 0.04, endplates: true, stayM: 0.17 },
    exhausts: { x: [-0.12, 0.12], h: 0.36, z: 2.16, radius: 0.055, open: true },
  },
};

export const sund: CarSpec = {
  id: SUND.id,
  name: SUND.name,
  ride: SUND.ride,
  paint: "car-paint-mustard",
  paints: [
    paint("car-paint-mustard"),
    paint("car-paint-signal-red"),
    paint("car-paint-ultramarine", "metallic"),
    paint("car-paint-lime"),
    paint("car-paint-ivory", "pearl", { flip: "car-paint-ivory-flip" }),
    paint("car-paint-black", "matte"),
  ],
  body: bodyOf(shape),
  /** A screamer's cabin: one big rev counter with shift lights, a flat-bottomed wheel, a sequential lever, carbon buckets with Tärna blue. */
  interior: {
    gauges: "race",
    wheel: "flat",
    shifter: "sequential",
    seats: "bucket",
    screen: false,
    colours: { dash: "car-cabin-carbon", trim: "car-cabin-carbon", insert: "car-cabin-tarna", headliner: "car-cabin-headliner-dark", accent: "car-cabin-tarna", glow: "car-cabin-glow-ice" },
    eye: [0, -0.05, 0],
    turnsToLock: 1.2,
  },
  wheel: { radiusM: SUND.wheelRadiusM, widthM: 0.265, rimShare: 0.76, spokes: 6, twinSpokes: true, style: "aero" },
  shadowHalf: [0.96, 2.2],
};
