import { ROWS, type Band, type Block, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const HOLM = driven("holm");
const { sill, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Klippa's face, as Stubbe and Knott wear it, on the maker's working pickup: one dark band across the nose's top with a
 * square lamp at each end and a plain grille between them, crossed by a bar of the body's colour that ties the lamps
 * together; a black bumper with red tow hooks. At the tail, tall narrow lamps up each corner of the tailgate.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  face: [
    { surface: "rimDark", from: belt, to: rail },
    { surface: "grille", from: rail, to: ALL },
  ],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  tallLamp: [{ surface: "lensTail", from: belt, to: rail }],
};

const face: Decal[] = [
  // A square lamp in each end of the band.
  { on: "front", at: [0.72, 0.96], size: [0.24, 0.17], surface: "lensHead", mirror: true, cells: [2, 2], liftM: 0.016 },
  // Klippa's bar of the body's colour across the grille, from lamp to lamp.
  { on: "front", at: [0, 0.97], size: [1.08, 0.05], surface: "paint", cells: [6, 1], liftM: 0.014 },
  // The indicators, a strip of amber under each lamp.
  { on: "front", at: [0.72, 0.84], size: [0.22, 0.03], surface: "lensIndicator", mirror: true, cells: [2, 1], liftM: 0.012 },
];

const blocks: Block[] = [
  // Tow hooks under each bumper, red as a working car's are.
  { at: [0.44, 0.58, -2.62], size: [0.06, 0.05, 0.08], surface: "lensTail", mirror: true, fine: true },
  { at: [0.44, 0.58, 2.62], size: [0.06, 0.05, 0.08], surface: "lensTail", mirror: true, fine: true },
  // Skid plate under the nose.
  { at: [0, 0.47, -2.4], size: [1.1, 0.03, 0.34], surface: "rimDark", fine: true },
  // Side steps between the arches, under the cab's door.
  { at: [0.96, 0.4, -0.3], size: [0.12, 0.04, 1.3], surface: "cladding", mirror: true },
];

/**
 * A working pickup with a single cab: a long flat bonnet, an upright cab, a long bed with a sports bar over its front,
 * square arches with black lips, high on its tall tyres.
 */
const shape: Shape = {
  trackM: HOLM.trackM,
  axleZ: HOLM.axleZ,
  wheelRadiusM: HOLM.wheelRadiusM,
  tyreWidthM: 0.25,
  noseZ: -2.62,
  tailZ: 2.62,
  halfWidth: 0.97,
  sillH: 0.36,
  rearSillH: 0.42,
  flareM: 0.02,
  archClearM: 0.08,
  sillSurface: "cladding",
  grilleH: 0.8,
  lampH: [0.88, 1.06],
  hoodLipH: 1.11,
  hoodH: 1.17,
  cowl: [-0.94, 1.22],
  header: [-0.276, 1.72],
  roof: [0.1, 1.76],
  roofEnd: [0.7, 1.75],
  cornerPullM: [0.08, 0.04],
  shoulder: [
    [-2.62, 0.92],
    [-1.6, 1.05],
    [-1.0, 1.09],
    [0, 1.11],
    [1.6, 1.13],
    [2.62, 1.13],
  ],
  belt: [
    [-2.62, 0.98],
    [-1.6, 1.12],
    [-1.0, 1.16],
    [0, 1.18],
    [1.6, 1.2],
    [2.62, 1.2],
  ],
  windowTop: [
    [-0.9, 1.26],
    [-0.65, 1.44],
    [-0.3, 1.63],
    [0.1, 1.66],
    [0.6, 1.66],
  ],
  windowZ: [-0.9, 0.55],
  railWidth: [
    [-2.62, 0.55],
    [-1.6, 0.74],
    [-1.0, 0.8],
    [-0.3, 0.78],
    [0.6, 0.78],
    [0.76, 0.86],
    [2.4, 0.88],
    [2.62, 0.76],
  ],
  tail: [],
  seams: [-0.86, 0.5],
  pillars: [],
  mirror: { z: -0.72, h: 1.3, x: 0.92 },
  rearPlateH: 0.66,
  rearSeats: false,
  decals: [
    ...plates(0.66, 0.63),
    ...handles([0.32], 1.05).map((handle): Decal => ({ ...handle, liftM: 0.014 })),
    ...face,
    reversing(0.5, 0.95),
    // The tailgate's handle, a dark strip across its top.
    { on: "rear", at: [0, 1.12], size: [0.3, 0.04], surface: "trim", cells: [2, 1], liftM: 0.012 },
  ],
  blocks,
  extra: {
    bands: BANDS,
    cleanEnds: true,
    archLipM: 0.06,
    bedFloorH: 0.82,
    bedSurface: "trim",
    silhouette: [
      // The nose, foot to brow, one way along the car: the bumper stands out of the face.
      { z: -2.62, h: 0.5, band: "bumper" },
      { z: -2.62, h: 0.76, band: "bumper" },
      { z: -2.57, h: 0.77, band: "gap" },
      { z: -2.565, h: 0.8, band: "face" },
      { z: -2.555, h: 1.08 },
      ...faired(
        [
          [-2.535, 1.11],
          [-1.6, 1.17],
          [-1.0, 1.2],
        ],
        [[-2.535, undefined]],
      ),
      { z: -1.0, h: 1.2, band: "cowl" },
      ...faired(
        [
          [-0.94, 1.22],
          [-0.65, 1.48],
          [-0.276, 1.72],
          [0.1, 1.76],
          [0.7, 1.75],
        ],
        [
          [-0.94, "screen"],
          [-0.276, undefined],
        ],
      ),
      { z: 0.7, h: 1.75, band: "rearGlass" },
      { z: 0.74, h: 1.45 },
      // The bed, open from behind the cab to the tailgate.
      { z: 0.76, h: 1.25, bed: true },
      { z: 2.5, h: 1.25 },
      { z: 2.54, h: 1.22, band: "tallLamp" },
      { z: 2.57, h: 0.84, band: "gap" },
      { z: 2.575, h: 0.825, band: "bumper" },
      { z: 2.62, h: 0.8, band: "bumper" },
      { z: 2.62, h: 0.5 },
    ],
    sill: [
      [-2.62, 0.46],
      [-2.2, 0.38],
      [0, 0.36],
      [2.2, 0.4],
      [2.62, 0.46],
    ],
    crown: [
      [-2.62, 0.01],
      [-1.6, -0.01],
      [-1.0, 0.0],
      [-0.5, 0.03],
      [0.7, 0.04],
      [2.62, 0.02],
    ],
    halfWidth: [
      [-2.62, 0.9],
      [-2.4, 0.955],
      [-1.6, 0.97],
      [0, 0.965],
      [1.6, 0.97],
      [2.4, 0.965],
      [2.62, 0.94],
    ],
    hoodSeamZ: [-2.45, -1.05],
    struts: [
      // The sports bar over the bed's front, behind the cab.
      {
        path: [
          [0.8, 1.25, 0.92],
          [0.8, 1.7, 0.98],
          [-0.8, 1.7, 0.98],
          [-0.8, 1.25, 0.92],
        ],
        radius: 0.035,
        surface: "cladding",
        sides: 8,
      },
    ],
    cabin: { dashZ: -0.92, dashH: 1.19, floorH: 0.5, seatZ: 0.06, endZ: 0.66, seatX: HOLM.trackM * 0.23, seatSurface: "seat" },
  },
};

export const holm: CarSpec = {
  id: HOLM.id,
  name: HOLM.name,
  ride: HOLM.ride,
  paint: "car-paint-forest",
  paints: [
    paint("car-paint-forest"),
    paint("car-paint-white"),
    paint("car-paint-sand"),
    paint("car-paint-oxblood"),
    paint("car-paint-graphite", "metallic"),
    paint("car-paint-black"),
  ],
  body: bodyOf(shape),
  /** A working truck's cockpit: two dials, a big round wheel, a long lever, a bench-like pair of seats in cloth, grey hard-wearing trim with Klippa orange. */
  interior: {
    gauges: "analogue",
    wheel: "round",
    shifter: "lever",
    seats: "comfort",
    screen: false,
    turnsToLock: 1.8,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-insert", headliner: "car-cabin-headliner", accent: "car-cabin-klippa", glow: "car-cabin-glow-white" },
  },
  wheel: { radiusM: HOLM.wheelRadiusM, widthM: 0.25, rimShare: 0.62, spokes: 6, twinSpokes: false, style: "split" },
  shadowHalf: [1.0, 2.62],
};
