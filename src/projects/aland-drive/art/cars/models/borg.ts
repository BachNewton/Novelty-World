import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { louvres, sideIntake } from "../parts";
import { bodyOf, driven, faired, handles, plates, reflector, reversing, thirdBrake, type Shape } from "../recipe";

const BORG = driven("borg");
const { sillTop, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Valtor's signature on an upright face: the visor of dark glass runs the whole width of the nose and of the tailgate,
 * and at its outer ends the two parallel strokes of light, one over the other, turn the corner onto the flank.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: 0, to: ALL }],
  /** A tall intake under the visor, the full width between the brake ducts. */
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
  /** The rear bumper's lower panel, a dark skid plate between the corners. */
  skid: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** A tall, square luxury four-by-four: a high flat hood, an upright screen, a long flat roof and a near-vertical tailgate. */
const shape: Shape = {
  trackM: BORG.trackM,
  axleZ: BORG.axleZ,
  wheelRadiusM: BORG.wheelRadiusM,
  tyreWidthM: 0.295,
  noseZ: -2.46,
  tailZ: 2.46,
  halfWidth: 1.01,
  sillH: 0.42,
  rearSillH: 0.44,
  flareM: 0.022,
  cornerPullM: [0.1, 0.07],
  archClearM: 0.06,
  grilleH: 0.86,
  lampH: [0.9, 0.99],
  hoodLipH: 1.07,
  hoodH: 1.13,
  cowl: [-0.55, 1.16],
  header: [-0.24, 1.8],
  roof: [0.4, 1.885],
  roofEnd: [2.26, 1.86],
  shoulder: [
    [-2.46, 0.96],
    [-2.2, 1.06],
    [-1.47, 1.09],
    [-0.5, 1.11],
    [0.6, 1.12],
    [1.48, 1.13],
    [2.2, 1.13],
    [2.46, 1.08],
  ],
  belt: [
    [-2.46, 1.0],
    [-2.2, 1.1],
    [-1.47, 1.14],
    [-0.5, 1.18],
    [0.6, 1.2],
    [1.48, 1.21],
    [2.2, 1.21],
    [2.46, 1.18],
  ],
  windowTop: [
    [-0.5, 1.24],
    [-0.36, 1.48],
    [-0.2, 1.72],
    [0.3, 1.78],
    [1.5, 1.785],
    [2.1, 1.77],
    [2.24, 1.7],
  ],
  windowZ: [-0.5, 2.24],
  railWidth: [
    [-2.46, 0.7],
    [-1.47, 0.86],
    [-0.5, 0.9],
    [0.0, 0.885],
    [1.5, 0.88],
    [2.2, 0.875],
    [2.46, 0.83],
  ],
  tail: [],
  seams: [-0.46, 0.46, 1.24],
  pillars: [
    [0.4, 0.5],
    [1.3, 1.44],
  ],
  mirror: { z: -0.36, h: 1.3, x: 1.0 },
  rearPlateH: 0.98,
  rearSeats: true,
  cabinEndZ: 2.2,
  seat: "seatTan",
  decals: [
    ...plates(0.98, 0.58, { rearRecessed: true }),
    // Each pair of strokes drawn on inward across the visor, so the signature reads at chase distance and at night.
    ...[0.925, 0.965].map((h): Decal => ({ on: "front", at: [0.62, h], size: [0.26, 0.016], surface: "lensHead", mirror: true, cells: [3, 1], liftM: 0.012 })),
    ...[1.37, 1.335].map((h): Decal => ({ on: "rear", at: [0.64, h], size: [0.3, 0.016], surface: "lensTail", mirror: true, cells: [3, 1], liftM: 0.012 })),
    ...handles([0.05, 0.95], 1.13),
    reversing(0.36, 0.7),
    // The tailgate's handle, a dark strip across it over the plate.
    { on: "rear", at: [0, 1.085], size: [0.62, 0.022], surface: "trim", cells: [4, 1], fine: true, liftM: 0.012 },
    reflector(0.78, 0.66),
    { ...thirdBrake(2.24, 0.42), liftM: 0.012 },
    // Valtor's fender vent behind each front wheel, set high on the upright flank.
    { ...sideIntake({ z: -0.85, h: 0.98, long: 0.34, tall: 0.09 }), cells: [3, 1], liftM: 0.014 },
    ...louvres({ x: 0.42, z: -1.5, long: 0.4, wide: 0.16, count: 5 }),
    // A brake duct at each outer corner of the bumper, under the intake.
    { on: "front", at: [0.8, 0.7], size: [0.18, 0.12], surface: "grille", mirror: true, cells: [2, 1], liftM: 0.012 },
  ],
  blocks: [
    // A blade of the body's colour across the intake, so it reads as a shaped duct and not a hole.
    { at: [0, 0.74, -2.462], size: [1.1, 0.026, 0.05], surface: "paint", taper: [1, 1], fine: true },
    // A brushed skid plate under the nose, standing proud of the bumper's foot.
    { at: [0, 0.55, -2.43], size: [1.0, 0.05, 0.12], surface: "rack", taper: [0.9, 1] },
    // Each fender vent as a duct: a blade of the body's colour along it and a lip over it, tapering back.
    { at: [1.0, 0.98, -0.85], size: [0.04, 0.02, 0.32], surface: "paint", mirror: true, taper: [1, 0.6], fine: true },
    { at: [0.99, 1.03, -0.85], size: [0.05, 0.014, 0.34], surface: "paint", mirror: true, taper: [0.8, 0.6], fine: true },
    // The side pipes' outlets, a dark box in each sill ahead of the rear wheel.
    { at: [0.97, 0.5, 0.8], size: [0.08, 0.13, 0.32], surface: "trim", mirror: true },
    // A roof spoiler over the tailgate's glass, in the body's colour.
    { at: [0, 1.875, 2.27], size: [1.5, 0.026, 0.1], surface: "paint", taper: [0.96, 0.6] },
    // The rear skid plate, brushed, under the bumper.
    { at: [0, 0.6, 2.43], size: [1.0, 0.05, 0.1], surface: "rack", taper: [0.9, 1] },
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.4, h: 0.5, band: "bumper" },
      { z: -2.455, h: 0.62, band: "mouth" },
      { z: -2.46, h: 0.86 },
      { z: -2.458, h: 0.895, band: "visor" },
      { z: -2.457, h: 0.915, band: "stroke" },
      { z: -2.456, h: 0.935, band: "visor" },
      { z: -2.455, h: 0.955, band: "stroke" },
      { z: -2.454, h: 0.975, band: "visor" },
      { z: -2.452, h: 1.0 },
      // The hood, then the screen, the long roof and the tailgate, each as one fair line.
      ...faired(
        [
          [-2.42, 1.07],
          [-2.2, 1.1],
          [-1.47, 1.125],
          [-0.75, 1.14],
          [-0.6, 1.145],
        ],
        [[-2.42, undefined]],
      ),
      { z: -0.6, h: 1.145, band: "cowl" },
      // The screen as one straight run from the cowl to the header: the cockpit hangs its mirror and visors from the
      // point after the screen's start, so that point has to be the header.
      { z: -0.55, h: 1.16, band: "screen" },
      ...faired(
        [
          [-0.24, 1.8],
          [0.4, 1.885],
          [1.4, 1.888],
          [2.26, 1.86],
        ],
        [[-0.24, undefined]],
        0.1,
      ),
      // The tailgate's glass, nearly upright.
      { z: 2.26, h: 1.86, band: "rearGlass" },
      { z: 2.37, h: 1.43 },
      { z: 2.385, h: 1.41, band: "gap" },
      { z: 2.392, h: 1.395, band: "visor" },
      { z: 2.396, h: 1.38, band: "tailStroke" },
      { z: 2.4, h: 1.36, band: "visor" },
      { z: 2.404, h: 1.345, band: "tailStroke" },
      { z: 2.408, h: 1.325, band: "visor" },
      { z: 2.412, h: 1.3 },
      { z: 2.44, h: 0.86, fine: true },
      { z: 2.45, h: 0.78, band: "bumper" },
      { z: 2.46, h: 0.72, band: "skid" },
      { z: 2.455, h: 0.6, band: "bumper" },
      { z: 2.42, h: 0.52 },
    ],
    crown: [
      [-2.46, 0.0],
      [-2.0, -0.025],
      [-1.47, -0.03],
      [-0.7, -0.015],
      [-0.3, 0.04],
      [0.6, 0.045],
      [2.0, 0.04],
      [2.3, 0.02],
      [2.46, 0.01],
    ],
    shelf: [
      [-2.46, 0],
      [-0.9, 0.02],
      [0.0, 0.03],
      [2.0, 0.03],
      [2.46, 0.02],
    ],
    halfWidth: [
      [-2.46, 0.9],
      [-2.3, 0.98],
      [-1.47, 1.008],
      [0.0, 1.01],
      [1.48, 1.01],
      [2.2, 1.0],
      [2.46, 0.95],
    ],
    hoodSeamZ: [-2.3, -0.65],
    cabin: { dashZ: -0.53, dashH: 1.16, floorH: 0.58, seatZ: 0.42, rearSeatZ: 1.3, endZ: 2.2, seatX: BORG.trackM * 0.23, seatSurface: "seatTan" },
    cleanEnds: true,
    // Arch extensions in the sill's cladding: the flares of a four-by-four built to be used.
    archLipM: 0.05,
    roofBars: { from: -0.05, to: 2.1, x: 0.8, rise: 0.06 },
    sideExhausts: { z: [0.72, 0.88], h: 0.5, x: 1.04, radius: 0.05 },
  },
};

export const borg: CarSpec = {
  id: BORG.id,
  name: BORG.name,
  ride: BORG.ride,
  paint: "car-paint-storm",
  paints: [
    paint("car-paint-storm", "metallic"),
    paint("car-paint-silver", "metallic"),
    paint("car-paint-graphite", "matte"),
    paint("car-paint-concrete"),
    paint("car-paint-black", "metallic"),
    paint("car-paint-flod", "metallic"),
    paint("car-paint-orange"),
    paint("car-paint-olive"),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: BORG.wheelRadiusM, widthM: 0.295, rimShare: 0.7, spokes: 6, twinSpokes: false, style: "aero" },
  shadowHalf: [1.01, 2.46],
  interior: {
    gauges: "digital",
    wheel: "round",
    shifter: "lever",
    seats: "comfort",
    quilted: true,
    screen: true,
    // The speed set inside the arc's left, clear of the wheel's right spoke, which crosses the middle of the cluster here.
    speedAside: true,
    colours: { trim: "car-cabin-trim-tan", insert: "car-cabin-insert-tan", headliner: "car-cabin-headliner-dark", glow: "car-cabin-glow-white" },
  },
};
