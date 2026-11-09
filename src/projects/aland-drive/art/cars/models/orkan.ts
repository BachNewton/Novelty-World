import { ROWS, type Band } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, louvres, sideIntake, splitter } from "../parts";
import { bodyOf, driven, faired, handles, plates, reflector, reversing, thirdBrake, type Shape } from "../recipe";

const ORKAN = driven("orkan");
const { sillTop, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Valtor's signature: a visor of dark glass across each end, and at its outer ends two parallel strokes of light, one
 * over the other, so the car reads as four short bars at its corners by day and by night.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: 0, to: ALL }],
  /** One wide intake under the visor. */
  mouth: [{ surface: "grille", from: rail, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  visor: [{ surface: "trim", from: belt, to: ALL }],
  stroke: [
    { surface: "lensHead", from: belt, to: rail },
    { surface: "trim", from: rail, to: ALL },
  ],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  tailStroke: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "trim", from: rail, to: ALL },
  ],
  /** The tail's lower panel, dark between the exhausts. */
  mesh: [{ surface: "grille", from: rail, to: ALL }],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** A grand-sport coupé: a long hood over an engine set behind the front axle, a fastback cabin and wide hips. */
const shape: Shape = {
  trackM: ORKAN.trackM,
  axleZ: ORKAN.axleZ,
  wheelRadiusM: ORKAN.wheelRadiusM,
  tyreWidthM: 0.285,
  noseZ: -2.345,
  tailZ: 2.33,
  halfWidth: 0.99,
  sillH: 0.13,
  flareM: 0.03,
  cornerPullM: [0.2, 0.18],
  archClearM: 0.035,
  grilleH: 0.41,
  lampH: [0.485, 0.533],
  hoodLipH: 0.56,
  hoodH: 0.76,
  cowl: [-0.26, 0.862],
  header: [0.3, 1.2],
  roof: [0.62, 1.275],
  roofEnd: [1.08, 1.25],
  shoulder: [
    [-2.345, 0.42],
    [-1.9, 0.62],
    [-1.3, 0.8],
    [-0.3, 0.72],
    [1.42, 0.86],
    [2.0, 0.83],
    [2.33, 0.76],
  ],
  belt: [
    [-2.345, 0.5],
    [-1.9, 0.68],
    [-1.3, 0.83],
    [-0.3, 0.84],
    [0.4, 0.87],
    [1.42, 0.92],
    [2.0, 0.93],
    [2.33, 0.88],
  ],
  windowTop: [
    [-0.24, 0.9],
    [0.0, 1.06],
    [0.3, 1.17],
    [0.6, 1.21],
    [1.0, 1.17],
    [1.3, 1.09],
    [1.5, 1.04],
  ],
  windowZ: [-0.24, 1.5],
  railWidth: [
    [-2.345, 0.56],
    [-1.3, 0.76],
    [-0.3, 0.74],
    [0.2, 0.64],
    [0.7, 0.6],
    [1.42, 0.66],
    [2.0, 0.62],
    [2.33, 0.56],
  ],
  tail: [],
  seams: [-0.18, 1.04],
  pillars: [[0.74, 0.8]],
  mirror: { z: -0.05, h: 0.95, x: 0.9 },
  rearPlateH: 0.7,
  rearSeats: true,
  cabinEndZ: 1.72,
  seat: "seatTan",
  decals: [
    ...plates(0.62, 0.3),
    ...handles([0.55], 0.82),
    reversing(0.3, 0.405),
    // A reflector low in each corner.
    reflector(0.7, 0.4),
    { ...thirdBrake(0.9, 0.3), liftM: 0.012 },
    // The fender vents, in fewer cells than the shared intake's, which the far model can't afford.
    { ...sideIntake({ z: -0.76, h: 0.58, long: 0.34, tall: 0.09 }), cells: [3, 1] },
    ...louvres({ x: 0.34, z: -1.2, long: 0.34, wide: 0.15, count: 4 }),
    // A brake-cooling inlet at each outer corner of the nose, under the visor.
    { on: "front", at: [0.72, 0.31], size: [0.17, 0.11], surface: "grille", mirror: true, cells: [2, 1], liftM: 0.012 },
  ],
  blocks: [
    // A blade of the body's colour across the intake, so it reads as a shaped duct and not a hole.
    { at: [0, 0.375, -2.33], size: [1.0, 0.024, 0.06], surface: "paint", taper: [1, 1], fine: true },
    // Tucked under the nose's foot, it adds nothing to the far model's outline.
    { ...splitter({ z: -2.36, h: 0.21, halfWidth: 0.56, long: 0.12 }), fine: true },
    // Each fender vent as a duct: a blade of the body's colour along it and a lip over it, tapering back.
    { at: [0.962, 0.58, -0.76], size: [0.04, 0.02, 0.32], surface: "paint", mirror: true, taper: [1, 0.6], fine: true },
    { at: [0.958, 0.632, -0.76], size: [0.05, 0.014, 0.34], surface: "paint", mirror: true, taper: [0.8, 0.6], fine: true },
    // A blade across each brake-cooling inlet in the nose's corners.
    { at: [0.72, 0.31, -2.19], size: [0.15, 0.02, 0.06], surface: "paint", mirror: true, fine: true },
    // The diffuser's strakes, near only: from where the far model takes over they are lost under the tail.
    ...diffuser({ z: 2.02, tailZ: 2.3, h: 0.22, x: [0.2, 0.42] }).map((strake) => ({ ...strake, fine: true })),
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.345, h: 0.21, band: "bumper" },
      { z: -2.34, h: 0.25, band: "mouth" },
      { z: -2.335, h: 0.41 },
      { z: -2.33, h: 0.465, band: "visor" },
      // Two strokes of light, tall enough to read as a headlamp at night, with a hairline of visor between.
      { z: -2.328, h: 0.47, band: "stroke" },
      { z: -2.319, h: 0.5, band: "visor" },
      { z: -2.316, h: 0.506, band: "stroke" },
      { z: -2.306, h: 0.53, band: "visor" },
      // The hood, then the screen, roof, rear glass and deck, each as one fair line.
      ...faired(
        [
          [-2.29, 0.56],
          [-2.0, 0.645],
          [-1.3, 0.765],
          [-0.55, 0.835],
          [-0.32, 0.852],
        ],
        [[-2.29, undefined]],
      ),
      { z: -0.32, h: 0.852, band: "cowl" },
      // The screen as one straight run from the cowl to the header: the cockpit hangs its mirror and visors from the
      // point after the screen's start, so that point has to be the header.
      { z: -0.26, h: 0.862, band: "screen" },
      ...faired(
        [
          [0.3, 1.2],
          [0.62, 1.275],
          [1.08, 1.25],
          [1.5, 1.125],
          [1.85, 0.985],
          [2.2, 0.935],
        ],
        [
          [0.3, undefined],
          [1.08, "rearGlass"],
          [1.85, undefined],
        ],
        // A station every 10 cm, so none lands a sliver's width from the rear arch's, which would fold the side glass's frame.
        0.1,
      ),
      { z: 2.2, h: 0.935 },
      { z: 2.24, h: 0.93, band: "gap" },
      { z: 2.25, h: 0.92, band: "visor" },
      { z: 2.256, h: 0.9, band: "tailStroke" },
      { z: 2.262, h: 0.877, band: "visor" },
      { z: 2.268, h: 0.86, band: "tailStroke" },
      { z: 2.274, h: 0.837, band: "visor" },
      { z: 2.28, h: 0.818 },
      { z: 2.31, h: 0.45, band: "mesh" },
      { z: 2.32, h: 0.36, band: "diffuser" },
      { z: 2.33, h: 0.21 },
    ],
    crown: [
      [-2.345, -0.02],
      [-1.9, -0.08],
      [-1.3, -0.11],
      [-0.6, -0.07],
      [-0.2, 0.04],
      [0.6, 0.06],
      [1.42, 0.0],
      [2.0, -0.02],
      [2.33, 0.01],
    ],
    shelf: [
      [-2.345, 0],
      [-0.6, 0.02],
      [0.3, 0.1],
      [1.6, 0.1],
      [2.33, 0.03],
    ],
    halfWidth: [
      [-2.345, 0.84],
      [-2.1, 0.95],
      [-1.3, 0.98],
      [0.0, 0.96],
      [1.42, 0.99],
      [2.0, 0.97],
      [2.33, 0.88],
    ],
    hoodSeamZ: [-2.1, -0.36],
    // The 2+2's rear seats sit ahead of where the recipe puts them, so their backs stay under the fastback's glass.
    cabin: { dashZ: -0.24, dashH: 0.78, floorH: 0.27, seatZ: 0.72, rearSeatZ: 1.42, endZ: 1.72, seatX: ORKAN.trackM * 0.23, seatSurface: "seatTan" },
    cleanEnds: true,
    scoop: [
      [-0.9, 0],
      [-0.3, 0.025],
      [0.6, 0.025],
      [1.05, 0],
    ],
    // The deployable spoiler, shown raised on its stalks above the deck's lip.
    wing: { z: 2.12, h: 1.04, halfWidth: 0.68, chord: 0.14, rise: 0.025 },
    exhausts: { x: [-0.62, -0.5, 0.5, 0.62], h: 0.3, z: 2.31, radius: 0.04 },
  },
};

export const orkan: CarSpec = {
  id: ORKAN.id,
  name: ORKAN.name,
  ride: ORKAN.ride,
  paint: "car-paint-storm",
  paints: [
    paint("car-paint-storm", "metallic"),
    paint("car-paint-silver", "metallic"),
    paint("car-paint-graphite", "matte"),
    paint("car-paint-concrete"),
    paint("car-paint-black", "metallic"),
    paint("car-paint-orange"),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: ORKAN.wheelRadiusM, widthM: 0.285, rimShare: 0.74, spokes: 10, twinSpokes: false, style: "aero" },
  shadowHalf: [0.99, 2.33],
  interior: {
    gauges: "digital",
    wheel: "flat",
    shifter: "lever",
    seats: "sport",
    screen: true,
    // Sat a little lower than the recipe's sitting height, as a grand tourer's driver is: the fastback's roof stays a
    // band over the screen rather than a slab, and the eye's line through the wheel meets the cluster above its hub.
    eye: [0, -0.07, 0.04],
    clusterSight: 0.8,
    colours: { trim: "car-cabin-trim-tan", insert: "car-cabin-insert-tan", headliner: "car-cabin-headliner-dark", glow: "car-cabin-glow-white" },
  },
};
