import { ROWS, type Band, type Block, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const KOBB = driven("kobb");
const { sill, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Klippa's face, as Stubbe and Knott wear it, on the maker's van: one dark band across the short nose's top with a
 * square lamp at each end and a plain grille between them, crossed by a bar of the body's colour that ties the lamps
 * together; a deep black bumper with red tow hooks. At the tail, tall narrow lamps up each corner beside the twin doors.
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
  lip: [{ surface: "trim", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  tallLamp: [{ surface: "lensTail", from: belt, to: rail }],
};

const face: Decal[] = [
  { on: "front", at: [0.74, 0.8], size: [0.22, 0.16], surface: "lensHead", mirror: true, cells: [2, 2], liftM: 0.016 },
  { on: "front", at: [0, 0.81], size: [1.08, 0.05], surface: "paint", cells: [6, 1], liftM: 0.014 },
  { on: "front", at: [0.74, 0.68], size: [0.2, 0.03], surface: "lensIndicator", mirror: true, cells: [2, 1], liftM: 0.012 },
];

const work: Decal[] = [
  // The sliding door's rail along the flank, behind the cab.
  { on: "side", at: [0.72, 1.6], size: [1.96, 0.02], surface: "trim", mirror: true, cells: [4, 1], fine: true },
  // Black rubbing strips low along the flank, between the arches, where a van takes its knocks.
  { on: "side", at: [-0.1, 0.56], size: [2.04, 0.12], surface: "cladding", mirror: true, cells: [6, 1], liftM: 0.012 },
  // The twin rear doors' meeting line and the handle on the right one.
  { on: "rear", at: [0, 1.2], size: [0.012, 0.86], surface: "gap", cells: [1, 4], liftM: 0.008, fine: true },
  { on: "rear", at: [0.09, 1.16], size: [0.1, 0.03], surface: "trim", cells: [2, 1], liftM: 0.012, fine: true },
];

const blocks: Block[] = [
  { at: [0.44, 0.4, -2.48], size: [0.06, 0.05, 0.08], surface: "lensTail", mirror: true, fine: true },
  { at: [0.44, 0.4, 2.46], size: [0.06, 0.05, 0.08], surface: "lensTail", mirror: true, fine: true },
];

/**
 * A tall tradesman's van: a short sloping nose under a steep screen, a cab with its own doors, a long windowless load box
 * with a sliding door, twin doors at the back between tall lamps, and a roof rack the length of it.
 */
const shape: Shape = {
  trackM: KOBB.trackM,
  axleZ: KOBB.axleZ,
  wheelRadiusM: KOBB.wheelRadiusM,
  tyreWidthM: 0.215,
  noseZ: -2.48,
  tailZ: 2.46,
  halfWidth: 0.95,
  sillH: 0.24,
  flareM: 0,
  archClearM: 0.05,
  sillSurface: "cladding",
  grilleH: 0.63,
  lampH: [0.72, 0.9],
  hoodLipH: 0.97,
  hoodH: 1.18,
  cowl: [-1.5, 1.23],
  header: [-0.748, 1.9],
  roof: [-0.3, 1.97],
  roofEnd: [2.3, 1.97],
  cornerPullM: [0.12, 0.03],
  shoulder: [
    [-2.48, 0.86],
    [-1.62, 0.98],
    [0, 1.0],
    [2.46, 1.0],
  ],
  belt: [
    [-2.48, 0.94],
    [-1.62, 1.1],
    [-1.5, 1.12],
    [0, 1.14],
    [2.46, 1.16],
  ],
  windowTop: [
    [-1.47, 1.26],
    [-1.1, 1.5],
    [-0.75, 1.78],
    [-0.45, 1.82],
    [-0.36, 1.82],
  ],
  windowZ: [-1.47, -0.36],
  railWidth: [
    [-2.48, 0.52],
    [-1.62, 0.74],
    [-1.5, 0.78],
    [-0.7, 0.79],
    [2.2, 0.8],
    [2.46, 0.76],
  ],
  tail: [],
  seams: [-1.42, -0.32, 0.92],
  pillars: [],
  mirror: { z: -1.3, h: 1.34, x: 0.92 },
  rearPlateH: 0.56,
  rearSeats: false,
  cabinEndZ: -0.2,
  decals: [
    ...plates(0.56, 0.48),
    ...handles([-0.62, 0.02], 1.06).map((handle): Decal => ({ ...handle, liftM: 0.014 })),
    ...face,
    ...work,
    reversing(0.5, 0.66),
  ],
  blocks,
  extra: {
    bands: BANDS,
    cleanEnds: true,
    archLipM: 0.03,
    silhouette: [
      { z: -2.48, h: 0.42, band: "bumper" },
      { z: -2.48, h: 0.62, band: "bumper" },
      { z: -2.44, h: 0.63, band: "gap" },
      { z: -2.435, h: 0.66, band: "face" },
      { z: -2.42, h: 0.94 },
      ...faired(
        [
          [-2.4, 0.97],
          [-2.0, 1.1],
          [-1.62, 1.18],
          [-1.55, 1.2],
        ],
        [[-2.4, undefined]],
      ),
      { z: -1.55, h: 1.2, band: "cowl" },
      ...faired(
        [
          [-1.5, 1.23],
          [-1.1, 1.55],
          [-0.748, 1.9],
          [-0.3, 1.97],
          [1.0, 1.98],
          [2.3, 1.97],
        ],
        [
          [-1.5, "screen"],
          [-0.748, undefined],
        ],
      ),
      { z: 2.3, h: 1.97, band: "lip" },
      { z: 2.34, h: 1.92, band: "rearGlass" },
      { z: 2.38, h: 1.5, band: "tallLamp" },
      { z: 2.41, h: 0.78, band: "gap" },
      { z: 2.415, h: 0.765, band: "bumper" },
      { z: 2.46, h: 0.74, band: "bumper" },
      { z: 2.46, h: 0.4 },
    ],
    sill: [
      [-2.48, 0.34],
      [-2.1, 0.26],
      [0, 0.24],
      [2.1, 0.26],
      [2.46, 0.34],
    ],
    crown: [
      [-2.48, 0.01],
      [-1.62, 0.0],
      [-1.0, 0.03],
      [0, 0.06],
      [2.46, 0.05],
    ],
    halfWidth: [
      [-2.48, 0.86],
      [-2.3, 0.92],
      [-1.62, 0.95],
      [0, 0.95],
      [1.42, 0.95],
      [2.3, 0.945],
      [2.46, 0.92],
    ],
    hoodSeamZ: [-2.3, -1.6],
    roofBars: { from: -0.5, to: 2.1, x: 0.7, rise: 0.06 },
  },
};

export const kobb: CarSpec = {
  id: KOBB.id,
  name: KOBB.name,
  ride: KOBB.ride,
  paint: "car-paint-white",
  paints: [
    paint("car-paint-white"),
    paint("car-paint-silver", "metallic"),
    paint("car-paint-sky"),
    paint("car-paint-orange"),
    paint("car-paint-graphite", "metallic"),
    paint("car-paint-forest"),
  ],
  body: bodyOf(shape),
  /** A working van's cab: two dials with a small display between, a big round wheel, a lever, hard-wearing grey cloth, Klippa orange round the vents. */
  interior: {
    gauges: "analogue",
    centreDisplay: true,
    wheel: "round",
    shifter: "lever",
    seats: "comfort",
    screen: true,
    turnsToLock: 1.8,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-insert", headliner: "car-cabin-headliner", accent: "car-cabin-klippa", glow: "car-cabin-glow-white" },
  },
  wheel: { radiusM: KOBB.wheelRadiusM, widthM: 0.215, rimShare: 0.6, spokes: 5, twinSpokes: false, style: "steel" },
  shadowHalf: [0.96, 2.48],
};
