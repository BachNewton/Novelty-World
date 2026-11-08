import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, louvres, projectors, sideIntake, splitter } from "../parts";
import { bodyOf, driven, faired, handles, plates, type Shape } from "../recipe";

const ASKA = driven("aska");
const { sill, sillTop, belt, windowBase, rail, roofInner, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Tärna's signature: a line of light the whole width of each end, turned down at its outer ends into a short fang,
 * so the car reads as a bracket of light from in front and behind, by day and by night.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** Two intakes either side of a painted nose. */
  mouth: [{ surface: "grille", from: sillTop, to: rail }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  headDark: [{ surface: "trim", from: belt, to: rail }],
  headLamp: [{ surface: "lensHead", from: windowBase, to: ALL }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  /** The engine cover: a painted spine between two dark vents, which the louvres cross. */
  deck: [{ surface: "grille", from: rail, to: roofInner }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  tailBar: [{ surface: "lensTail", from: windowBase, to: ALL }],
  /** The tail's mesh, the engine behind it. */
  mesh: [{ surface: "grille", from: rail, to: ALL }],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** The bracket's fang at each outer end: a lens turned down from the line, in a dark housing that frames it. */
const fangs = (on: "front" | "rear", h: number, surface: Decal["surface"]): Decal[] => [
  { on, at: [0.83, h], size: [0.06, 0.11], surface: "trim", mirror: true, cells: [2, 4], liftM: 0.008, fine: true },
  { on, at: [0.835, h - 0.005], size: [0.03, 0.095], surface, mirror: true, cells: [1, 4], liftM: 0.016 },
];

/** A hybrid hypercar, very low and wide, its cabin pushed forward over a long engine cover, intakes ahead of its rear wheels. */
const shape: Shape = {
  trackM: ASKA.trackM,
  axleZ: ASKA.axleZ,
  wheelRadiusM: ASKA.wheelRadiusM,
  tyreWidthM: 0.3,
  noseZ: -2.31,
  tailZ: 2.31,
  halfWidth: 1.03,
  sillH: 0.11,
  flareM: 0.03,
  archClearM: 0.035,
  grilleH: 0.36,
  lampH: [0.42, 0.44],
  hoodLipH: 0.47,
  hoodH: 0.68,
  cowl: [-0.86, 0.76],
  header: [-0.25, 1.1],
  roof: [0.15, 1.15],
  roofEnd: [0.5, 1.12],
  shoulder: [
    [-2.31, 0.38],
    [-1.9, 0.6],
    [-1.33, 0.775],
    [-0.86, 0.72],
    [-0.3, 0.7],
    [0.4, 0.755],
    [1.39, 0.82],
    [2.31, 0.765],
  ],
  belt: [
    [-2.31, 0.42],
    [-1.9, 0.64],
    [-1.33, 0.81],
    [-0.86, 0.75],
    [-0.3, 0.73],
    [0.4, 0.79],
    [1.39, 0.85],
    [2.31, 0.8],
  ],
  windowTop: [
    [-0.83, 0.78],
    [-0.55, 0.92],
    [-0.2, 1.05],
    [0.15, 1.09],
    [0.45, 1.05],
    [0.7, 0.96],
    [0.95, 0.87],
  ],
  windowZ: [-0.83, 0.95],
  railWidth: [
    [-2.31, 0.6],
    [-1.33, 0.86],
    [-0.86, 0.74],
    [-0.3, 0.58],
    [0.2, 0.55],
    [0.7, 0.6],
    [1.39, 0.8],
    [2.31, 0.84],
  ],
  tail: [],
  seams: [-0.72, 0.4],
  pillars: [[0.5, 0.56]],
  mirror: { z: -0.5, h: 0.87, x: 0.84 },
  rearPlateH: 0.66,
  rearSeats: false,
  cabinEndZ: 0.72,
  decals: [
    ...plates(0.6, 0.3, { recessed: true }),
    ...handles([0.1], 0.72),
    ...fangs("front", 0.39, "lensHead"),
    ...fangs("rear", 0.795, "lensTail"),
    ...projectors({ x: [0.56, 0.68], h: 0.405, size: 0.042 }),
    sideIntake({ z: 0.75, h: 0.5, long: 0.42, tall: 0.28 }),
    ...louvres({ x: 0.74, z: -1.08, long: 0.32, wide: 0.2, count: 5 }),
  ],
  blocks: [
    // A blade of the body's colour across each intake, so it reads as a shaped duct and not a hole.
    { at: [0.955, 0.52, 0.76], size: [0.05, 0.03, 0.46], surface: "paint", mirror: true, taper: [1, 0.7] },
    // The intake's lip over it and its walls at each end, standing out of the scooped flank, so it reads as a duct.
    { at: [0.945, 0.655, 0.75], size: [0.07, 0.018, 0.5], surface: "paint", mirror: true, taper: [1, 0.6] },
    { at: [0.93, 0.5, 0.515], size: [0.06, 0.3, 0.016], surface: "paint", mirror: true },
    { at: [0.92, 0.5, 0.985], size: [0.06, 0.3, 0.016], surface: "paint", mirror: true },
    // The corner intakes in the nose, each with a blade across it.
    { at: [0.66, 0.32, -2.18], size: [0.14, 0.022, 0.1], surface: "paint", mirror: true },
    splitter({ z: -2.345, h: 0.26, halfWidth: 0.5, long: 0.2 }), ...diffuser({ z: 1.9, tailZ: 2.28, h: 0.2, x: [0, 0.26, 0.52] }),
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.315, h: 0.25, band: "bumper" },
      { z: -2.31, h: 0.27, band: "mouth" },
      { z: -2.31, h: 0.37, band: "gap" },
      { z: -2.3, h: 0.375, band: "headDark" },
      // The line of light is a lens set back in its housing, deep enough to read as a lamp and not a stripe.
      { z: -2.272, h: 0.42, band: "headLamp" },
      { z: -2.27, h: 0.448, band: "headDark" },
      // The hood, then the screen, roof, rear glass and engine cover, each as one fair line.
      ...faired(
        [
          [-2.265, 0.465],
          [-1.9, 0.56],
          [-1.4, 0.645],
          [-0.92, 0.74],
        ],
        [[-2.265, undefined]],
      ),
      { z: -0.92, h: 0.74, band: "cowl" },
      ...faired(
        [
          [-0.86, 0.76],
          [-0.5, 0.97],
          [-0.15, 1.12],
          [0.2, 1.15],
          [0.55, 1.1],
          [1.0, 0.985],
          [1.6, 0.92],
          [2.2, 0.88],
        ],
        [
          [-0.86, "screen"],
          [-0.25, undefined],
          [0.5, "rearGlass"],
          [0.85, "deck"],
          [1.95, undefined],
        ],
      ),
      { z: 2.2, h: 0.88, band: "gap" },
      { z: 2.21, h: 0.865, band: "tailDark" },
      { z: 2.225, h: 0.845, band: "tailBar" },
      { z: 2.235, h: 0.825, band: "tailDark" },
      { z: 2.245, h: 0.79, band: "mesh" },
      { z: 2.28, h: 0.56 },
      { z: 2.305, h: 0.4, band: "diffuser" },
      { z: 2.31, h: 0.22 },
    ],
    crown: [
      [-2.31, 0.02],
      [-1.9, -0.06],
      [-1.33, -0.13],
      [-0.95, -0.05],
      [-0.7, 0.04],
      [0.2, 0.05],
      [0.8, 0.03],
      [1.39, -0.1],
      [2.0, -0.07],
      [2.31, 0.01],
    ],
    shelf: [
      [-2.31, 0],
      [-1.33, 0.03],
      [-0.86, 0.12],
      [-0.3, 0.3],
      [0.4, 0.32],
      [1.0, 0.2],
      [1.6, 0.08],
      [2.31, 0.02],
    ],
    halfWidth: [
      [-2.31, 0.8],
      [-2.0, 0.96],
      [-1.33, 1.02],
      [-0.6, 0.97],
      [0.3, 0.99],
      [1.39, 1.03],
      [2.0, 1.0],
      [2.31, 0.9],
    ],
    hoodSeamZ: [-2.1, -1.0],
    cleanEnds: true,
    scoop: [
      [-1.0, 0],
      [-0.2, 0.02],
      [0.5, 0.05],
      [0.85, 0.06],
      [1.02, 0],
    ],
    wing: { z: 2.02, h: 0.99, halfWidth: 0.82, chord: 0.17, rise: 0.04, endplates: true },
    exhausts: { x: [-0.09, 0.09], h: 0.58, z: 2.27, radius: 0.045 },
  },
};

export const aska: CarSpec = {
  id: ASKA.id,
  name: ASKA.name,
  ride: ASKA.ride,
  paint: "car-paint-aska",
  paints: [
    paint("car-paint-aska", "metallic"),
    paint("car-paint-glacier", "metallic"),
    paint("car-paint-ivory", "pearl", { flip: "car-paint-ivory-flip" }),
    paint("car-paint-signal-red"),
    paint("car-paint-lime"),
    paint("car-paint-graphite", "matte"),
  ],
  body: bodyOf(shape),
  /** A hypercar's cockpit: one digital cluster, a flat-bottomed wheel, buckets, carbon with Tärna blue on the doors and round the vents. */
  interior: {
    gauges: "digital",
    wheel: "flat",
    shifter: "selector",
    seats: "bucket",
    screen: true,
    colours: { dash: "car-cabin-carbon", trim: "car-cabin-carbon", insert: "car-cabin-tarna", headliner: "car-cabin-headliner-dark", accent: "car-cabin-tarna", glow: "car-cabin-glow-ice" },
  },
  wheel: { radiusM: ASKA.wheelRadiusM, widthM: 0.3, rimShare: 0.76, spokes: 10, twinSpokes: false, style: "turbine" },
  shadowHalf: [1.03, 2.31],
};
