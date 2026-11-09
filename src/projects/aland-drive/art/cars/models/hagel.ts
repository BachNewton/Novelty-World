import { ROWS, type Band, type Block, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, louvres, sideIntake, splitter } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const HAGEL = driven("hagel");
const { sill, sillTop, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Ödmark, the rally maker, and its family look, which Grus and Sten already wear and Hagel sets down for the cars to
 * come: a dark mouth the whole width of the nose with slit lamps at its upper corners and a pair of square driving
 * lamps low in it; a tail of two square lamps joined by a dark bar; and the works livery, twin stripes over the bonnet
 * and roof and a broad band down each flank in the stripe colour, which the mud flaps take too.
 *
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`).
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** The mouth across the whole nose. */
  mouth: [{ surface: "grille", from: sillTop, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  /** A slit lamp at each upper corner, the dark of the mouth between them. */
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
  /** A square lamp at each corner, a dark bar between. */
  tailLamp: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "trim", from: rail, to: ALL },
  ],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** The works livery: twin stripes over the bonnet and the roof, and down each flank a broad band over a thin one. Lifted clear of the curved panels they lie on. */
const livery = (): Decal[] => [
  { on: "top", at: [0.13, -1.385], size: [0.15, 1.11], surface: "stripe", mirror: true, cells: [1, 4], liftM: 0.016 },
  { on: "top", at: [0.13, 0.62], size: [0.15, 1.16], surface: "stripe", mirror: true, cells: [1, 4], liftM: 0.012 },
  { on: "side", at: [0.115, 0.625], size: [1.66, 0.15], surface: "stripe", mirror: true, cells: [5, 1], liftM: 0.01 },
  { on: "side", at: [0.115, 0.5], size: [1.66, 0.03], surface: "stripe", mirror: true, cells: [5, 1], liftM: 0.01 },
];

/** The roof scoop: a shaped intake standing out of the roof, its mouth dark. */
const scoop: Block[] = [
  { at: [0, 1.352, 0.2], size: [0.36, 0.085, 0.44], surface: "paint", taper: [0.8, 0.3] },
  { at: [0, 1.36, -0.015], size: [0.3, 0.05, 0.03], surface: "grille", fine: true },
];

/** A square exhaust through the rear bumper, as Ödmark's lamps are square: a polished frame round a dark pipe set back in it. */
const exhaust: Block[] = [
  { at: [0.4, 0.408, 2.035], size: [0.11, 0.014, 0.09], surface: "rim", fine: true },
  { at: [0.4, 0.312, 2.035], size: [0.11, 0.014, 0.09], surface: "rim", fine: true },
  ...[0.352, 0.448].map((x): Block => ({ at: [x, 0.36, 2.0335], size: [0.014, 0.11, 0.087], surface: "rim", fine: true })),
  { at: [0.4, 0.36, 2.03], size: [0.075, 0.075, 0.06], surface: "gap", fine: true },
];

/** A mud flap behind each wheel, in the stripe colour, hung from under the body to a hand's width off the road. */
const flaps = (z: number): Block => ({ at: [0.8, 0.19, z], size: [0.24, 0.3, 0.012], surface: "stripe", mirror: true });

/** A modern top-class rally car on a three-door hatch: wide boxed arches, a roof-high wing, a scoop and long travel. */
const shape: Shape = {
  trackM: HAGEL.trackM,
  axleZ: HAGEL.axleZ,
  wheelRadiusM: HAGEL.wheelRadiusM,
  tyreWidthM: 0.235,
  noseZ: -2.06,
  tailZ: 2.06,
  halfWidth: 0.945,
  sillH: 0.22,
  flareM: 0.055,
  archClearM: 0.075,
  grilleH: 0.38,
  lampH: [0.59, 0.665],
  hoodLipH: 0.68,
  hoodH: 0.84,
  cowl: [-0.74, 0.92],
  header: [-0.05, 1.31],
  roof: [0.45, 1.36],
  roofEnd: [1.42, 1.3],
  shoulder: [
    [-2.06, 0.5],
    [-1.75, 0.7],
    [-1.32, 0.8],
    [-0.74, 0.82],
    [0.3, 0.85],
    [1.3, 0.9],
    [2.06, 0.86],
  ],
  belt: [
    [-2.06, 0.56],
    [-1.75, 0.76],
    [-1.32, 0.86],
    [-0.74, 0.9],
    [0.3, 0.93],
    [1.3, 0.98],
    [2.06, 0.95],
  ],
  windowTop: [
    [-0.7, 0.95],
    [-0.4, 1.1],
    [-0.05, 1.25],
    [0.45, 1.29],
    [1.0, 1.26],
    [1.3, 1.2],
    [1.42, 1.13],
  ],
  windowZ: [-0.7, 1.42],
  railWidth: [
    [-2.06, 0.5],
    [-1.32, 0.74],
    [-0.74, 0.76],
    [-0.05, 0.66],
    [0.5, 0.63],
    [1.42, 0.6],
    [2.06, 0.62],
  ],
  tail: [],
  seams: [-0.66, 0.42],
  pillars: [[0.5, 0.6]],
  mirror: { z: -0.5, h: 1.0, x: 0.84 },
  rearPlateH: 0.71,
  rearSeats: false,
  cabinEndZ: 0.95,
  decals: [
    ...plates(0.71, 0.355),
    ...handles([0.2], 0.9),
    ...livery(),
    reversing(0.24, 0.6),
    // The bonnet's exit vent between the stripes, and louvres either side of them over the engine.
    { on: "top", at: [0, -1.2], size: [0.13, 0.3], surface: "grille", cells: [2, 4], liftM: 0.012, fine: true },
    ...louvres({ x: 0.4, z: -1.2, long: 0.3, wide: 0.15, count: 4 }).map((slat) => ({ ...slat, liftM: 0.016 })),
    { ...sideIntake({ z: -0.8, h: 0.6, long: 0.12, tall: 0.24 }), cells: [1, 3] },
    // The vent behind each rear wheel, where the air from the arch leaves.
    { ...sideIntake({ z: 1.78, h: 0.55, long: 0.14, tall: 0.16 }), cells: [1, 3], fine: true },
  ],
  blocks: [
    // Ödmark's square driving lamps, low in the mouth.
    { at: [0.52, 0.357, -2.07], size: [0.13, 0.11, 0.05], surface: "trim", mirror: true, fine: true },
    { at: [0.52, 0.357, -2.085], size: [0.1, 0.08, 0.04], surface: "lensHead", mirror: true },
    // The rain light in the middle of the tail's dark bar, square as the lamps either side of it.
    { at: [0, 0.89, 1.905], size: [0.07, 0.06, 0.04], surface: "lensTail", fine: true },
    // Dive planes at the bumper's corners.
    { at: [0.8, 0.42, -1.97], size: [0.16, 0.014, 0.2], surface: "trim", mirror: true, taper: [0.6, 1], fine: true },
    splitter({ z: -2.13, h: 0.255, halfWidth: 0.78, long: 0.2 }),
    ...diffuser({ z: 1.78, tailZ: 2.05, h: 0.34, x: [0.24, 0.56] }),
    ...scoop,
    ...exhaust,
    flaps(-0.87),
    flaps(1.73),
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.062, h: 0.25, band: "bumper" },
      { z: -2.06, h: 0.3, band: "mouth" },
      // A bar of the body's colour across the mouth, so the nose is two openings and not one dark slab.
      { z: -2.057, h: 0.41, fine: true },
      { z: -2.055, h: 0.49, band: "mouth" },
      { z: -2.052, h: 0.575, band: "gap", fine: true },
      { z: -2.05, h: 0.58, band: "headDark" },
      { z: -2.042, h: 0.59, band: "headLamp" },
      { z: -2.032, h: 0.665, band: "headDark" },
      ...faired(
        [
          [-2.028, 0.68],
          [-1.7, 0.76],
          [-1.25, 0.83],
          [-0.8, 0.9],
        ],
        [[-2.028, undefined]],
      ),
      { z: -0.8, h: 0.9, band: "cowl" },
      ...faired(
        [
          [-0.74, 0.92],
          [-0.4, 1.12],
          [-0.05, 1.31],
          [0.45, 1.36],
          [1.0, 1.35],
          [1.42, 1.3],
        ],
        [
          [-0.74, "screen"],
          [-0.05, undefined],
        ],
      ),
      { z: 1.42, h: 1.3, band: "rearGlass" },
      { z: 1.76, h: 0.99 },
      { z: 1.86, h: 0.96, band: "gap", fine: true },
      { z: 1.87, h: 0.955, band: "tailDark" },
      { z: 1.885, h: 0.935, band: "tailLamp" },
      { z: 1.9, h: 0.83, band: "tailDark", fine: true },
      { z: 1.91, h: 0.81 },
      { z: 1.97, h: 0.62, band: "bumper" },
      { z: 2.03, h: 0.46, band: "diffuser" },
      { z: 2.05, h: 0.3 },
    ],
    sill: [
      [-2.06, 0.18],
      [-1.7, 0.21],
      [0, 0.22],
      [1.7, 0.24],
      [2.06, 0.26],
    ],
    crown: [
      [-2.06, 0.01],
      [-1.32, -0.02],
      [-0.85, 0.0],
      [-0.3, 0.045],
      [0.3, 0.06],
      [1.42, 0.065],
      [2.06, 0.03],
    ],
    shelf: [
      [-2.06, 0],
      [-1.32, 0.05],
      [-0.74, 0.07],
      [0.3, 0.09],
      [1.0, 0.105],
      [1.5, 0.11],
      [2.06, 0.06],
    ],
    halfWidth: [
      [-2.06, 0.8],
      [-1.8, 0.91],
      [-1.32, 0.945],
      [-0.8, 0.905],
      [0.2, 0.89],
      [0.8, 0.91],
      [1.3, 0.945],
      [1.8, 0.93],
      [2.06, 0.86],
    ],
    scoop: [
      [-0.85, 0],
      [0, 0.012],
      [0.85, 0],
    ],
    hoodSeamZ: [-1.95, -0.84],
    wing: { z: 1.4, h: 1.45, halfWidth: 0.82, chord: 0.2, rise: 0.06, endplates: true },
    cornerPullM: [0.13, 0.09],
  },
};

export const hagel: CarSpec = {
  id: HAGEL.id,
  name: HAGEL.name,
  ride: HAGEL.ride,
  paint: "car-paint-white",
  paints: [
    paint("car-paint-white", "solid", { stripe: "car-paint-orange" }),
    paint("car-paint-black", "solid", { stripe: "car-paint-orange" }),
    paint("car-paint-orange", "solid", { stripe: "car-paint-black" }),
    paint("car-paint-ultramarine", "metallic", { stripe: "car-paint-lemon" }),
    paint("car-paint-graphite", "matte", { stripe: "car-paint-lime" }),
    paint("car-paint-glacier", "metallic", { stripe: "car-paint-signal-red" }),
    paint("car-paint-signal-red", "solid", { stripe: "car-paint-white" }),
  ],
  body: bodyOf(shape),
  /** A works rally car's cockpit: a cage, buckets, one digital display, a dished wheel, a sequential lever and a hydraulic handbrake, the driver seated low, so the display reads over the wheel's boss. */
  interior: {
    gauges: "digital",
    wheel: "rally",
    shifter: "sequential",
    seats: "bucket",
    screen: false,
    cage: true,
    eye: [0, -0.045, 0],
    colours: { dash: "car-cabin-carbon", trim: "car-cabin-carbon", insert: "car-cabin-panel", headliner: "car-cabin-headliner-dark", accent: "car-cabin-odmark", glow: "car-cabin-glow-red" },
  },
  wheel: { radiusM: HAGEL.wheelRadiusM, widthM: 0.235, rimShare: 0.6, spokes: 6, twinSpokes: true, style: "split" },
  shadowHalf: [0.945, 2.06],
};
