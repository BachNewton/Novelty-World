import { ROWS, type Band } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { louvres, sideIntake, splitter } from "../parts";
import { bodyOf, driven, faired, handles, plates, reflector, reversing, thirdBrake, type Shape } from "../recipe";

const FLOD = driven("flod");
const { sillTop, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Valtor's signature, as its coupé wears it: a visor of dark glass across each end, and at its outer ends two parallel
 * strokes of light, one over the other, so the estate reads as its maker's four short bars at its corners.
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
  /** The bumper's lower panel, dark between the exhausts. */
  mesh: [{ surface: "grille", from: rail, to: ALL }],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** A super-estate: a long hood over a front V8, a long roof running flat to a raked tailgate, and wide hips over the rear wheels. */
const shape: Shape = {
  trackM: FLOD.trackM,
  axleZ: FLOD.axleZ,
  wheelRadiusM: FLOD.wheelRadiusM,
  tyreWidthM: 0.295,
  noseZ: -2.51,
  tailZ: 2.51,
  halfWidth: 0.99,
  sillH: 0.14,
  flareM: 0.04,
  cornerPullM: [0.22, 0.14],
  archClearM: 0.035,
  grilleH: 0.47,
  lampH: [0.53, 0.58],
  hoodLipH: 0.62,
  hoodH: 0.83,
  cowl: [-0.44, 0.93],
  header: [0.32, 1.39],
  roof: [0.85, 1.46],
  roofEnd: [2.16, 1.395],
  shoulder: [
    [-2.51, 0.46],
    [-2.05, 0.68],
    [-1.45, 0.86],
    [-0.5, 0.84],
    [0.6, 0.86],
    [1.55, 0.94],
    [2.15, 0.93],
    [2.51, 0.86],
  ],
  belt: [
    [-2.51, 0.54],
    [-2.05, 0.73],
    [-1.45, 0.89],
    [-0.5, 0.93],
    [0.6, 0.96],
    [1.55, 0.99],
    [2.15, 0.99],
    [2.51, 0.95],
  ],
  windowTop: [
    [-0.42, 0.99],
    [-0.15, 1.15],
    [0.3, 1.32],
    [0.8, 1.375],
    [1.5, 1.37],
    [1.9, 1.34],
    [2.08, 1.25],
  ],
  windowZ: [-0.42, 2.08],
  railWidth: [
    [-2.51, 0.58],
    [-1.45, 0.79],
    [-0.45, 0.77],
    [0.3, 0.7],
    [1.0, 0.685],
    [2.0, 0.675],
    [2.3, 0.64],
    [2.51, 0.6],
  ],
  tail: [],
  seams: [-0.4, 0.64, 1.12],
  pillars: [
    [0.62, 0.7],
    [1.2, 1.27],
  ],
  mirror: { z: -0.24, h: 1.02, x: 0.92 },
  rearPlateH: 0.66,
  rearSeats: true,
  cabinEndZ: 2.2,
  seat: "seatTan",
  decals: [
    ...plates(0.66, 0.34),
    ...handles([0.3, 0.98], 0.9),
    reversing(0.32, 0.46),
    // A reflector low in each corner.
    reflector(0.72, 0.42),
    { ...thirdBrake(2.12, 0.34), liftM: 0.012 },
    // The fender vents, Valtor's mark behind each front wheel, in fewer cells than the shared intake's for the far model.
    { ...sideIntake({ z: -0.84, h: 0.66, long: 0.32, tall: 0.085 }), cells: [3, 1] },
    ...louvres({ x: 0.36, z: -1.36, long: 0.34, wide: 0.14, count: 4 }),
    // A brake-cooling inlet at each outer corner of the nose, under the visor.
    { on: "front", at: [0.74, 0.34], size: [0.17, 0.1], surface: "grille", mirror: true, cells: [2, 1], liftM: 0.012 },
  ],
  blocks: [
    // A blade of the body's colour across the intake, so it reads as a shaped duct and not a hole.
    { at: [0, 0.405, -2.485], size: [0.8, 0.024, 0.06], surface: "paint", taper: [1, 1], fine: true },
    // Tucked under the nose's foot, it adds nothing to the far model's outline.
    { ...splitter({ z: -2.52, h: 0.225, halfWidth: 0.58, long: 0.12 }), fine: true },
    // Each fender vent as a duct: a blade of the body's colour along it and a lip over it, tapering back.
    { at: [0.968, 0.66, -0.84], size: [0.04, 0.02, 0.3], surface: "paint", mirror: true, taper: [1, 0.6], fine: true },
    { at: [0.964, 0.708, -0.84], size: [0.05, 0.014, 0.32], surface: "paint", mirror: true, taper: [0.8, 0.6], fine: true },
    // A roof spoiler over the tailgate's glass, in the body's colour, its lip standing proud of the glass.
    { at: [0, 1.402, 2.19], size: [1.2, 0.024, 0.1], surface: "paint", taper: [0.96, 0.6] },
    // Two short strakes either side in the diffuser, kept above the tail's foot.
    ...[0.22, 0.4].map((x) => ({ at: [x, 0.29, 2.42] as const, size: [0.016, 0.09, 0.16] as const, surface: "trim" as const, mirror: true, fine: true })),
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.51, h: 0.225, band: "bumper" },
      { z: -2.505, h: 0.265, band: "mouth" },
      { z: -2.5, h: 0.47 },
      { z: -2.495, h: 0.52, band: "visor" },
      { z: -2.491, h: 0.533, band: "stroke" },
      { z: -2.485, h: 0.552, band: "visor" },
      { z: -2.479, h: 0.566, band: "stroke" },
      { z: -2.471, h: 0.585, band: "visor" },
      // The hood, then the screen, the long roof and the tailgate, each as one fair line.
      ...faired(
        [
          [-2.45, 0.62],
          [-2.15, 0.71],
          [-1.45, 0.83],
          [-0.75, 0.905],
          [-0.5, 0.918],
        ],
        [[-2.45, undefined]],
      ),
      { z: -0.5, h: 0.918, band: "cowl" },
      // The screen as one straight run from the cowl to the header: the cockpit hangs its mirror and visors from the
      // point after the screen's start, so that point has to be the header.
      { z: -0.44, h: 0.93, band: "screen" },
      ...faired(
        [
          [0.32, 1.39],
          [0.85, 1.46],
          [1.5, 1.455],
          [2.16, 1.395],
        ],
        [[0.32, undefined]],
        // A station every 10 cm, so none lands a sliver's width from the rear arch's, which would fold the side glass's frame.
        0.1,
      ),
      // The tailgate's glass, raked as a fast estate's is.
      { z: 2.16, h: 1.395, band: "rearGlass" },
      { z: 2.28, h: 1.24, band: "rearGlass", fine: true },
      { z: 2.38, h: 1.06 },
      { z: 2.4, h: 1.035, band: "gap" },
      { z: 2.41, h: 1.02, band: "visor" },
      { z: 2.414, h: 1.006, band: "tailStroke" },
      { z: 2.42, h: 0.98, band: "visor" },
      { z: 2.424, h: 0.966, band: "tailStroke" },
      { z: 2.43, h: 0.94, band: "visor" },
      { z: 2.436, h: 0.918 },
      { z: 2.47, h: 0.72, fine: true },
      { z: 2.495, h: 0.47, band: "mesh" },
      { z: 2.505, h: 0.36, band: "diffuser" },
      { z: 2.51, h: 0.225 },
    ],
    crown: [
      [-2.51, -0.02],
      [-2.0, -0.07],
      [-1.45, -0.09],
      [-0.7, -0.06],
      [-0.3, 0.04],
      [0.6, 0.05],
      [2.0, 0.045],
      [2.3, 0.02],
      [2.51, 0.01],
    ],
    shelf: [
      [-2.51, 0],
      [-0.6, 0.02],
      [0.3, 0.06],
      [1.8, 0.07],
      [2.51, 0.03],
    ],
    halfWidth: [
      [-2.51, 0.85],
      [-2.25, 0.95],
      [-1.45, 0.985],
      [0.0, 0.965],
      [1.55, 0.99],
      [2.2, 0.97],
      [2.51, 0.88],
    ],
    hoodSeamZ: [-2.25, -0.55],
    cabin: { dashZ: -0.42, dashH: 0.87, floorH: 0.28, seatZ: 0.5, rearSeatZ: 1.32, endZ: 2.2, seatX: FLOD.trackM * 0.23, seatSurface: "seatTan" },
    cleanEnds: true,
    scoop: [
      [-1.0, 0],
      [-0.4, 0.02],
      [0.9, 0.02],
      [1.1, 0],
    ],
    roofBars: { from: 0.55, to: 2.05, x: 0.57, rise: 0.06 },
    exhausts: { x: [-0.66, -0.54, 0.54, 0.66], h: 0.3, z: 2.49, radius: 0.042 },
  },
};

export const flod: CarSpec = {
  id: FLOD.id,
  name: FLOD.name,
  ride: FLOD.ride,
  paint: "car-paint-flod",
  paints: [
    paint("car-paint-flod", "metallic"),
    paint("car-paint-storm", "metallic"),
    paint("car-paint-silver", "metallic"),
    paint("car-paint-graphite", "matte"),
    paint("car-paint-black", "metallic"),
    paint("car-paint-bronze", "metallic"),
    paint("car-paint-ivory", "pearl", { flip: "car-paint-ivory-flip" }),
    paint("car-paint-orange"),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: FLOD.wheelRadiusM, widthM: 0.295, rimShare: 0.74, spokes: 7, twinSpokes: false, style: "aero" },
  shadowHalf: [0.99, 2.51],
  interior: {
    gauges: "digital",
    wheel: "flat",
    shifter: "lever",
    seats: "sport",
    screen: true,
    colours: { trim: "car-cabin-trim-tan", insert: "car-cabin-insert-tan", headliner: "car-cabin-headliner-dark", glow: "car-cabin-glow-white" },
  },
};
