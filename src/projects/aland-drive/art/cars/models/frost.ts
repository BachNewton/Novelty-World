import { ROWS, type Band, type Block, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { sideIntake } from "../parts";
import { driven, faired, handles, plates, bodyOf, type Shape } from "../recipe";

const FROST = driven("frost");
const { sill, sillTop, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Ödmark's face in its first form, forty years before Hagel: the full-width dark mouth split by a bar of the body's
 * colour, a square headlamp at each upper corner where Hagel has its slits, a pair of square driving lamps low in it,
 * and on the nose a pod of four square spot lamps for the night stages. The tail is two square lamps joined by a dark
 * bar. The works livery is the same idea as Hagel's, broader: twin stripes from the nose over the roof and down the
 * engine cover, and a band over two pinstripes down each flank.
 *
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`).
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  mouth: [{ surface: "grille", from: sillTop, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  /** The upper corners, dark round the square headlamps that stand in them. */
  headDark: [
    { surface: "trim", from: belt, to: rail },
    { surface: "grille", from: rail, to: ALL },
  ],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  /** The louvred engine cover over the engine behind the seats: dark, crossed by slats of the body's colour. */
  louvred: [{ surface: "grille", from: rail, to: ALL }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
};

const NOSE_Z = -1.97;
const TAIL_Z = 1.97;

/** The works livery: twin stripes from the nose to the tail over the roof, and a band over two pinstripes down each flank, between the arches. */
const livery = (): Decal[] => [
  { on: "top", at: [0.15, -1.31], size: [0.17, 1.02], surface: "stripe", mirror: true, cells: [1, 4], liftM: 0.018 },
  { on: "top", at: [0.15, 0.48], size: [0.17, 1.24], surface: "stripe", mirror: true, cells: [1, 4], liftM: 0.012 },
  { on: "top", at: [0.15, 1.77], size: [0.17, 0.12], surface: "stripe", mirror: true, cells: [1, 2], liftM: 0.016 },
  { on: "side", at: [0, 0.6], size: [1.3, 0.17], surface: "stripe", mirror: true, cells: [5, 1], liftM: 0.01 },
  { on: "side", at: [0, 0.48], size: [1.3, 0.03], surface: "stripe", mirror: true, cells: [5, 1], liftM: 0.01 },
  { on: "side", at: [0, 0.43], size: [1.3, 0.015], surface: "stripe", mirror: true, cells: [5, 1], liftM: 0.01 },
];

/** Slats of the body's colour across the louvred engine cover, near only: the far model keeps the dark cover. */
const slats = (): Decal[] =>
  Array.from({ length: 5 }, (_, at): Decal => ({ on: "top", at: [0, 1.25 + at * 0.08], size: [0.72, 0.03], surface: "paint", cells: [4, 1], liftM: 0.018, fine: true }));

/** The pod of four square spot lamps on the nose, for the night stages: a black box, its lamps in square bezels. */
const pod = (): Block[] => [
  { at: [0, 0.742, -1.83], size: [1.02, 0.15, 0.09], surface: "trim" },
  ...[0.13, 0.38].flatMap((x): Block[] => [
    { at: [x, 0.742, -1.882], size: [0.19, 0.13, 0.02], surface: "rim", mirror: true, fine: true },
    { at: [x, 0.742, -1.893], size: [0.155, 0.1, 0.02], surface: "lensHead", mirror: true },
  ]),
];

/** The roof scoop that feeds the engine: a tall periscope over the cabin's back, its mouth dark. */
const scoop: Block[] = [
  { at: [0, 1.39, 0.42], size: [0.44, 0.095, 0.4], surface: "paint", taper: [0.85, 0.35] },
  { at: [0, 1.395, 0.215], size: [0.37, 0.065, 0.02], surface: "grille", fine: true },
];

/** A mud flap behind each wheel, in the stripe colour, hung to a hand's width off the road. */
const flaps = (z: number): Block => ({ at: [0.8, 0.2, z], size: [0.26, 0.3, 0.012], surface: "stripe", mirror: true });

/** A short, boxy mid-engined hatch blown out by box arches, with a tall wing, a roof scoop, a louvred engine cover and a lamp pod. */
const shape: Shape = {
  trackM: FROST.trackM,
  axleZ: FROST.axleZ,
  wheelRadiusM: FROST.wheelRadiusM,
  tyreWidthM: 0.25,
  noseZ: NOSE_Z,
  tailZ: TAIL_Z,
  halfWidth: 0.93,
  sillH: 0.22,
  flareM: 0.03,
  archClearM: 0.07,
  grilleH: 0.36,
  lampH: [0.52, 0.64],
  hoodLipH: 0.66,
  hoodH: 0.83,
  cowl: [-0.62, 0.9],
  header: [-0.2, 1.32],
  roof: [0.45, 1.355],
  roofEnd: [1.12, 1.325],
  shoulder: [
    [-1.97, 0.5],
    [-1.62, 0.66],
    [-1.2, 0.72],
    [-0.72, 0.76],
    [0.3, 0.8],
    [1.2, 0.84],
    [1.97, 0.82],
  ],
  belt: [
    [-1.97, 0.56],
    [-1.62, 0.72],
    [-1.2, 0.78],
    [-0.72, 0.84],
    [0.3, 0.87],
    [1.2, 0.92],
    [1.97, 0.9],
  ],
  windowTop: [
    [-0.58, 0.96],
    [-0.4, 1.1],
    [-0.16, 1.27],
    [0.3, 1.285],
    [0.56, 1.265],
    [0.64, 1.2],
  ],
  windowZ: [-0.58, 0.64],
  railWidth: [
    [-1.97, 0.52],
    [-1.2, 0.74],
    [-0.72, 0.76],
    [-0.14, 0.68],
    [0.3, 0.66],
    [0.7, 0.66],
    [1.97, 0.72],
  ],
  tail: [],
  seams: [-0.5, 0.5],
  // Behind the door's glass, a broad sail of paint with the engine's intake in it.
  pillars: [],
  mirror: { z: -0.46, h: 1.0, x: 0.82 },
  rearPlateH: 0.62,
  rearSeats: false,
  cabinEndZ: 0.6,
  decals: [
    ...plates(0.62, 0.3),
    ...handles([0.28], 0.86),
    ...livery(),
    ...slats(),
    // The engine's intake on each rear flank, behind the door and ahead of the rear wheel.
    { ...sideIntake({ z: 0.82, h: 1.03, long: 0.24, tall: 0.11 }), cells: [4, 2] },
    // A reversing lamp low in the bumper's middle.
    { on: "rear", at: [0, 0.4], size: [0.12, 0.05], surface: "lensReverse", cells: [2, 1], fine: true },
  ],
  blocks: [
    // Square headlamps at the mouth's upper corners, in bright bezels.
    { at: [0.63, 0.578, -1.977], size: [0.2, 0.13, 0.03], surface: "rim", mirror: true, fine: true },
    { at: [0.63, 0.578, -1.99], size: [0.17, 0.105, 0.03], surface: "lensHead", mirror: true },
    // Ödmark's square driving lamps, low in the mouth.
    { at: [0.5, 0.39, -1.977], size: [0.15, 0.11, 0.04], surface: "trim", mirror: true, fine: true },
    { at: [0.5, 0.39, -1.99], size: [0.12, 0.08, 0.03], surface: "lensHead", mirror: true },
    ...pod(),
    // Two big square tail lamps in the dark bar, joined by it, and a reflector square between them.
    { at: [0.63, 0.885, 1.905], size: [0.24, 0.16, 0.03], surface: "lensTail", mirror: true },
    { at: [0, 0.885, 1.9], size: [0.06, 0.06, 0.02], surface: "lensTail", fine: true },
    ...scoop,
    flaps(-0.76),
    flaps(1.64),
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: NOSE_Z - 0.002, h: 0.25, band: "bumper" },
      { z: NOSE_Z, h: 0.33, band: "mouth" },
      // A bar of the body's colour across the mouth, so the nose is two openings and not one dark slab.
      { z: NOSE_Z + 0.003, h: 0.45 },
      { z: NOSE_Z + 0.005, h: 0.5, band: "mouth" },
      { z: NOSE_Z + 0.008, h: 0.515, band: "headDark" },
      ...faired(
        [
          [NOSE_Z + 0.02, 0.69],
          [-1.6, 0.78],
          [-1.2, 0.835],
          [-0.68, 0.885],
        ],
        [[NOSE_Z + 0.02, undefined]],
      ),
      { z: -0.68, h: 0.885, band: "cowl" },
      ...faired(
        [
          [-0.62, 0.9],
          [-0.4, 1.12],
          [-0.2, 1.32],
          [0.45, 1.355],
          [1.12, 1.325],
        ],
        [
          [-0.62, "screen"],
          [-0.2, undefined],
        ],
      ),
      { z: 1.12, h: 1.325, band: "louvred" },
      { z: 1.2, h: 1.27, band: "louvred" },
      { z: 1.7, h: 1.005 },
      { z: 1.86, h: 0.99, band: "gap", fine: true },
      { z: 1.87, h: 0.985, band: "tailDark" },
      { z: 1.9, h: 0.79, band: "tailDark", fine: true },
      { z: 1.91, h: 0.76 },
      { z: 1.95, h: 0.5, band: "bumper" },
      { z: TAIL_Z, h: 0.3 },
    ],
    sill: [
      [NOSE_Z, 0.2],
      [-1.6, 0.22],
      [0, 0.22],
      [1.6, 0.24],
      [TAIL_Z, 0.27],
    ],
    crown: [
      [NOSE_Z, -0.01],
      [-1.2, -0.022],
      [-0.6, 0.0],
      [0.0, 0.035],
      [0.5, 0.04],
      [1.0, 0.01],
      [1.4, -0.02],
      [TAIL_Z, -0.005],
    ],
    shelf: [
      [NOSE_Z, 0],
      [-1.2, 0.04],
      [-0.72, 0.05],
      [0.3, 0.07],
      [1.2, 0.09],
      [TAIL_Z, 0.06],
    ],
    // The box arches: the flank stands out square over each wheel and steps back in at the doors.
    halfWidth: [
      [NOSE_Z, 0.8],
      [-1.86, 0.9],
      [-1.66, 0.93],
      [-0.84, 0.93],
      [-0.7, 0.845],
      [0.7, 0.845],
      [0.84, 0.93],
      [1.76, 0.93],
      [TAIL_Z, 0.85],
    ],
    hoodSeamZ: [-1.88, -0.82],
    wing: { z: 1.74, h: 1.3, halfWidth: 0.86, chord: 0.28, rise: 0.08, endplates: true, stayM: 0.29 },
    exhausts: { x: [-0.48], h: 0.3, z: TAIL_Z - 0.04, radius: 0.05, open: true },
    cornerPullM: [0.06, 0.05],
  },
};

export const frost: CarSpec = {
  id: FROST.id,
  name: FROST.name,
  ride: FROST.ride,
  paint: "car-paint-white",
  paints: [
    paint("car-paint-white", "solid", { stripe: "car-paint-orange" }),
    paint("car-paint-black", "solid", { stripe: "car-paint-orange" }),
    paint("car-paint-signal-red", "solid", { stripe: "car-paint-white" }),
    paint("car-paint-silver", "metallic", { stripe: "car-paint-orange" }),
    paint("car-paint-midnight", "solid", { stripe: "car-paint-lemon" }),
    paint("car-paint-orange", "solid", { stripe: "car-paint-white" }),
  ],
  body: bodyOf(shape),
  /** A 1980s works car's cockpit: a cage, buckets, a bare dash of analogue dials, a big boost gauge in the middle, a dished wheel and a tall gear lever. */
  interior: {
    gauges: "analogue",
    boost: 2.3,
    // The dials up in the wheel's opening, clear of its spokes.
    clusterSight: 0.8,
    wheel: "rally",
    shifter: "lever",
    seats: "bucket",
    screen: false,
    cage: true,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-panel", headliner: "car-cabin-headliner-dark", accent: "car-cabin-odmark", glow: "car-cabin-glow-amber" },
  },
  wheel: { radiusM: FROST.wheelRadiusM, widthM: 0.25, rimShare: 0.62, spokes: 8, twinSpokes: false, style: "turbine" },
  shadowHalf: [0.93, TAIL_Z],
};
