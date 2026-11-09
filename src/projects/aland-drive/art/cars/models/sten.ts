import { ROWS, type Band, type Block, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, sideIntake, splitter } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const STEN = driven("sten");
const { sill, sillTop, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Ödmark's road hatch, the one a buyer drives to work: Hagel's family face on a shorter, taller three-door, with none of
 * the works car's wings and flaps. The full-width dark mouth with slit lamps at its upper corners and square driving lamps
 * low in it; the tailgate's two square lamps joined by a dark bar; and the livery cut down to a band along each flank.
 *
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`).
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  mouth: [{ surface: "grille", from: sillTop, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  headDark: [
    { surface: "trim", from: belt, to: rail },
    { surface: "grille", from: rail, to: ALL },
  ],
  headLamp: [
    { surface: "lensHead", from: windowBase, to: rail },
    { surface: "grille", from: rail, to: ALL },
  ],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  tailLamp: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "trim", from: rail, to: ALL },
  ],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** The road car's livery: a broad band along each flank over a pinstripe, through the doors, in the stripe colour. */
const livery = (): Decal[] => [
  { on: "side", at: [0.02, 0.62], size: [1.48, 0.1], surface: "stripe", mirror: true, cells: [5, 1], liftM: 0.01 },
  { on: "side", at: [0.02, 0.535], size: [1.48, 0.022], surface: "stripe", mirror: true, cells: [5, 1], liftM: 0.01 },
];

/** Twin square pipes in the middle of the bumper, polished frames round dark pipes set back. */
const exhaust = (x: number): Block[] => [
  { at: [x, 0.39, 1.955], size: [0.1, 0.012, 0.08], surface: "rim", fine: true },
  { at: [x, 0.31, 1.955], size: [0.1, 0.012, 0.08], surface: "rim", fine: true },
  ...[x - 0.044, x + 0.044].map((across): Block => ({ at: [across, 0.35, 1.9535], size: [0.012, 0.09, 0.077], surface: "rim", fine: true })),
  { at: [x, 0.35, 1.95], size: [0.076, 0.068, 0.05], surface: "gap", fine: true },
];

/** A three-door hot hatch: short overhangs, a near-upright tailgate under a roof spoiler, and arches just flared over its wheels. */
const shape: Shape = {
  trackM: STEN.trackM,
  axleZ: STEN.axleZ,
  wheelRadiusM: STEN.wheelRadiusM,
  tyreWidthM: 0.215,
  noseZ: -1.975,
  tailZ: 1.975,
  halfWidth: 0.89,
  sillH: 0.2,
  flareM: 0.035,
  archClearM: 0.06,
  grilleH: 0.4,
  lampH: [0.6, 0.67],
  hoodLipH: 0.69,
  hoodH: 0.86,
  cowl: [-0.82, 0.94],
  header: [-0.18, 1.37],
  roof: [0.35, 1.42],
  roofEnd: [1.48, 1.39],
  shoulder: [
    [-1.975, 0.52],
    [-1.65, 0.72],
    [-1.25, 0.8],
    [-0.82, 0.84],
    [0.3, 0.86],
    [1.25, 0.9],
    [1.975, 0.88],
  ],
  belt: [
    [-1.975, 0.58],
    [-1.65, 0.78],
    [-1.25, 0.87],
    [-0.82, 0.92],
    [0.3, 0.95],
    [1.25, 0.99],
    [1.975, 0.97],
  ],
  windowTop: [
    [-0.78, 0.98],
    [-0.5, 1.13],
    [-0.18, 1.31],
    [0.35, 1.355],
    [1.0, 1.34],
    [1.3, 1.3],
    [1.48, 1.22],
  ],
  windowZ: [-0.78, 1.48],
  railWidth: [
    [-1.975, 0.5],
    [-1.25, 0.72],
    [-0.82, 0.74],
    [-0.18, 0.66],
    [0.5, 0.64],
    [1.48, 0.62],
    [1.975, 0.64],
  ],
  tail: [],
  seams: [-0.7, 0.45],
  pillars: [[0.52, 0.62]],
  mirror: { z: -0.55, h: 1.0, x: 0.84 },
  rearPlateH: 0.66,
  cabinEndZ: 1.35,
  decals: [
    ...plates(0.66, 0.34, { rearRecessed: true }),
    ...handles([0.25], 0.92),
    ...livery(),
    reversing(0.2, 0.55),
    // The vent behind each front wheel, where the arch lets its air out.
    { ...sideIntake({ z: -0.86, h: 0.62, long: 0.1, tall: 0.18 }), cells: [1, 3] },
  ],
  blocks: [
    // Ödmark's square driving lamps, low in the mouth: one pair, as the road car has.
    { at: [0.5, 0.345, -1.985], size: [0.12, 0.1, 0.05], surface: "trim", mirror: true, fine: true },
    { at: [0.5, 0.345, -2.0], size: [0.09, 0.07, 0.04], surface: "lensHead", mirror: true },
    // The roof spoiler over the tailgate, of the body's colour, its trailing edge dark.
    { at: [0, 1.37, 1.52], size: [1.14, 0.07, 0.24], surface: "paint", taper: [1, 0.4] },
    { at: [0, 1.37, 1.645], size: [1.1, 0.014, 0.02], surface: "trim", fine: true },
    splitter({ z: -2.04, h: 0.255, halfWidth: 0.66, long: 0.13 }),
    ...diffuser({ z: 1.72, tailZ: 1.96, h: 0.32, x: [0.3, 0.5] }),
    ...exhaust(0.11),
    ...exhaust(-0.11),
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    silhouette: [
      { z: -1.977, h: 0.255, band: "bumper" },
      { z: -1.975, h: 0.3, band: "mouth" },
      // A bar of the body's colour across the mouth, so the nose is two openings and not one dark slab.
      { z: -1.972, h: 0.42, fine: true },
      { z: -1.97, h: 0.5, band: "mouth" },
      { z: -1.967, h: 0.585, band: "gap", fine: true },
      { z: -1.965, h: 0.59, band: "headDark" },
      { z: -1.957, h: 0.6, band: "headLamp" },
      { z: -1.947, h: 0.67, band: "headDark" },
      ...faired(
        [
          [-1.943, 0.685],
          [-1.6, 0.77],
          [-1.2, 0.84],
          [-0.88, 0.92],
        ],
        [[-1.943, undefined]],
      ),
      { z: -0.88, h: 0.92, band: "cowl" },
      ...faired(
        [
          [-0.82, 0.94],
          [-0.5, 1.16],
          [-0.18, 1.37],
          [0.35, 1.42],
          [1.0, 1.41],
          [1.48, 1.39],
        ],
        [
          [-0.82, "screen"],
          [-0.18, undefined],
        ],
      ),
      { z: 1.48, h: 1.39, band: "rearGlass" },
      { z: 1.72, h: 1.04 },
      { z: 1.78, h: 1.01, band: "gap", fine: true },
      { z: 1.79, h: 1.005, band: "tailDark" },
      { z: 1.805, h: 0.985, band: "tailLamp" },
      { z: 1.82, h: 0.88, band: "tailDark", fine: true },
      { z: 1.83, h: 0.86 },
      { z: 1.9, h: 0.62 },
      { z: 1.955, h: 0.45, band: "diffuser" },
      { z: 1.97, h: 0.29 },
    ],
    sill: [
      [-1.975, 0.18],
      [-1.6, 0.2],
      [0, 0.2],
      [1.6, 0.21],
      [1.975, 0.25],
    ],
    crown: [
      [-1.975, 0.01],
      [-1.25, -0.015],
      [-0.85, 0.0],
      [-0.3, 0.045],
      [0.3, 0.06],
      [1.48, 0.06],
      [1.975, 0.03],
    ],
    shelf: [
      [-1.975, 0],
      [-1.25, 0.04],
      [-0.82, 0.06],
      [0.3, 0.08],
      [1.0, 0.09],
      [1.5, 0.1],
      [1.975, 0.05],
    ],
    halfWidth: [
      [-1.975, 0.76],
      [-1.7, 0.86],
      [-1.25, 0.885],
      [-0.8, 0.86],
      [0.2, 0.855],
      [0.8, 0.865],
      [1.25, 0.89],
      [1.7, 0.88],
      [1.975, 0.82],
    ],
    scoop: [
      [-0.8, 0],
      [0, 0.01],
      [0.8, 0],
    ],
    hoodSeamZ: [-1.86, -0.92],
    cornerPullM: [0.13, 0.08],
  },
};

export const sten: CarSpec = {
  id: STEN.id,
  name: STEN.name,
  ride: STEN.ride,
  paint: "car-paint-orange",
  paints: [
    paint("car-paint-orange", "solid", { stripe: "car-paint-black" }),
    paint("car-paint-white", "solid", { stripe: "car-paint-signal-red" }),
    paint("car-paint-lime", "solid", { stripe: "car-paint-black" }),
    paint("car-paint-black", "solid", { stripe: "car-paint-orange" }),
    paint("car-paint-ultramarine", "metallic", { stripe: "car-paint-white" }),
    paint("car-paint-silver", "metallic", { stripe: "car-paint-black" }),
  ],
  body: bodyOf(shape),
  /** A hot hatch's cabin: two dials and a small screen, a flat-bottomed wheel, a short lever, sports seats in cloth with Ödmark's orange. */
  interior: {
    gauges: "analogue",
    wheel: "flat",
    shifter: "lever",
    seats: "sport",
    screen: true,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-seat-cloth-insert", headliner: "car-cabin-headliner-dark", accent: "car-cabin-odmark", glow: "car-cabin-glow-red" },
  },
  wheel: { radiusM: STEN.wheelRadiusM, widthM: 0.215, rimShare: 0.7, spokes: 6, twinSpokes: false, style: "split" },
  shadowHalf: [0.89, 1.975],
};
