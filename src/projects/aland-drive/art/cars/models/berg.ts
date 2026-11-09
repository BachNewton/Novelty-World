import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { bodyOf, driven, faired, handles, plates, reversing, roundLamps, type Shape } from "../recipe";

const BERG = driven("berg");
const { sill, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Klippa's face as the maker first drew it, the one Stubbe and Knott carry on: one dark band across the nose's top, a
 * round lamp in a square housing at each end and a plain grille between them, crossed by a bar of the body's colour
 * that ties the lamps together; black steel bumpers with red tow hooks. At the tail, tall narrow lamps up each corner.
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
  ...roundLamps(0.68, 0.95, 0.19),
  // Klippa's bar of the body's colour across the grille, from lamp to lamp.
  { on: "front", at: [0, 0.95], size: [0.98, 0.05], surface: "paint", cells: [6, 1], liftM: 0.014 },
  // The indicators, small and amber, under each lamp's housing.
  { on: "front", at: [0.68, 0.8], size: [0.14, 0.035], surface: "lensIndicator", mirror: true, cells: [2, 1], liftM: 0.012 },
];

/**
 * An old three-door four-by-four: a flat-sided box with a flat bonnet and an upright screen, square arches with black
 * lips, a roof rack, black steel bumpers and the spare wheel on its tailgate, on steel wheels and mud tyres.
 */
const shape: Shape = {
  trackM: BERG.trackM,
  axleZ: BERG.axleZ,
  wheelRadiusM: BERG.wheelRadiusM,
  tyreWidthM: 0.26,
  noseZ: -2.2,
  tailZ: 2.2,
  halfWidth: 0.92,
  sillH: 0.42,
  rearSillH: 0.44,
  flareM: 0,
  archClearM: 0.06,
  sillSurface: "cladding",
  grilleH: 0.76,
  lampH: [0.86, 1.04],
  hoodLipH: 1.17,
  hoodH: 1.22,
  cowl: [-0.95, 1.27],
  header: [-0.668, 1.84],
  roof: [0.4, 1.92],
  roofEnd: [2.02, 1.92],
  cornerPullM: [0.07, 0.04],
  shoulder: [
    [-2.16, 1.0],
    [-1.3, 1.1],
    [0, 1.11],
    [1.3, 1.12],
    [2.16, 1.11],
  ],
  belt: [
    [-2.16, 1.06],
    [-1.3, 1.17],
    [-0.95, 1.2],
    [0.5, 1.21],
    [2.16, 1.22],
  ],
  windowTop: [
    [-0.92, 1.25],
    [-0.78, 1.55],
    [-0.66, 1.76],
    [0.2, 1.8],
    [2.0, 1.8],
  ],
  windowZ: [-0.92, 2.0],
  railWidth: [
    [-2.16, 0.5],
    [-1.3, 0.7],
    [-0.95, 0.8],
    [-0.4, 0.82],
    [1.2, 0.825],
    [2.02, 0.825],
    [2.16, 0.74],
  ],
  tail: [],
  seams: [-0.88, 0.22],
  pillars: [
    [0.18, 0.28],
    [1.15, 1.25],
  ],
  mirror: { z: -0.75, h: 1.32, x: 0.88 },
  rearPlateH: 1.0,
  rearSeats: true,
  cabinEndZ: 1.6,
  decals: [
    ...plates(1.0, 0.61),
    ...handles([-0.15], 1.07).map((handle): Decal => ({ ...handle, liftM: 0.014 })),
    ...face,
    reversing(0.5, 0.62),
  ],
  blocks: [
    // Tow hooks under each bumper, red as a working car's are.
    { at: [0.4, 0.56, -2.2], size: [0.06, 0.05, 0.08], surface: "lensTail", mirror: true, fine: true },
    { at: [0.4, 0.56, 2.2], size: [0.06, 0.05, 0.08], surface: "lensTail", mirror: true, fine: true },
    // The spare's bracket on the tailgate.
    { at: [0, 1.22, 2.16], size: [0.14, 0.14, 0.1], surface: "rimDark" },
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    archLipM: 0.05,
    silhouette: [
      // The nose, foot to brow, one way along the car: the bumper stands out of the face.
      { z: -2.2, h: 0.5, band: "bumper" },
      { z: -2.2, h: 0.72, band: "bumper" },
      { z: -2.15, h: 0.73, band: "gap" },
      { z: -2.145, h: 0.76, band: "face" },
      { z: -2.135, h: 1.14 },
      ...faired(
        [
          [-2.115, 1.17],
          [-1.3, 1.22],
          [-1.0, 1.24],
        ],
        [[-2.115, undefined]],
      ),
      { z: -1.0, h: 1.24, band: "cowl" },
      ...faired(
        [
          [-0.95, 1.27],
          [-0.82, 1.55],
          [-0.668, 1.84],
          [-0.5, 1.9],
          [0.4, 1.92],
          [1.6, 1.92],
          [2.02, 1.92],
        ],
        [
          [-0.95, "screen"],
          [-0.668, undefined],
        ],
      ),
      { z: 2.02, h: 1.91, band: "lip" },
      { z: 2.07, h: 1.88, band: "rearGlass" },
      { z: 2.09, h: 1.5, band: "tallLamp" },
      { z: 2.12, h: 0.9, band: "gap" },
      { z: 2.125, h: 0.885, band: "bumper" },
      { z: 2.2, h: 0.86, band: "bumper" },
      { z: 2.2, h: 0.52 },
    ],
    crown: [
      [-2.2, 0.01],
      [-1.3, -0.01],
      [-0.95, 0.0],
      [-0.6, 0.03],
      [1.0, 0.04],
      [2.2, 0.03],
    ],
    halfWidth: [
      [-2.2, 0.86],
      [-2.05, 0.905],
      [-1.3, 0.915],
      [0, 0.915],
      [1.3, 0.915],
      [2.05, 0.915],
      [2.2, 0.87],
    ],
    hoodSeamZ: [-2.05, -1.05],
    roofBars: { from: -0.4, to: 1.85, x: 0.7, rise: 0.045 },
    spares: [{ at: [0, 1.22, 2.29], radiusM: 0.36, widthM: 0.22, axis: "z" }],
  },
};

export const berg: CarSpec = {
  id: BERG.id,
  name: BERG.name,
  ride: BERG.ride,
  paint: "car-paint-cream",
  paints: [
    paint("car-paint-cream"),
    paint("car-paint-olive", "matte"),
    paint("car-paint-sand", "matte"),
    paint("car-paint-brick"),
    paint("car-paint-sky"),
    paint("car-paint-grey"),
  ],
  body: bodyOf(shape),
  /** An old four-by-four's cockpit: classic dials in a painted metal dash, a big thin-rimmed wheel, a long lever, cloth seats, Klippa orange on the dials. */
  interior: {
    gauges: "classic",
    wheel: "classic",
    shifter: "lever",
    seats: "comfort",
    screen: false,
    paintedDash: true,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-insert", headliner: "car-cabin-headliner", accent: "car-cabin-klippa", glow: "car-cabin-glow-amber" },
  },
  wheel: { radiusM: BERG.wheelRadiusM, widthM: 0.26, rimShare: 0.56, spokes: 5, twinSpokes: false, style: "steel" },
  shadowHalf: [0.92, 2.3],
};
