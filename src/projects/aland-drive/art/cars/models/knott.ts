import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { bodyOf, driven, faired, handles, plates, reversing, roundLamps, type Shape } from "../recipe";

const KNOTT = driven("knott");
const { sill, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Klippa's face, as its utility Stubbe wears it, on a tiny car: one dark band across the nose's top, here holding round
 * lamps at its ends, a plain grille between them crossed by a bar of the body's colour; black bumpers with a tow hook.
 * At the tail, lamps stand as narrow uprights low on each corner, under the spare wheel's shoulders.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  /** The face's band: dark housings at each corner for the round lamps, the grille between. */
  face: [
    { surface: "trim", from: belt, to: rail },
    { surface: "grille", from: rail, to: ALL },
  ],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  /** The narrow uprights of light on each corner, the tailgate's paint between them. */
  tallLamp: [{ surface: "lensTail", from: belt, to: rail }],
};

const lamps: Decal[] = [
  ...roundLamps(0.62, 0.865, 0.17),
  // The indicators, small and amber, under each lamp's housing on the bumper's top.
  { on: "front", at: [0.62, 0.725], size: [0.1, 0.03], surface: "lensIndicator", mirror: true, cells: [2, 1], liftM: 0.012 },
];

/** A tiny four-by-four: a narrow upright box on big wheels, a short hood, an upright screen, flared arches and a spare wheel hung on its tailgate. */
const shape: Shape = {
  trackM: KNOTT.trackM,
  axleZ: KNOTT.axleZ,
  wheelRadiusM: KNOTT.wheelRadiusM,
  tyreWidthM: 0.21,
  noseZ: -1.78,
  tailZ: 1.66,
  halfWidth: 0.79,
  sillH: 0.4,
  rearSillH: 0.42,
  flareM: 0,
  archClearM: 0.06,
  sillSurface: "cladding",
  grilleH: 0.74,
  lampH: [0.76, 0.98],
  hoodLipH: 1.0,
  hoodH: 1.04,
  cowl: [-0.92, 1.08],
  header: [-0.68, 1.68],
  roof: [0.3, 1.76],
  roofEnd: [1.5, 1.74],
  cornerPullM: [0.08, 0.05],
  shoulder: [
    [-1.78, 0.88],
    [-1.12, 0.96],
    [0, 0.98],
    [1.12, 0.985],
    [1.66, 0.98],
  ],
  belt: [
    [-1.78, 0.94],
    [-1.12, 1.03],
    [-0.92, 1.07],
    [0.3, 1.09],
    [1.66, 1.1],
  ],
  windowTop: [
    [-0.88, 1.12],
    [-0.77, 1.42],
    [-0.6, 1.645],
    [0.3, 1.675],
    [1.45, 1.67],
    [1.52, 1.62],
  ],
  windowZ: [-0.88, 1.52],
  railWidth: [
    [-1.78, 0.44],
    [-1.12, 0.6],
    [-0.92, 0.68],
    [-0.5, 0.7],
    [1.0, 0.7],
    [1.5, 0.69],
    [1.66, 0.62],
  ],
  tail: [],
  seams: [-0.9, 0.24],
  pillars: [[0.26, 0.36]],
  mirror: { z: -0.7, h: 1.18, x: 0.72 },
  rearPlateH: 0.6,
  rearSeats: true,
  cabinEndZ: 1.3,
  decals: [
    ...plates(0.6, 0.6),
    ...handles([0.06], 1.0),
    ...lamps,
    // The bar of the body's colour across the grille, from housing to housing: Klippa's.
    { on: "front", at: [0, 0.875], size: [0.66, 0.04], surface: "paint", cells: [4, 1], liftM: 0.014 },
    reversing(0.5, 0.62),
    // The side repeaters on the front wings.
    { on: "side", at: [-1.5, 0.9], size: [0.05, 0.02], surface: "lensIndicator", mirror: true, liftM: 0.01, fine: true },
    // The third brake lamp at the top of the tailgate's glass.
    { on: "rear", at: [0, 1.63], size: [0.3, 0.025], surface: "lensTail", cells: [3, 1], liftM: 0.012, fine: true },
  ],
  blocks: [
    // The tow hook, red, off centre under the front bumper, and one under the rear.
    { at: [0.3, 0.52, -1.82], size: [0.06, 0.05, 0.08], surface: "lensTail", fine: true },
    { at: [-0.3, 0.52, 1.7], size: [0.06, 0.05, 0.08], surface: "lensTail", fine: true },
    // The spare wheel's carrier: a dark plate on the tailgate behind the tyre's middle.
    { at: [0, 1.06, 1.69], size: [0.3, 0.3, 0.04], surface: "trim" },
    // Drip rails along the roof's edges, as an old working body has.
    { at: [0.705, 1.715, 0.4], size: [0.02, 0.025, 2.0], surface: "trim", mirror: true, fine: true },
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // The nose, foot to brow, one way along the car: the bumper stands out of the face.
      { z: -1.82, h: 0.48, band: "bumper" },
      { z: -1.82, h: 0.7, band: "bumper" },
      { z: -1.775, h: 0.71, band: "gap" },
      { z: -1.77, h: 0.74, band: "face" },
      { z: -1.76, h: 0.98 },
      // A short hood, then the upright screen, flat roof and tailgate's glass, each as one fair line.
      ...faired(
        [
          [-1.74, 1.0],
          [-1.3, 1.035],
          [-0.97, 1.06],
        ],
        [[-1.74, undefined]],
      ),
      { z: -0.97, h: 1.06, band: "cowl" },
      ...faired(
        [
          [-0.92, 1.08],
          [-0.8, 1.38],
          [-0.68, 1.68],
          [-0.5, 1.745],
          [0.3, 1.76],
          [1.2, 1.76],
          [1.56, 1.745],
        ],
        [
          [-0.92, "screen"],
          [-0.68, undefined],
        ],
      ),
      { z: 1.56, h: 1.745, band: "rearGlass" },
      { z: 1.64, h: 1.24 },
      { z: 1.645, h: 0.98, band: "tallLamp" },
      { z: 1.65, h: 0.68, band: "gap" },
      { z: 1.655, h: 0.665, band: "bumper" },
      { z: 1.7, h: 0.65, band: "bumper" },
      { z: 1.7, h: 0.5 },
    ],
    crown: [
      [-1.78, 0.01],
      [-1.12, -0.005],
      [-0.92, 0.0],
      [-0.6, 0.025],
      [0.5, 0.03],
      [1.66, 0.025],
    ],
    halfWidth: [
      [-1.78, 0.72],
      [-1.62, 0.775],
      [-1.12, 0.79],
      [0, 0.785],
      [1.12, 0.79],
      [1.52, 0.785],
      [1.66, 0.75],
    ],
    hoodSeamZ: [-1.65, -1.0],
    cleanEnds: true,
    archLipM: 0.06,
    spare: { x: 0, h: 1.06, z: 1.715, radius: 0.33, wide: 0.2 },
  },
};

export const knott: CarSpec = {
  id: KNOTT.id,
  name: KNOTT.name,
  ride: KNOTT.ride,
  paint: "car-paint-khaki",
  paints: [
    paint("car-paint-khaki"),
    paint("car-paint-white"),
    paint("car-paint-signal-red"),
    paint("car-paint-midnight"),
    paint("car-paint-olive", "matte"),
    paint("car-paint-orange"),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: KNOTT.wheelRadiusM, widthM: 0.21, rimShare: 0.56, spokes: 6, twinSpokes: false, style: "aero" },
  shadowHalf: [0.82, 1.9],
  /** A bare working cockpit: a painted metal dash, two plain dials, a plain black wheel, simple seats, no screen. */
  interior: {
    gauges: "analogue",
    centreDisplay: true,
    wheel: "round",
    shifter: "lever",
    seats: "comfort",
    screen: false,
    paintedDash: true,
    turnsToLock: 1.7,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-trim", headliner: "car-cabin-headliner-dark", accent: "car-cabin-metal", glow: "car-cabin-glow-amber" },
  },
};
