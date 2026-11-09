import { ROWS, type Band, type Block, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const RIMFROST = driven("rimfrost");
const { sill, sillTop, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Ödmark's face in its 1990s form, between Frost's bolted-on squares and Hagel's slits: the full-width dark mouth now
 * the bumper's, under a bar of the body's colour, flush square-cornered headlamps at the upper corners with a slim
 * dark grille between them, and the pair of square driving lamps low in the mouth. The tail is two square lamps joined
 * by a dark bar across the boot lid. The works livery: twin stripes over the bonnet, roof and boot, and down each flank
 * a band over a pinstripe, as Frost before it and Hagel after it wear.
 *
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`).
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  mouth: [{ surface: "grille", from: sillTop, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  /** The upper corners, dark round the flush square headlamps, a slim dark grille between them. */
  headDark: [
    { surface: "trim", from: belt, to: rail },
    { surface: "grille", from: rail, to: ALL },
  ],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  /** The dark bar across the boot lid that joins the square tail lamps. */
  tailLamp: [{ surface: "trim", from: belt, to: ALL }],
};

const NOSE_Z = -2.21;
const TAIL_Z = 2.21;

/** The works livery in its 1990s form: twin stripes over bonnet, roof and boot, and a band over a pinstripe down each flank. */
const livery = (): Decal[] => [
  { on: "top", at: [0.12, -1.46], size: [0.12, 1.36], surface: "stripe", mirror: true, cells: [1, 4], liftM: 0.016 },
  { on: "top", at: [0.12, 0.42], size: [0.12, 1.0], surface: "stripe", mirror: true, cells: [1, 4], liftM: 0.012 },
  { on: "top", at: [0.12, 1.8], size: [0.12, 0.62], surface: "stripe", mirror: true, cells: [1, 3], liftM: 0.014 },
  { on: "side", at: [0, 0.58], size: [1.78, 0.12], surface: "stripe", mirror: true, cells: [8, 1], liftM: 0.01 },
  { on: "side", at: [0, 0.49], size: [1.78, 0.022], surface: "stripe", mirror: true, cells: [8, 1], liftM: 0.01 },
];

/** The bonnet scoop over the intercooler: a low, wide intake standing out of the bonnet, its mouth dark. */
const scoop: Block[] = [
  { at: [0, 0.905, -1.02], size: [0.5, 0.06, 0.42], surface: "paint", taper: [0.85, 0.2] },
  { at: [0, 0.91, -1.225], size: [0.42, 0.04, 0.02], surface: "grille", fine: true },
];

/** A four-door 1990s rally saloon: an upright cabin with a notch and a boot, a bonnet scoop and a tall wing on the boot. */
const shape: Shape = {
  trackM: RIMFROST.trackM,
  axleZ: RIMFROST.axleZ,
  wheelRadiusM: RIMFROST.wheelRadiusM,
  tyreWidthM: 0.215,
  noseZ: NOSE_Z,
  tailZ: TAIL_Z,
  halfWidth: 0.88,
  sillH: 0.2,
  flareM: 0.035,
  archClearM: 0.06,
  grilleH: 0.4,
  lampH: [0.6, 0.72],
  hoodLipH: 0.75,
  hoodH: 0.86,
  cowl: [-0.76, 0.94],
  header: [-0.1, 1.38],
  roof: [0.4, 1.42],
  roofEnd: [0.92, 1.39],
  shoulder: [
    [NOSE_Z, 0.56],
    [-1.9, 0.72],
    [-1.32, 0.8],
    [-0.76, 0.84],
    [0.3, 0.86],
    [1.3, 0.9],
    [TAIL_Z, 0.9],
  ],
  belt: [
    [NOSE_Z, 0.62],
    [-1.9, 0.78],
    [-1.32, 0.86],
    [-0.76, 0.9],
    [0.3, 0.93],
    [1.3, 0.97],
    [TAIL_Z, 0.97],
  ],
  windowTop: [
    [-0.72, 0.97],
    [-0.4, 1.17],
    [-0.08, 1.33],
    [0.4, 1.36],
    [0.9, 1.33],
    [1.2, 1.16],
    [1.36, 1.03],
  ],
  windowZ: [-0.72, 1.36],
  railWidth: [
    [NOSE_Z, 0.5],
    [-1.32, 0.7],
    [-0.76, 0.74],
    [-0.1, 0.68],
    [0.4, 0.67],
    [0.95, 0.67],
    [1.5, 0.72],
    [TAIL_Z, 0.74],
  ],
  tail: [],
  seams: [-0.66, 0.3, 1.12],
  pillars: [[0.3, 0.37]],
  mirror: { z: -0.56, h: 1.02, x: 0.83 },
  rearPlateH: 0.66,
  rearSeats: true,
  cabinEndZ: 1.2,
  decals: [
    ...plates(0.66, 0.33),
    ...handles([-0.1, 0.78], 0.9),
    ...livery(),
    reversing(0.24, 0.47),
  ],
  blocks: [
    // Flush headlamps at the upper corners, square-cornered and wider than tall, in a thin dark frame.
    { at: [0.58, 0.65, -2.198], size: [0.27, 0.135, 0.02], surface: "trim", mirror: true, fine: true },
    { at: [0.58, 0.65, -2.206], size: [0.25, 0.115, 0.02], surface: "lensHead", mirror: true },
    // Each headlamp split in two square cells, main and high beam: Ödmark's four eyes in their 1990s form.
    { at: [0.6, 0.65, -2.221], size: [0.014, 0.125, 0.008], surface: "trim", mirror: true, fine: true },
    // Two square tail lamps in the boot lid's dark bar, and the fog lamp's square between them.
    { at: [0.6, 0.935, 2.142], size: [0.26, 0.15, 0.03], surface: "lensTail", mirror: true },
    { at: [0, 0.935, 2.136], size: [0.06, 0.06, 0.02], surface: "lensTail", fine: true },
    // Ödmark's square driving lamps, low in the mouth.
    { at: [0.54, 0.36, -2.208], size: [0.13, 0.1, 0.04], surface: "trim", mirror: true, fine: true },
    { at: [0.54, 0.36, -2.22], size: [0.105, 0.075, 0.03], surface: "lensHead", mirror: true },
    ...scoop,
    // Black rubber mud flaps behind each wheel, as the road cars were sold with for the gravel.
    { at: [0.72, 0.19, -0.92], size: [0.22, 0.26, 0.012], surface: "cladding", mirror: true },
    { at: [0.72, 0.19, 1.7], size: [0.22, 0.26, 0.012], surface: "cladding", mirror: true },
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: NOSE_Z - 0.002, h: 0.24, band: "bumper" },
      { z: NOSE_Z, h: 0.3, band: "mouth" },
      // The bumper's top, a bar of the body's colour across the mouth.
      { z: NOSE_Z + 0.004, h: 0.45 },
      { z: NOSE_Z + 0.008, h: 0.52, band: "mouth" },
      { z: NOSE_Z + 0.012, h: 0.58, band: "headDark" },
      ...faired(
        [
          [NOSE_Z + 0.03, 0.74],
          [-1.9, 0.81],
          [-1.32, 0.87],
          [-0.82, 0.925],
        ],
        [[NOSE_Z + 0.03, undefined]],
      ),
      { z: -0.82, h: 0.925, band: "cowl" },
      ...faired(
        [
          [-0.76, 0.94],
          [-0.42, 1.18],
          [-0.1, 1.38],
          [0.4, 1.42],
          [0.92, 1.39],
        ],
        [
          [-0.76, "screen"],
          [-0.1, undefined],
        ],
      ),
      { z: 0.92, h: 1.39, band: "rearGlass" },
      ...faired(
        [
          [1.5, 1.02],
          [1.8, 1.04],
          [2.1, 1.03],
        ],
        [[1.5, undefined]],
      ),
      { z: 2.1, h: 1.03, band: "gap", fine: true },
      { z: 2.11, h: 1.025, band: "tailDark" },
      { z: 2.125, h: 1.005, band: "tailLamp" },
      { z: 2.14, h: 0.86, band: "tailDark", fine: true },
      { z: 2.15, h: 0.84 },
      { z: 2.19, h: 0.55, band: "bumper" },
      { z: TAIL_Z, h: 0.3 },
    ],
    sill: [
      [NOSE_Z, 0.2],
      [-1.9, 0.2],
      [0, 0.2],
      [1.9, 0.22],
      [TAIL_Z, 0.26],
    ],
    crown: [
      [NOSE_Z, 0.0],
      [-1.32, 0.0],
      [-0.8, 0.02],
      [-0.2, 0.055],
      [0.4, 0.06],
      [1.3, 0.04],
      [TAIL_Z, 0.01],
    ],
    halfWidth: [
      [NOSE_Z, 0.76],
      [-2.0, 0.85],
      [-1.32, 0.88],
      [-0.7, 0.865],
      [0.3, 0.86],
      [1.3, 0.88],
      [2.0, 0.865],
      [TAIL_Z, 0.8],
    ],
    hoodSeamZ: [-2.1, -0.86],
    wing: { z: 2.0, h: 1.27, halfWidth: 0.8, chord: 0.22, rise: 0.05, endplates: true, stayM: 0.24 },
    exhausts: { x: [0.5], h: 0.29, z: TAIL_Z - 0.05, radius: 0.045, open: true },
    cornerPullM: [0.05, 0.05],
  },
};

export const rimfrost: CarSpec = {
  id: RIMFROST.id,
  name: RIMFROST.name,
  ride: RIMFROST.ride,
  paint: "car-paint-white",
  paints: [
    paint("car-paint-white", "solid", { stripe: "car-paint-orange" }),
    paint("car-paint-signal-red", "solid", { stripe: "car-paint-white" }),
    paint("car-paint-black", "solid", { stripe: "car-paint-orange" }),
    paint("car-paint-silver", "metallic", { stripe: "car-paint-signal-red" }),
    paint("car-paint-racing-green", "metallic", { stripe: "car-paint-white" }),
    paint("car-paint-teal", "metallic", { stripe: "car-paint-white" }),
  ],
  body: bodyOf(shape),
  /** A 1990s saloon's cockpit, as it left the factory: two analogue dials, a three-spoke wheel, a boost gauge where a stereo would be, cloth buckets, no cage. */
  interior: {
    gauges: "analogue",
    wheel: "round",
    shifter: "lever",
    seats: "bucket",
    screen: false,
    cage: false,
    stackBoost: 1.2,
    clusterSight: 0.8,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-insert", headliner: "car-cabin-headliner", accent: "car-cabin-metal", glow: "car-cabin-glow-amber", seat: "car-cabin-seat-cloth" },
    turnsToLock: 1.3,
  },
  /** The period's polished six-spoke alloys. */
  wheel: { radiusM: RIMFROST.wheelRadiusM, widthM: 0.215, rimShare: 0.66, spokes: 6, twinSpokes: true, style: "split" },
  shadowHalf: [0.88, TAIL_Z],
};
