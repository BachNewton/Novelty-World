import { ROWS, type Band, type Block, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, louvres, sideIntake, splitter } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const GRUS = driven("grus");
const { sill, sillTop, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Ödmark's road-going rally special, the coupé its works cars were homologated from: a low two-door with a short boot,
 * boxed arches, a bonnet scoop for the turbo's intercooler and a wing on the boot lid. It wears the family face Hagel set
 * down (a dark mouth the whole width of the nose, slit lamps at its upper corners and square driving lamps low in it;
 * two square tail lamps joined by a dark bar; the works livery), on a longer, lower body than the hatch's.
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

/** The works livery as the coupé wears it: twin stripes over bonnet, roof and boot, and a broad band low down each flank under a pinstripe. */
const livery = (): Decal[] => [
  { on: "top", at: [0.13, -1.4], size: [0.12, 0.84], surface: "stripe", mirror: true, cells: [1, 4], liftM: 0.018 },
  { on: "top", at: [0.13, 0.42], size: [0.12, 0.98], surface: "stripe", mirror: true, cells: [1, 4], liftM: 0.012 },
  { on: "top", at: [0.13, 1.82], size: [0.12, 0.3], surface: "stripe", mirror: true, cells: [1, 2], liftM: 0.012 },
  { on: "side", at: [0.05, 0.45], size: [1.5, 0.17], surface: "stripe", mirror: true, cells: [5, 1], liftM: 0.01 },
  { on: "side", at: [0.05, 0.6], size: [1.5, 0.025], surface: "stripe", mirror: true, cells: [5, 1], liftM: 0.01 },
];

/** The intercooler's scoop on the bonnet, shaped out of it, its mouth dark. */
const scoop: Block[] = [
  { at: [0, 0.83, -1.12], size: [0.5, 0.07, 0.5], surface: "paint", taper: [0.84, 0.35] },
  { at: [0, 0.838, -1.367], size: [0.42, 0.045, 0.02], surface: "grille", fine: true },
];

/** One square pipe out of the bumper's left, as Ödmark's lamps are square: a polished frame round a dark pipe set back. */
const exhaust: Block[] = [
  { at: [-0.45, 0.4, 2.075], size: [0.12, 0.014, 0.09], surface: "rim", fine: true },
  { at: [-0.45, 0.3, 2.075], size: [0.12, 0.014, 0.09], surface: "rim", fine: true },
  ...[-0.503, -0.397].map((x): Block => ({ at: [x, 0.35, 2.0735], size: [0.014, 0.1, 0.087], surface: "rim", fine: true })),
  { at: [-0.45, 0.35, 2.07], size: [0.085, 0.07, 0.06], surface: "gap", fine: true },
];

const flaps = (z: number): Block => ({ at: [0.8, 0.19, z], size: [0.24, 0.28, 0.012], surface: "stripe", mirror: true });

const shape: Shape = {
  trackM: GRUS.trackM,
  axleZ: GRUS.axleZ,
  wheelRadiusM: GRUS.wheelRadiusM,
  tyreWidthM: 0.245,
  noseZ: -2.1,
  tailZ: 2.1,
  halfWidth: 0.94,
  sillH: 0.2,
  flareM: 0.06,
  archClearM: 0.07,
  grilleH: 0.38,
  lampH: [0.57, 0.64],
  hoodLipH: 0.66,
  hoodH: 0.8,
  cowl: [-0.66, 0.88],
  header: [-0.05, 1.28],
  roof: [0.4, 1.335],
  roofEnd: [0.95, 1.3],
  shoulder: [
    [-2.1, 0.48],
    [-1.75, 0.68],
    [-1.25, 0.77],
    [-0.66, 0.79],
    [0.3, 0.81],
    [1.25, 0.86],
    [2.1, 0.86],
  ],
  belt: [
    [-2.1, 0.54],
    [-1.75, 0.74],
    [-1.25, 0.83],
    [-0.66, 0.86],
    [0.3, 0.89],
    [1.25, 0.94],
    [2.1, 0.95],
  ],
  windowTop: [
    [-0.62, 0.91],
    [-0.35, 1.07],
    [-0.05, 1.23],
    [0.4, 1.28],
    [0.9, 1.25],
    [1.1, 1.18],
    [1.2, 1.1],
  ],
  windowZ: [-0.62, 1.2],
  railWidth: [
    [-2.1, 0.5],
    [-1.25, 0.74],
    [-0.66, 0.75],
    [-0.05, 0.65],
    [0.5, 0.62],
    [1.3, 0.62],
    [2.1, 0.66],
  ],
  tail: [],
  seams: [-0.58, 0.58],
  pillars: [[0.6, 0.68]],
  mirror: { z: -0.45, h: 0.96, x: 0.84 },
  rearPlateH: 0.72,
  rearSeats: false,
  cabinEndZ: 0.95,
  decals: [
    ...plates(0.72, 0.34, { rearRecessed: true }),
    ...handles([0.42], 0.86),
    ...livery(),
    reversing(0.22, 0.6),
    // Louvres either side of the scoop, where the engine's heat leaves the bonnet.
    ...louvres({ x: 0.42, z: -1.4, long: 0.34, wide: 0.16, count: 4 }).map((slat) => ({ ...slat, liftM: 0.016 })),
    // The vent behind each front wheel, where the arch lets its air out.
    { ...sideIntake({ z: -0.78, h: 0.58, long: 0.12, tall: 0.2 }), cells: [1, 3] },
  ],
  blocks: [
    // Ödmark's square driving lamps, low in the mouth, a pair either side: the special carries one more than the hatch.
    ...[0.36, 0.52].flatMap((x): Block[] => [
      { at: [x, 0.35, -2.11], size: [0.12, 0.1, 0.05], surface: "trim", mirror: true, fine: true },
      { at: [x, 0.35, -2.125], size: [0.09, 0.07, 0.04], surface: "lensHead", mirror: true },
    ]),
    { at: [0, 0.88, 2.0], size: [0.07, 0.05, 0.04], surface: "lensTail", fine: true },
    splitter({ z: -2.17, h: 0.245, halfWidth: 0.8, long: 0.2 }),
    ...diffuser({ z: 1.82, tailZ: 2.09, h: 0.33, x: [0.2, 0.62] }),
    ...scoop,
    ...exhaust,
    flaps(-0.88),
    flaps(1.66),
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    silhouette: [
      { z: -2.102, h: 0.25, band: "bumper" },
      { z: -2.1, h: 0.29, band: "mouth" },
      { z: -2.097, h: 0.4, fine: true },
      { z: -2.095, h: 0.47, band: "mouth" },
      { z: -2.092, h: 0.555, band: "gap", fine: true },
      { z: -2.09, h: 0.56, band: "headDark" },
      { z: -2.082, h: 0.57, band: "headLamp" },
      { z: -2.072, h: 0.64, band: "headDark" },
      ...faired(
        [
          [-2.068, 0.655],
          [-1.7, 0.73],
          [-1.25, 0.79],
          [-0.72, 0.865],
        ],
        [[-2.068, undefined]],
      ),
      { z: -0.72, h: 0.865, band: "cowl" },
      ...faired(
        [
          [-0.66, 0.88],
          [-0.35, 1.07],
          [-0.05, 1.28],
          [0.4, 1.335],
          [0.95, 1.31],
          [1.3, 1.18],
          [1.62, 1.02],
        ],
        [
          [-0.66, "screen"],
          [-0.05, undefined],
          [1.2, "rearGlass"],
        ],
      ),
      { z: 1.62, h: 1.02 },
      { z: 1.8, h: 1.03, fine: true },
      { z: 1.95, h: 1.035 },
      { z: 1.98, h: 1.03, band: "gap", fine: true },
      { z: 1.99, h: 1.025, band: "tailDark" },
      { z: 2.005, h: 1.005, band: "tailLamp" },
      { z: 2.02, h: 0.9, band: "tailDark", fine: true },
      { z: 2.03, h: 0.875 },
      { z: 2.07, h: 0.64 },
      { z: 2.095, h: 0.47, band: "diffuser" },
      { z: 2.1, h: 0.3 },
    ],
    sill: [
      [-2.1, 0.17],
      [-1.7, 0.2],
      [0, 0.2],
      [1.7, 0.22],
      [2.1, 0.25],
    ],
    crown: [
      [-2.1, 0.01],
      [-1.25, -0.025],
      [-0.8, 0.0],
      [-0.3, 0.045],
      [0.3, 0.06],
      [1.4, 0.06],
      [2.1, 0.03],
    ],
    shelf: [
      [-2.1, 0],
      [-1.25, 0.05],
      [-0.66, 0.07],
      [0.3, 0.09],
      [1.0, 0.11],
      [1.5, 0.12],
      [2.1, 0.06],
    ],
    halfWidth: [
      [-2.1, 0.8],
      [-1.8, 0.91],
      [-1.25, 0.94],
      [-0.75, 0.9],
      [0.2, 0.885],
      [0.75, 0.905],
      [1.25, 0.94],
      [1.8, 0.925],
      [2.1, 0.86],
    ],
    scoop: [
      [-0.8, 0],
      [0, 0.012],
      [0.8, 0],
    ],
    hoodSeamZ: [-1.98, -0.78],
    wing: { z: 1.88, h: 1.22, halfWidth: 0.8, chord: 0.22, rise: 0.05, endplates: true, stayM: 0.18 },
    cornerPullM: [0.13, 0.1],
  },
};

export const grus: CarSpec = {
  id: GRUS.id,
  name: GRUS.name,
  ride: GRUS.ride,
  paint: "car-paint-white",
  paints: [
    paint("car-paint-white", "solid", { stripe: "car-paint-ultramarine" }),
    paint("car-paint-white", "solid", { stripe: "car-paint-signal-red" }),
    paint("car-paint-ultramarine", "metallic", { stripe: "car-paint-white" }),
    paint("car-paint-black", "solid", { stripe: "car-paint-orange" }),
    paint("car-paint-lemon", "solid", { stripe: "car-paint-black" }),
    paint("car-paint-silver", "metallic", { stripe: "car-paint-signal-red" }),
  ],
  body: bodyOf(shape),
  /** A road-going special, not a works car: a carbon dash with one big rev counter, a dished wheel, buckets and a short lever, no cage. */
  interior: {
    gauges: "tacho",
    wheel: "rally",
    shifter: "lever",
    seats: "bucket",
    screen: false,
    eye: [0, -0.06, 0],
    colours: { dash: "car-cabin-carbon", trim: "car-cabin-carbon", insert: "car-cabin-panel", headliner: "car-cabin-headliner-dark", accent: "car-cabin-odmark", glow: "car-cabin-glow-red" },
  },
  wheel: { radiusM: GRUS.wheelRadiusM, widthM: 0.245, rimShare: 0.66, spokes: 5, twinSpokes: false, style: "turbine" },
  shadowHalf: [0.94, 2.1],
};
