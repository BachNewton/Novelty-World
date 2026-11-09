import { ROWS, type Band, type Block, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { bodyOf, driven, faired, handles, plates, type Shape } from "../recipe";

const KRAFT = driven("kraft");
const { sill, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Ridgeway's face as the 1970s drew it: a wide dark grille split down the middle by a spine of the body's colour,
 * which runs on up the hood as its scoop's ridge, and at each corner two stacked lamps in a chrome-ringed dark
 * housing; behind, the same two stacked bars, red, at each end of a dark tail panel. Chrome bumpers, a long hood, a
 * short deck with a lip, a pillarless hardtop. Every band starts and ends on a row the far model has too
 * (`build.ts`, `FAR`).
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  /** The grille, split by the body's spine down the middle. */
  mouth: [{ surface: "grille", from: windowBase, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  /** The dark tail panel between the tail lamps. */
  tailPanel: [{ surface: "trim", from: windowBase, to: ALL }],
  valance: [{ surface: "under", from: sill, to: ALL }],
};

const NOSE_Z = -2.56;
const TAIL_Z = 2.56;

/** A chrome bumper across an end, nearly the car's width. */
const bumper = (z: number, h: number): Block => ({ at: [0, h, z], size: [1.74, 0.1, 0.1], surface: "rim" });

/** The twin stripes over the hood either side of the scoop and over the deck, lifted clear of the curved panels. */
const stripes: Decal[] = [
  { on: "top", at: [0.34, -1.5], size: [0.11, 1.84], surface: "stripe", mirror: true, cells: [1, 6], liftM: 0.022 },
  { on: "top", at: [0.34, 2.1], size: [0.11, 0.76], surface: "stripe", mirror: true, cells: [1, 3], liftM: 0.022 },
  { on: "top", at: [0.3, 0.67], size: [0.12, 0.9], surface: "stripe", mirror: true, cells: [1, 4], liftM: 0.012 },
  // A thin stripe the length of each flank under the shoulder, the decade's own.
  { on: "side", at: [-0.05, 0.775], size: [4.6, 0.045], surface: "stripe", mirror: true, cells: [10, 1], liftM: 0.01 },
];

/** An original 1970s muscle coupé: a long hood with a scoop, the cabin set back, a short deck, slab sides on chrome. */
const shape: Shape = {
  trackM: KRAFT.trackM,
  axleZ: KRAFT.axleZ,
  wheelRadiusM: KRAFT.wheelRadiusM,
  tyreWidthM: 0.235,
  noseZ: NOSE_Z,
  tailZ: TAIL_Z,
  halfWidth: 0.96,
  sillH: 0.2,
  rearSillH: 0.22,
  flareM: 0.03,
  archClearM: 0.045,
  grilleH: 0.46,
  lampH: [0.55, 0.72],
  hoodLipH: 0.8,
  hoodH: 0.88,
  cowl: [-0.36, 0.915],
  header: [0.2, 1.245],
  roof: [0.68, 1.29],
  roofEnd: [1.14, 1.27],
  shoulder: [
    [NOSE_Z, 0.7],
    [-2.25, 0.78],
    [-1.5, 0.8],
    [-0.4, 0.81],
    [0.6, 0.82],
    [1.4, 0.83],
    [2.25, 0.83],
    [TAIL_Z, 0.8],
  ],
  belt: [
    [NOSE_Z, 0.76],
    [-2.25, 0.83],
    [-1.5, 0.86],
    [-0.42, 0.885],
    [0.6, 0.9],
    [1.4, 0.92],
    [2.25, 0.93],
    [TAIL_Z, 0.9],
  ],
  // The side glass stops short of the rear glass, leaving a broad sail of paint: a formal roof, not a fastback.
  windowTop: [
    [-0.32, 0.95],
    [-0.05, 1.08],
    [0.2, 1.185],
    [0.6, 1.215],
    [0.92, 1.2],
    [1.04, 1.1],
    [1.08, 0.97],
  ],
  windowZ: [-0.32, 1.08],
  railWidth: [
    [NOSE_Z, 0.5],
    [-1.5, 0.64],
    [-0.36, 0.74],
    [0.2, 0.69],
    [1.14, 0.69],
    [1.7, 0.8],
    [TAIL_Z, 0.84],
  ],
  tail: [],
  seams: [-0.28, 0.98],
  pillars: [],
  mirror: { z: -0.16, h: 0.98, x: 0.9 },
  rearPlateH: 0.68,
  // Its rear seat is a shelf under the glass, too low to see: the cabin ends behind the front pair.
  rearSeats: false,
  cabinEndZ: 1.2,
  decals: [
    // The rear plate in the middle of the tail panel; the front one is on the bumper, among the blocks.
    ...plates(0.68, 0.4).filter(({ on }) => on === "rear"),
    ...handles([0.78], 0.86),
    ...stripes,
    // Each corner's two stacked lamps in a dark housing ringed in chrome, each housing standing off the one under it.
    { on: "front", at: [0.67, 0.615], size: [0.28, 0.27], surface: "rim", mirror: true, cells: [2, 2], liftM: 0.006 },
    { on: "front", at: [0.67, 0.615], size: [0.24, 0.23], surface: "trim", mirror: true, cells: [2, 2], liftM: 0.01 },
    { on: "front", at: [0.67, 0.668], size: [0.2, 0.07], surface: "lensHead", mirror: true, cells: [3, 1], liftM: 0.015 },
    { on: "front", at: [0.67, 0.562], size: [0.2, 0.07], surface: "lensHead", mirror: true, cells: [3, 1], liftM: 0.015 },
    // The tail panel's ends: the same two stacked bars, red, the lower one with its reversing lamp inboard.
    { on: "rear", at: [0.68, 0.79], size: [0.36, 0.07], surface: "lensTail", mirror: true, cells: [4, 1], liftM: 0.012 },
    { on: "rear", at: [0.72, 0.69], size: [0.28, 0.07], surface: "lensTail", mirror: true, cells: [3, 1], liftM: 0.012 },
    { on: "rear", at: [0.53, 0.69], size: [0.09, 0.07], surface: "lensReverse", mirror: true, cells: [1, 1], liftM: 0.012, fine: true },
    // Side markers, amber at the front and red behind, as the decade's cars carried.
    { on: "side", at: [-2.12, 0.6], size: [0.12, 0.04], surface: "lensAmber", mirror: true, liftM: 0.022, fine: true },
    { on: "side", at: [2.18, 0.62], size: [0.12, 0.04], surface: "lensTail", mirror: true, liftM: 0.022, fine: true },
  ],
  blocks: [
    // Two bright slats across each half of the grille, the decade's chrome.
    { at: [0.31, 0.67, NOSE_Z - 0.012], size: [0.38, 0.014, 0.012], surface: "rim", mirror: true, fine: true },
    { at: [0.31, 0.55, NOSE_Z - 0.012], size: [0.38, 0.014, 0.012], surface: "rim", mirror: true, fine: true },
    // The spine of the body's colour down the middle of the grille.
    { at: [0, 0.61, NOSE_Z - 0.02], size: [0.12, 0.3, 0.06], surface: "paint", taper: [0.85, 1] },
    // The scoop: the spine's ridge standing out of the hood, tall at its mouth and running out towards the screen.
    { at: [0, 0.895, -1.3], size: [0.46, 0.1, 1.0], surface: "paint", taper: [0.8, 0.3] },
    { at: [0, 0.915, -1.808], size: [0.34, 0.04, 0.012], surface: "grille" },
    bumper(NOSE_Z - 0.05, 0.4),
    bumper(TAIL_Z + 0.05, 0.42),
    { at: [0, 0.4, NOSE_Z - 0.108], size: [0.36, 0.085, 0.012], surface: "plate", fine: true },
  ],
  sillSurface: "rim",
  extra: {
    bands: BANDS,
    cleanEnds: true,
    silhouette: [
      // The nose runs one way along the car from its foot up, so no strip of the face folds back over another.
      { z: NOSE_Z + 0.09, h: 0.3, band: "valance" },
      { z: NOSE_Z + 0.02, h: 0.36 },
      { z: NOSE_Z, h: 0.46, band: "mouth" },
      { z: NOSE_Z + 0.002, h: 0.76, band: "gap" },
      { z: NOSE_Z + 0.004, h: 0.77 },
      { z: NOSE_Z + 0.015, h: 0.8 },
      // The long hood, then the screen, the roof and the rear glass down to the short deck, each as one fair line.
      ...faired(
        [
          [NOSE_Z + 0.04, 0.82],
          [-2.2, 0.86],
          [-1.5, 0.882],
          [-0.42, 0.907],
        ],
        [[NOSE_Z + 0.04, undefined]],
      ),
      { z: -0.42, h: 0.907, band: "cowl" },
      { z: -0.36, h: 0.915, band: "screen" },
      // A roof flatter than a modern car's, ending in a formal notch: the rear glass falls steeply to a short deck.
      ...faired(
        [
          [0.2, 1.245],
          [0.68, 1.29],
          [1.14, 1.27],
          [1.42, 1.12],
          [1.7, 0.995],
        ],
        [
          [0.2, undefined],
          [1.16, "rearGlass"],
          [1.66, undefined],
        ],
      ),
      ...faired(
        [
          [1.72, 0.99],
          [2.2, 0.985],
          [TAIL_Z - 0.03, 1.005],
        ],
        [[1.72, undefined]],
      ),
      { z: TAIL_Z - 0.03, h: 1.005, band: "gap" },
      { z: TAIL_Z - 0.02, h: 0.99 },
      { z: TAIL_Z - 0.005, h: 0.9, band: "tailPanel" },
      { z: TAIL_Z, h: 0.6 },
      { z: TAIL_Z - 0.01, h: 0.44, band: "valance" },
      { z: TAIL_Z - 0.07, h: 0.3 },
    ],
    crown: [
      [NOSE_Z, 0.02],
      [-1.5, 0.0],
      [-0.5, 0.01],
      [0.3, 0.05],
      [1.1, 0.05],
      [1.8, 0.02],
      [TAIL_Z, 0.01],
    ],
    halfWidth: [
      [NOSE_Z, 0.9],
      [-2.35, 0.95],
      [-1.5, 0.96],
      [0, 0.95],
      [1.4, 0.97],
      [2.35, 0.96],
      [TAIL_Z, 0.91],
    ],
    sill: [
      [NOSE_Z, 0.22],
      [NOSE_Z + 0.4, 0.205],
      [0, 0.2],
      [TAIL_Z - 0.4, 0.22],
      [TAIL_Z, 0.25],
    ],
    cornerPullM: [0.09, 0.07],
    hoodSeamZ: [-2.45, -0.52],
    exhausts: { x: [-0.56, 0.56], h: 0.26, z: TAIL_Z - 0.02, radius: 0.038, open: true },
  },
};

export const kraft: CarSpec = {
  id: KRAFT.id,
  name: KRAFT.name,
  ride: KRAFT.ride,
  paint: "car-paint-lime",
  paints: [
    paint("car-paint-lime", "solid", { stripe: "car-paint-black" }),
    paint("car-paint-ember", "solid", { stripe: "car-paint-black" }),
    paint("car-paint-bronze", "metallic", { stripe: "car-paint-black" }),
    paint("car-paint-ultramarine", "metallic", { stripe: "car-paint-white" }),
    paint("car-paint-grape", "metallic", { stripe: "car-paint-white" }),
    paint("car-paint-black", "solid", { stripe: "car-paint-signal-red" }),
    paint("car-paint-mustard", "solid", { stripe: "car-paint-black" }),
    paint("car-paint-signal-red", "solid", { stripe: "car-paint-white" }),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: KRAFT.wheelRadiusM, widthM: 0.235, rimShare: 0.6, spokes: 5, twinSpokes: false, style: "blade" },
  shadowHalf: [0.97, TAIL_Z],
  // A 1970s dash: round chrome-ringed dials and a row of small ones in a dark panel with a woodgrain insert, a big
  // thin wheel, broad bench-like seats and a floor lever, lit amber after dark.
  interior: {
    gauges: "classic",
    wheel: "classic",
    shifter: "lever",
    seats: "comfort",
    screen: false,
    turnsToLock: 1.9,
    // Sat a little lower under the low roof, so the headliner is a band over the screen and not a slab across it.
    eye: [0, -0.03, 0],
    // Tan vinyl seats and door cards under a pale headliner, the decade's own, round a black dash with a woodgrain band.
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim-tan", insert: "car-cabin-wood", accent: "car-cabin-metal", glow: "car-cabin-glow-amber", seat: "car-cabin-seat-tan" },
  },
};
