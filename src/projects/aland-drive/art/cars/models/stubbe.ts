import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const STUBBE = driven("stubbe");
const { sill, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Klippa's face, a working maker's: one dark band across the nose's top, square lamps at its ends and a plain grille
 * between them, crossed by a single bar of the body's colour that ties the lamps together; black bumpers below with
 * tow hooks. At the tail, the lamps stand as tall, narrow uprights up each corner.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  /** The face's band: a square dark housing at each corner for its round lamp, the grille between. */
  face: [
    { surface: "rimDark", from: belt, to: rail },
    { surface: "grille", from: rail, to: ALL },
  ],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  /** The roof's lip over the tailgate. */
  lip: [{ surface: "trim", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  /** The tall lamps up each corner, the tailgate's paint between them. */
  tallLamp: [{ surface: "lensTail", from: belt, to: rail }],
};

/**
 * In each square housing, a round lamp in a bright ring round its projector, and a line of daylight along the housing's
 * top: square by day and round by night, as the modern utility's face reads.
 */
const lampRings: Decal[] = [
  { on: "front", at: [0.69, 1.0], size: [0.2, 0.2], surface: "rim", mirror: true, round: true, liftM: 0.012, fine: true },
  { on: "front", at: [0.69, 1.0], size: [0.17, 0.17], surface: "lensHead", mirror: true, round: true, liftM: 0.016 },
  { on: "front", at: [0.69, 1.0], size: [0.07, 0.07], surface: "lensHead", mirror: true, round: true, liftM: 0.02, fine: true },
  { on: "front", at: [0.69, 1.09], size: [0.26, 0.018], surface: "lensHead", mirror: true, cells: [4, 1], liftM: 0.024 },
  // The indicator, a strip of amber under each lamp.
  { on: "front", at: [0.69, 0.865], size: [0.22, 0.03], surface: "lensIndicator", mirror: true, cells: [2, 1], liftM: 0.012 },
];

/** A modern utility four-by-four: a tall box with an upright screen, flat flanks, square arches with black lips, a roof rack and a snorkel. */
const shape: Shape = {
  trackM: STUBBE.trackM,
  axleZ: STUBBE.axleZ,
  wheelRadiusM: STUBBE.wheelRadiusM,
  tyreWidthM: 0.27,
  noseZ: -2.4,
  tailZ: 2.4,
  halfWidth: 0.98,
  sillH: 0.44,
  rearSillH: 0.46,
  flareM: 0,
  archClearM: 0.065,
  sillSurface: "cladding",
  grilleH: 0.86,
  lampH: [0.96, 1.12],
  hoodLipH: 1.16,
  hoodH: 1.22,
  cowl: [-0.84, 1.28],
  header: [-0.5, 1.85],
  roof: [0.4, 1.94],
  roofEnd: [2.2, 1.92],
  cornerPullM: [0.09, 0.05],
  shoulder: [
    [-2.36, 1.02],
    [-1.45, 1.12],
    [0, 1.135],
    [1.45, 1.145],
    [2.36, 1.13],
  ],
  belt: [
    [-2.36, 1.08],
    [-1.45, 1.19],
    [-0.84, 1.235],
    [0.5, 1.25],
    [2.36, 1.26],
  ],
  windowTop: [
    [-0.8, 1.3],
    [-0.62, 1.6],
    [-0.46, 1.79],
    [0.2, 1.82],
    [1.6, 1.815],
    [2.18, 1.79],
  ],
  windowZ: [-0.8, 2.18],
  railWidth: [
    [-2.36, 0.52],
    [-1.45, 0.74],
    [-0.84, 0.84],
    [-0.4, 0.86],
    [1.2, 0.87],
    [2.2, 0.86],
    [2.36, 0.78],
  ],
  tail: [],
  seams: [-0.78, 0.26, 1.36],
  pillars: [
    [0.22, 0.32],
    [1.3, 1.42],
  ],
  mirror: { z: -0.56, h: 1.3, x: 0.9 },
  rearPlateH: 1.02,
  rearSeats: true,
  cabinEndZ: 1.75,
  decals: [
    ...plates(1.02, 0.68),
    ...handles([-0.04, 0.92], 1.07).map((handle): Decal => ({ ...handle, liftM: 0.014 })),
    ...lampRings,
    // The bar of the body's colour across the grille, from lamp to lamp: Klippa's.
    { on: "front", at: [0, 1.04], size: [1.0, 0.05], surface: "paint", cells: [6, 1], liftM: 0.014 },
    reversing(0.28, 0.66),
    // The tailgate's handle, a dark strip across it under the glass.
    { on: "rear", at: [0, 1.3], size: [0.7, 0.045], surface: "trim", cells: [4, 1], liftM: 0.012 },
    // The fog lamp, on the bumper beside the plate.
    { on: "rear", at: [-0.5, 0.66], size: [0.1, 0.04], surface: "lensTail", cells: [2, 1], liftM: 0.012, fine: true },
    // Fog lamps in the front bumper's corners.
    { on: "front", at: [0.62, 0.66], size: [0.1, 0.1], surface: "lensHead", mirror: true, round: true, liftM: 0.012, fine: true },
    // The third brake lamp, on the roof's lip over the glass.
    { on: "rear", at: [0, 1.86], size: [0.4, 0.025], surface: "lensTail", cells: [4, 1], liftM: 0.012, fine: true },
    // Side repeaters on the front fenders.
    { on: "side", at: [-1.0, 1.02], size: [0.06, 0.02], surface: "lensIndicator", mirror: true, liftM: 0.01, fine: true },
  ],
  blocks: [
    // Tow hooks under each bumper, red as a working car's are.
    { at: [0.42, 0.56, -2.4], size: [0.06, 0.05, 0.08], surface: "lensTail", mirror: true, fine: true },
    { at: [0.42, 0.56, 2.4], size: [0.06, 0.05, 0.08], surface: "lensTail", mirror: true, fine: true },
    // The rack's crossbars on its rails, and its front fairing.
    { at: [0, 2.005, 0.05], size: [1.5, 0.03, 0.045], surface: "trim" },
    { at: [0, 2.005, 0.75], size: [1.5, 0.03, 0.045], surface: "trim", fine: true },
    { at: [0, 2.005, 1.45], size: [1.5, 0.03, 0.045], surface: "trim", fine: true },
    { at: [0, 2.0, -0.28], size: [1.4, 0.05, 0.04], surface: "trim", taper: [1, 0.6], fine: true },
    // The snorkel's head over the right of the screen, its mouth facing forward.
    { at: [0.95, 1.9, -0.52], size: [0.11, 0.11, 0.16], surface: "cladding", taper: [0.9, 0.9] },
    { at: [0.95, 1.9, -0.605], size: [0.08, 0.075, 0.012], surface: "grille", fine: true },
    // Skid plate under the nose.
    { at: [0, 0.47, -2.2], size: [1.1, 0.03, 0.34], surface: "rimDark", fine: true },
    // Side steps between the arches.
    { at: [0.98, 0.42, 0], size: [0.12, 0.04, 1.9], surface: "cladding", mirror: true },
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // The nose, foot to brow, one way along the car: the bumper stands out of the face.
      { z: -2.4, h: 0.52, band: "bumper" },
      { z: -2.4, h: 0.78, band: "bumper" },
      { z: -2.345, h: 0.79, band: "gap" },
      { z: -2.34, h: 0.82, band: "face" },
      { z: -2.33, h: 1.12 },
      // The hood, nearly flat, then the upright screen, flat roof and tailgate, each as one fair line.
      ...faired(
        [
          [-2.31, 1.15],
          [-1.45, 1.215],
          [-0.9, 1.255],
        ],
        [[-2.31, undefined]],
      ),
      { z: -0.9, h: 1.255, band: "cowl" },
      ...faired(
        [
          [-0.84, 1.28],
          [-0.67, 1.57],
          [-0.5, 1.85],
          [-0.3, 1.915],
          [0.4, 1.94],
          [1.6, 1.94],
          [2.22, 1.925],
        ],
        [
          [-0.84, "screen"],
          [-0.5, undefined],
        ],
      ),
      { z: 2.22, h: 1.925, band: "lip" },
      { z: 2.3, h: 1.88, band: "rearGlass" },
      { z: 2.325, h: 1.42, band: "tallLamp" },
      { z: 2.345, h: 0.9, band: "gap" },
      { z: 2.35, h: 0.885, band: "bumper" },
      { z: 2.4, h: 0.86, band: "bumper" },
      { z: 2.4, h: 0.54 },
    ],
    crown: [
      [-2.36, 0.01],
      [-1.45, -0.01],
      [-0.9, 0.0],
      [-0.5, 0.03],
      [1.0, 0.04],
      [2.36, 0.03],
    ],
    halfWidth: [
      [-2.4, 0.9],
      [-2.2, 0.965],
      [-1.45, 0.978],
      [0, 0.975],
      [1.45, 0.978],
      [2.2, 0.968],
      [2.4, 0.93],
    ],
    hoodSeamZ: [-2.2, -0.95],
    cleanEnds: true,
    archLipM: 0.07,
    roofBars: { from: -0.3, to: 2.05, x: 0.72, rise: 0.045 },
    struts: [
      // The snorkel: up out of the right front fender and along the screen's pillar to its head.
      {
        path: [
          [1.0, 1.02, -1.0],
          [1.01, 1.2, -0.94],
          [0.99, 1.45, -0.78],
          [0.96, 1.7, -0.62],
          [0.95, 1.86, -0.52],
        ],
        radius: 0.045,
        surface: "cladding",
      },
    ],
  },
};

export const stubbe: CarSpec = {
  id: STUBBE.id,
  name: STUBBE.name,
  ride: STUBBE.ride,
  paint: "car-paint-lichen",
  paints: [
    paint("car-paint-lichen"),
    paint("car-paint-white"),
    paint("car-paint-navy", "metallic"),
    paint("car-paint-sand", "matte"),
    paint("car-paint-signal-red"),
    paint("car-paint-orange"),
    paint("car-paint-graphite", "matte"),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: STUBBE.wheelRadiusM, widthM: 0.27, rimShare: 0.6, spokes: 6, twinSpokes: false, style: "blade" },
  shadowHalf: [1.0, 2.4],
  /** A modern working cockpit: two dials with a small display between, a chunky round wheel, hard-wearing grey trim with Klippa orange round the vents. */
  interior: {
    gauges: "analogue",
    centreDisplay: true,
    wheel: "round",
    shifter: "lever",
    seats: "comfort",
    screen: true,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-insert", headliner: "car-cabin-headliner", accent: "car-cabin-klippa", glow: "car-cabin-glow-white" },
  },
};
