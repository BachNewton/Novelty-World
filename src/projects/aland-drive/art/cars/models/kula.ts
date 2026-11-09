import { ROWS, type Band, type Decal, type Strut } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { louvres } from "../parts";
import { bodyOf, driven, faired, handles, type Shape } from "../recipe";

const KULA = driven("kula");
const { belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Kamrat's face: two round eyes in chrome rings at the corners of a smooth, grille-less nose, the engine being in the
 * tail, and between them a chrome moustache, a short bar turned up at its tips, hung under a chrome spine that runs
 * down the front lid. At the tail, a tall chrome-ringed drop of red on each wing and a lid of air vents over the engine.
 *
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  /** The roof, in the stripe's colour: a two-tone paint's contrasting top, or the body's own colour again. */
  roof: [{ surface: "stripe", from: rail, to: ALL }],
  roofScreen: [
    { surface: "stripe", from: rail, to: rail + 1 },
    { surface: "glass", from: rail + 1, to: ALL },
  ],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  /** The engine lid's shut line across the deck. */
  gap: [{ surface: "gap", from: rail, to: ALL }],
};

const NOSE_Z = -2.09;
const TAIL_Z = 1.87;

/** The round headlamps on the nose's corners, each in a chrome ring, with a small amber indicator under each. */
const face = (): Decal[] => [
  { on: "front", at: [0.5, 0.64], size: [0.2, 0.2], surface: "rim", mirror: true, round: true, liftM: 0.012 },
  { on: "front", at: [0.5, 0.64], size: [0.165, 0.165], surface: "lensHead", mirror: true, round: true, liftM: 0.018 },
  { on: "front", at: [0.54, 0.47], size: [0.075, 0.05], surface: "rim", mirror: true, round: true, liftM: 0.012, fine: true },
  { on: "front", at: [0.54, 0.47], size: [0.06, 0.038], surface: "lensAmber", mirror: true, round: true, liftM: 0.016, fine: true },
  // The moustache: a chrome bar across the nose between the eyes, its tips turned up.
  { on: "front", at: [0, 0.505], size: [0.46, 0.022], surface: "rim", cells: [8, 1], liftM: 0.014 },
  { on: "front", at: [0.225, 0.52], size: [0.05, 0.024], surface: "rim", mirror: true, cells: [2, 1], liftM: 0.016, fine: true },
  // The front plate, a short one, sat low on the apron over the bumper.
  { on: "front", at: [0, 0.415], size: [0.34, 0.08], surface: "plate", cells: [8, 2], liftM: 0.018, fine: true },
];

/** The tail: a tall drop of red in a chrome ring on each wing, the plate under the lid with its lamp's hood, a reversing lamp under it. */
const tail = (): Decal[] => [
  { on: "rear", at: [0.55, 0.7], size: [0.13, 0.23], surface: "rim", mirror: true, round: true, liftM: 0.012 },
  { on: "rear", at: [0.55, 0.7], size: [0.1, 0.2], surface: "lensTail", mirror: true, round: true, liftM: 0.018 },
  { on: "rear", at: [0.55, 0.545], size: [0.065, 0.048], surface: "lensAmber", mirror: true, round: true, liftM: 0.014, fine: true },
  // The engine lid's chrome handle, at the top of the tail.
  { on: "rear", at: [0, 0.79], size: [0.14, 0.024], surface: "rim", cells: [4, 1], liftM: 0.014, fine: true },
  { on: "rear", at: [0, 0.5], size: [0.44, 0.11], surface: "plate", cells: [4, 1], liftM: 0.014, fine: true },
  { on: "rear", at: [0, 0.578], size: [0.16, 0.026], surface: "rim", cells: [4, 1], liftM: 0.018, fine: true },
  { on: "rear", at: [0.12, 0.26], size: [0.08, 0.04], surface: "lensReverse", cells: [2, 1], liftM: 0.012, fine: true },
];

/** The flanks: a chrome spear along the doors, the handles, and three slots of vent on each rear wing, where the engine breathes. */
const flanks = (): Decal[] => [
  { on: "side", at: [-0.22, 0.64], size: [1.45, 0.016], surface: "rim", mirror: true, cells: [12, 1], liftM: 0.012, fine: true },
  ...handles([0.08], 0.8),
  ...[0, 1, 2].map((slot): Decal => ({ on: "side", at: [1.36 - slot * 0.025, 0.885 - slot * 0.04], size: [0.26, 0.018], surface: "grille", mirror: true, cells: [6, 1], liftM: 0.014, fine: true })),
];

