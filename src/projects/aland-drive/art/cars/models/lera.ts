import { ROWS, type Band, type Block, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const LERA = driven("lera");
const { sill, sillTop, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * The road car Ödmark built so Hagel could rally, wearing the family face for the road: slit lamps at the upper corners
 * of a dark mouth, a bar of the body's colour across it carrying the plate, and the square driving lamps low in the
 * intake under it, so it shows four eyes at night; a tail of two square lamps joined by a dark bar with a square fog
 * lamp in its middle; and the works livery thinned to a road car's, twin stripes either side of the bonnet's scoop and
 * over the roof, and a narrow band over a pinstripe down each door.
 *
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`).
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  /** A road car's bumpers are in the body's colour, with a dark lip along their foot. */
  chin: [{ surface: "cladding", from: sill, to: sillTop }],
  /** The intake low in the bumper, its outer ends in the body's colour where the driving lamps stand. */
  intake: [
    { surface: "cladding", from: sill, to: sillTop },
    { surface: "grille", from: windowBase, to: ALL },
  ],
  /** The mouth under the lamps, the whole width between them. */
  mouth: [{ surface: "grille", from: sillTop, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  headDark: [
    { surface: "trim", from: belt, to: rail },
    { surface: "grille", from: rail, to: ALL },
  ],
  /** A slit lamp at each upper corner, the dark of the mouth between them. */
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
  valance: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** The road livery: twin stripes either side of the bonnet's scoop and over the roof, and a narrow band over a pinstripe down each door. Lifted clear of the curved panels they lie on. */
const livery = (): Decal[] => [
  { on: "top", at: [0.29, -1.33], size: [0.085, 1.08], surface: "stripe", mirror: true, cells: [1, 4], liftM: 0.016 },
  { on: "top", at: [0.29, 0.58], size: [0.085, 1.42], surface: "stripe", mirror: true, cells: [1, 4], liftM: 0.012 },
  { on: "side", at: [0.07, 0.615], size: [1.56, 0.065], surface: "stripe", mirror: true, cells: [5, 1], liftM: 0.01 },
  { on: "side", at: [0.07, 0.55], size: [1.56, 0.018], surface: "stripe", mirror: true, cells: [5, 1], liftM: 0.01 },
];

/** The bonnet's scoop: a shaped intake standing out of the bonnet over the intercooler, its mouth dark. */
const scoop: Block[] = [
  { at: [0, 0.808, -1.08], size: [0.36, 0.07, 0.42], surface: "paint", taper: [0.84, 0.25] },
  { at: [0, 0.81, -1.295], size: [0.28, 0.04, 0.02], surface: "grille", fine: true },
];

/** The roof spoiler at the top of the tailgate, a modest lip in the body's colour, and the fins it stands on. */
const spoiler: Block[] = [
  { at: [0, 1.402, 1.5], size: [1.08, 0.034, 0.26], surface: "paint", taper: [0.96, 0.55] },
  { at: [0.5, 1.36, 1.49], size: [0.026, 0.07, 0.2], surface: "paint", mirror: true, taper: [1, 0.5], fine: true },
];

/** Two square tailpipes side by side in one polished frame: Ödmark's square exhaust, made a pair for the road car's sports silencer. */
const exhaust: Block[] = [
  { at: [0.42, 0.372, 1.985], size: [0.2, 0.012, 0.08], surface: "rim", fine: true },
  { at: [0.42, 0.288, 1.985], size: [0.2, 0.012, 0.08], surface: "rim", fine: true },
  ...[0.326, 0.42, 0.514].map((x): Block => ({ at: [x, 0.33, 1.9835], size: [0.012, 0.096, 0.077], surface: "rim", fine: true })),
  { at: [0.373, 0.33, 1.98], size: [0.08, 0.07, 0.06], surface: "gap", fine: true },
  { at: [0.467, 0.33, 1.98], size: [0.08, 0.07, 0.06], surface: "gap", fine: true },
];

/** A rally-bred road hatch, short and wide: blistered arches over a pinched waist, an upright tailgate behind a thick C-pillar, a scoop and a modest spoiler. */
const shape: Shape = {
  trackM: LERA.trackM,
  axleZ: LERA.axleZ,
  wheelRadiusM: LERA.wheelRadiusM,
  tyreWidthM: 0.225,
  noseZ: -2.01,
  tailZ: 2.01,
  halfWidth: 0.925,
  sillH: 0.19,
  flareM: 0.045,
  archClearM: 0.06,
  grilleH: 0.4,
  lampH: [0.6, 0.672],
  hoodLipH: 0.69,
  hoodH: 0.8,
  cowl: [-0.68, 0.9],
  header: [-0.1, 1.36],
  roof: [0.45, 1.43],
  roofEnd: [1.4, 1.39],
  shoulder: [
    [-2.01, 0.52],
    [-1.7, 0.7],
    [-1.28, 0.79],
    [-0.68, 0.81],
    [0.3, 0.83],
    [1.27, 0.87],
    [2.01, 0.85],
  ],
  belt: [
    [-2.01, 0.58],
    [-1.7, 0.76],
    [-1.28, 0.85],
    [-0.68, 0.89],
    [0.3, 0.91],
    [1.27, 0.95],
    [2.01, 0.93],
  ],
  windowTop: [
    [-0.64, 0.93],
    [-0.35, 1.1],
    [-0.1, 1.26],
    [0.45, 1.33],
    [0.9, 1.31],
    [1.2, 1.25],
    [1.42, 1.16],
  ],
  windowZ: [-0.64, 1.2],
  railWidth: [
    [-2.01, 0.5],
    [-1.28, 0.72],
    [-0.68, 0.75],
    [-0.1, 0.67],
    [0.5, 0.65],
    [1.4, 0.63],
    [2.01, 0.64],
  ],
  tail: [],
  seams: [-0.6, 0.4],
  pillars: [[0.4, 0.5]],
  mirror: { z: -0.45, h: 0.98, x: 0.83 },
  rearPlateH: 0.68,
  rearSeats: true,
  cabinEndZ: 1.3,
  decals: [
    ...plates(0.68, 0.455),
    ...handles([0.24], 0.88),
    ...livery(),
    reversing(0.25, 0.575),
  ],
  blocks: [
    // Ödmark's square driving lamps, low in the bumper at the intake's ends.
    { at: [0.44, 0.348, -1.992], size: [0.11, 0.084, 0.04], surface: "trim", mirror: true, fine: true },
    { at: [0.44, 0.348, -2.006], size: [0.085, 0.06, 0.03], surface: "lensHead", mirror: true },
    // The fog lamp in the middle of the tail's dark bar, square as the lamps either side of it.
    { at: [0, 0.868, 1.87], size: [0.07, 0.07, 0.04], surface: "lensTail", fine: true },
    ...scoop,
    ...spoiler,
    ...exhaust,
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    outwardBlocks: true,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.012, h: 0.24, band: "chin" },
      { z: -2.01, h: 0.3, band: "intake" },
      // A bar of the body's colour across the face, carrying the plate, so the nose is a mouth and an intake, not one dark slab.
      { z: -2.008, h: 0.395 },
      { z: -2.005, h: 0.515, band: "mouth" },
      { z: -2.0, h: 0.585, band: "gap", fine: true },
      { z: -1.998, h: 0.59, band: "headDark" },
      { z: -1.99, h: 0.6, band: "headLamp" },
      { z: -1.98, h: 0.672, band: "headDark" },
      ...faired(
        [
          [-1.976, 0.69],
          [-1.65, 0.76],
          [-1.2, 0.81],
          [-0.72, 0.885],
        ],
        [[-1.976, undefined]],
      ),
      { z: -0.72, h: 0.885, band: "cowl" },
      ...faired(
        [
          [-0.68, 0.9],
          [-0.38, 1.12],
          [-0.1, 1.36],
          [0.45, 1.43],
          [1.0, 1.42],
          [1.4, 1.39],
        ],
        [
          [-0.68, "screen"],
          [-0.1, undefined],
        ],
      ),
      { z: 1.4, h: 1.39, band: "rearGlass" },
      { z: 1.73, h: 1.0 },
      { z: 1.83, h: 0.975, band: "gap", fine: true },
      { z: 1.84, h: 0.97, band: "tailDark" },
      { z: 1.855, h: 0.95, band: "tailLamp" },
      { z: 1.872, h: 0.785, band: "tailDark", fine: true },
      { z: 1.882, h: 0.765 },
      { z: 1.95, h: 0.58 },
      { z: 1.993, h: 0.4, band: "valance" },
      { z: 2.01, h: 0.27 },
    ],
    sill: [
      [-2.01, 0.2],
      [-1.7, 0.2],
      [0, 0.19],
      [1.7, 0.21],
      [2.01, 0.23],
    ],
    crown: [
      [-2.01, 0.01],
      [-1.28, -0.015],
      [-0.8, 0.0],
      [-0.3, 0.045],
      [0.3, 0.06],
      [1.4, 0.06],
      [2.01, 0.03],
    ],
    shelf: [
      [-2.01, 0],
      [-1.28, 0.05],
      [-0.68, 0.07],
      [0.3, 0.085],
      [1.0, 0.1],
      [1.5, 0.1],
      [2.01, 0.05],
    ],
    halfWidth: [
      [-2.01, 0.79],
      [-1.75, 0.9],
      [-1.28, 0.925],
      [-0.7, 0.885],
      [0.25, 0.872],
      [1.27, 0.925],
      [1.8, 0.912],
      [2.01, 0.84],
    ],
    hoodSeamZ: [-1.9, -0.76],
    cornerPullM: [0.13, 0.09],
  },
};

export const lera: CarSpec = {
  id: LERA.id,
  name: LERA.name,
  ride: LERA.ride,
  paint: "car-paint-white",
  paints: [
    paint("car-paint-white", "solid", { stripe: "car-paint-orange" }),
    paint("car-paint-ultramarine", "metallic", { stripe: "car-paint-white" }),
    paint("car-paint-signal-red", "solid", { stripe: "car-paint-white" }),
    paint("car-paint-black", "solid", { stripe: "car-paint-orange" }),
    paint("car-paint-silver", "metallic", { stripe: "car-paint-black" }),
    paint("car-paint-copper", "metallic", { stripe: "car-paint-black" }),
  ],
  body: bodyOf(shape),
  /** A road car's cabin with the rally team's touches: buckets in Ödmark-orange stitching, a three-spoke wheel, two analogue dials and the turbo's boost gauge between them. */
  interior: {
    gauges: "analogue",
    wheel: "round",
    shifter: "lever",
    seats: "bucket",
    screen: false,
    cage: false,
    boost: true,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-insert", headliner: "car-cabin-headliner-dark", accent: "car-cabin-metal", glow: "car-cabin-glow-amber", stitch: "car-cabin-odmark" },
  },
  wheel: { radiusM: LERA.wheelRadiusM, widthM: 0.225, rimShare: 0.64, spokes: 8, twinSpokes: false, style: "mesh" },
  shadowHalf: [0.925, 2.01],
};