/** The front lid's chrome spine, from its front edge back to the handle, and the engine lid's vents. */
const lids = (): Decal[] => [
  { on: "top", at: [0, -1.72], size: [0.025, 0.42], surface: "rim", cells: [1, 6], liftM: 0.012, fine: true },
  ...louvres({ x: 0, z: 1.08, long: 0.34, wide: 0.46, count: 6 }),
];

/**
 * A chrome bumper bar following the end's curve round its corners, on two small dark irons, with an overrider standing
 * up from it either side of the plate. `plan` is the bar's path across the car, from its middle out to one corner.
 */
const bumper = (plan: readonly (readonly [x: number, z: number])[], end: "front" | "rear"): Strut[] => {
  const h = 0.33;
  const out = end === "front" ? -1 : 1;
  const half = plan.map(([x, z]) => [x, h, z] as const);
  const across = [...half.slice(1).reverse().map(([x, up, z]) => [-x, up, z] as const), ...half];
  const zAt = (x: number) => {
    const next = plan.findIndex(([at]) => at >= x);
    const [[x0, z0], [x1, z1]] = [plan[next - 1], plan[next]];
    return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
  };
  return [
    { path: across, radius: 0.034, surface: "rim", sides: 12 },
    { path: [[0.38, h - 0.01, zAt(0.38) - out * 0.02], [0.38, h - 0.01, zAt(0.38) - out * 0.13]], radius: 0.014, surface: "trim", mirror: true, fine: true },
    // The overriders: short chrome posts standing up out of the bar, leaning a little back at the top.
    { path: [[0.27, h - 0.04, zAt(0.27) + out * 0.012], [0.27, h + 0.07, zAt(0.27) + out * 0.004], [0.27, h + 0.11, zAt(0.27) - out * 0.012]], radius: 0.022, surface: "rim", mirror: true, sides: 10, fine: true },
  ];
};

const FRONT_BUMPER = bumper(
  [
    [0, -2.145],
    [0.25, -2.105],
    [0.42, -2.015],
    [0.54, -1.925],
    [0.62, -1.85],
    [0.66, -1.78],
    [0.67, -1.73],
  ],
  "front",
);
const REAR_BUMPER = bumper(
  [
    [0, 1.93],
    [0.25, 1.9],
    [0.42, 1.835],
    [0.54, 1.765],
    [0.62, 1.7],
    [0.66, 1.645],
    [0.68, 1.59],
  ],
  "rear",
);

/** A small rounded two-door people's car with its engine in the tail: a short smooth nose, a tall round cabin, a short lid of vents behind. */
const shape: Shape = {
  trackM: KULA.trackM,
  axleZ: KULA.axleZ,
  wheelRadiusM: KULA.wheelRadiusM,
  tyreWidthM: 0.155,
  noseZ: NOSE_Z,
  tailZ: TAIL_Z,
  halfWidth: 0.78,
  sillH: 0.2,
  rearSillH: 0.22,
  flareM: 0.035,
  archClearM: 0.05,
  grilleH: 0.4,
  lampH: [0.55, 0.65],
  hoodLipH: 0.72,
  hoodH: 0.87,
  cowl: [-1.0, 0.93],
  header: [-0.6, 1.37],
  roof: [-0.1, 1.468],
  roofEnd: [0.5, 1.42],
  shoulder: [
    [-2.09, 0.56],
    [-1.75, 0.78],
    [-1.38, 0.815],
    [-0.7, 0.835],
    [0.3, 0.845],
    [0.92, 0.855],
    [1.5, 0.83],
    [1.87, 0.72],
  ],
  belt: [
    [-2.09, 0.6],
    [-1.75, 0.82],
    [-1.38, 0.855],
    [-0.7, 0.875],
    [0.3, 0.885],
    [0.92, 0.895],
    [1.5, 0.87],
    [1.87, 0.76],
  ],
  windowTop: [
    [-0.96, 0.95],
    [-0.75, 1.17],
    [-0.55, 1.32],
    [-0.15, 1.385],
    [0.3, 1.37],
    [0.6, 1.27],
    [0.78, 1.1],
    [0.88, 0.97],
  ],
  windowZ: [-0.96, 0.88],
  railWidth: [
    [-2.09, 0.42],
    [-1.38, 0.62],
    [-1.0, 0.66],
    [-0.5, 0.6],
    [0.2, 0.575],
    [0.9, 0.6],
    [1.4, 0.6],
    [1.87, 0.46],
  ],
  tail: [],
  seams: [-0.96, 0.25],
  pillars: [[0.2, 0.27]],
  mirror: { z: -0.83, h: 0.99, x: 0.74 },
  rearPlateH: 0.5,
  decals: [...face(), ...tail(), ...flanks(), ...lids()],
  extra: {
    bands: BANDS,
    silhouette: [
      // The nose rises from its foot in one round curve into the front lid, with no grille: the engine is in the tail.
      { z: NOSE_Z, h: 0.28 },
      { z: NOSE_Z + 0.002, h: 0.45 },
      { z: NOSE_Z + 0.015, h: 0.56 },
      { z: NOSE_Z + 0.045, h: 0.65 },
      { z: NOSE_Z + 0.1, h: 0.73 },
      { z: NOSE_Z + 0.18, h: 0.785 },
      // The front lid, then the screen, roof, rear glass and engine lid, each as one fair line.
      ...faired(
        [
          [NOSE_Z + 0.27, 0.82],
          [-1.55, 0.865],
          [-1.25, 0.895],
          [-1.05, 0.92],
        ],
        [[NOSE_Z + 0.27, undefined]],
      ),
      { z: -1.05, h: 0.92, band: "cowl" },
      // The windscreen is one flat pane from the cowl to the header, where the cockpit hangs its mirror and visors.
      { z: -1.0, h: 0.93, band: "screen" },
      ...faired(
        [
          [-0.6, 1.37],
          [-0.1, 1.468],
          [0.35, 1.45],
          [0.55, 1.38],
          [0.88, 1.1],
          [1.15, 1.06],
          [1.45, 1.0],
          [1.66, 0.92],
        ],
        [
          [-0.6, "roof"],
          [0.52, "rearGlass"],
          [0.9, "gap"],
          [0.92, undefined],
        ],
      ),
      // The tail falls away round under the engine lid to the bumper.
      { z: 1.76, h: 0.85 },
      { z: 1.82, h: 0.76 },
      { z: 1.852, h: 0.66 },
      { z: 1.866, h: 0.53 },
      { z: TAIL_Z, h: 0.41 },
      { z: TAIL_Z, h: 0.3 },
    ],
    crown: [
      [-2.09, 0.0],
      [-1.75, 0.025],
      [-1.1, 0.035],
      [-0.85, 0.045],
      [-0.1, 0.075],
      [0.6, 0.06],
      [1.0, 0.02],
      [1.4, 0.0],
      [1.87, 0.0],
    ],
    halfWidth: [
      [-2.09, 0.6],
      [-1.85, 0.72],
      [-1.38, 0.775],
      [-0.5, 0.765],
      [0.4, 0.77],
      [0.92, 0.78],
      [1.5, 0.765],
      [1.87, 0.63],
    ],
    cornerPullM: [0.3, 0.24],
    cornerReachM: 0.75,
    hoodSeamZ: [-1.97, -1.1],
    cleanEnds: true,
    cabin: { dashZ: -0.98, dashH: 0.9, floorH: 0.34, seatZ: -0.08, rearSeatZ: 0.58, endZ: 0.88, seatX: 0.3, seatSurface: "seatTan" },
    struts: [...FRONT_BUMPER, ...REAR_BUMPER],
    exhausts: { x: [-0.24, 0.24], h: 0.24, z: TAIL_Z - 0.02, radius: 0.022 },
  },
};

export const kula: CarSpec = {
  id: KULA.id,
  name: KULA.name,
  ride: KULA.ride,
  paint: "car-paint-kamrat",
  paints: [
    paint("car-paint-kamrat", "solid", { stripe: "car-paint-kamrat" }),
    paint("car-paint-cream", "solid", { stripe: "car-paint-cream" }),
    paint("car-paint-signal-red", "solid", { stripe: "car-paint-signal-red" }),
    paint("car-paint-reseda", "solid", { stripe: "car-paint-reseda" }),
    paint("car-paint-dove-grey", "solid", { stripe: "car-paint-dove-grey" }),
    paint("car-paint-signal-red", "solid", { stripe: "car-paint-cream" }),
    paint("car-paint-kamrat", "solid", { stripe: "car-paint-cream" }),
  ],
  body: bodyOf(shape),
  /** A people's car's cabin: a bare dash in the body's paint with one big speedometer, a thin two-spoke wheel, a long floor lever and plain vinyl seats. */
  interior: {
    gauges: "single",
    wheel: "twoSpoke",
    shifter: "floor",
    seats: "comfort",
    screen: false,
    paintedDash: true,
    turnsToLock: 2.2,
    // A little below where the roof would seat the eye, so the visors and the low header are a band over the road.
    eye: [0, -0.05, 0],
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim-tan", insert: "car-cabin-insert-tan", headliner: "car-cabin-headliner", accent: "car-cabin-metal", glow: "car-cabin-glow-amber" },
  },
  wheel: { radiusM: KULA.wheelRadiusM, widthM: 0.155, rimShare: 0.62, spokes: 6, twinSpokes: false, style: "steel" },
  shadowHalf: [0.78, 1.95],
};
