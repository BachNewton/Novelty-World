import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { projectors, tailLine } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, thirdBrake, type Shape } from "../recipe";

const PIL = driven("pil");
const { sill, sillTop, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Västan's face, its modern take: one dark band the width of the nose, slim lamps at its outer ends and the grille
 * between them, so lamps and grille read as a single line; at the tail, the lamps stand up the sides of the rear
 * window, as on every Västan, and turn in across the tailgate under it.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** The hot hatch's big lower intake, the bumper's paint wrapping round its ends. */
  intake: [
    { surface: "paint", from: sill, to: rail },
    { surface: "grille", from: rail, to: ALL },
  ],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  /** The band's frame: dark the whole width. */
  headDark: [{ surface: "trim", from: belt, to: ALL }],
  /** The lamps at the outer ends, the grille between them. */
  headLamp: [
    { surface: "lensHead", from: belt, to: rail },
    { surface: "grille", from: rail, to: ALL },
  ],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  /** Under the glass, the lamps at the tail's corners, joined across the tailgate by a dark band. */
  tailBar: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "trim", from: rail, to: ALL },
  ],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** The classic recipe's one flourish: a thin line in the paint's stripe colour along the foot of the grille, lamp to lamp. */
const pinstripe: Decal = { on: "front", at: [0, 0.586], size: [0.96, 0.012], surface: "stripe", cells: [8, 1], liftM: 0.014 };

/** Each headlamp's daytime line: a bar of light along its top, which turns down at its outer end like an arrowhead. */
const daylights: Decal[] = [
  { on: "front", at: [0.62, 0.645], size: [0.2, 0.014], surface: "lensHead", mirror: true, cells: [4, 1], liftM: 0.016 },
  { on: "front", at: [0.715, 0.627], size: [0.018, 0.045], surface: "lensHead", mirror: true, cells: [1, 2], liftM: 0.016 },
];

/** A five-door hot hatch: a short nose over the front wheels, an upright cabin, a steep tailgate under a roof spoiler. */
const shape: Shape = {
  trackM: PIL.trackM,
  axleZ: PIL.axleZ,
  wheelRadiusM: PIL.wheelRadiusM,
  tyreWidthM: 0.225,
  noseZ: -2.14,
  tailZ: 2.14,
  halfWidth: 0.9,
  sillH: 0.2,
  flareM: 0.035,
  archClearM: 0.035,
  cornerPullM: [0.14, 0.12],
  grilleH: 0.46,
  lampH: [0.565, 0.665],
  hoodLipH: 0.69,
  hoodH: 0.9,
  cowl: [-0.72, 0.98],
  header: [0.06, 1.4],
  roof: [0.55, 1.45],
  roofEnd: [1.45, 1.41],
  shoulder: [
    [-2.14, 0.6],
    [-1.75, 0.79],
    [-1.26, 0.85],
    [-0.7, 0.86],
    [0.4, 0.885],
    [1.36, 0.92],
    [2.14, 0.9],
  ],
  belt: [
    [-2.14, 0.66],
    [-1.75, 0.85],
    [-1.26, 0.9],
    [-0.72, 0.95],
    [0.4, 0.985],
    [1.36, 1.02],
    [2.14, 1.0],
  ],
  windowTop: [
    [-0.68, 1.0],
    [-0.35, 1.2],
    [0.05, 1.35],
    [0.55, 1.395],
    [1.05, 1.375],
    [1.32, 1.33],
  ],
  windowZ: [-0.68, 1.32],
  railWidth: [
    [-2.14, 0.46],
    [-1.26, 0.68],
    [-0.72, 0.74],
    [0.06, 0.68],
    [0.8, 0.66],
    [1.45, 0.64],
    [1.9, 0.55],
    [2.14, 0.5],
  ],
  tail: [],
  seams: [-0.66, 0.36, 0.95],
  pillars: [[0.32, 0.4]],
  mirror: { z: -0.55, h: 1.03, x: 0.86 },
  rearPlateH: 0.77,
  cabinEndZ: 1.3,
  decals: [
    ...plates(0.77, 0.36),
    ...handles([-0.12, 0.84], 0.93),
    pinstripe,
    // A vent at each corner of the bumper, either side of the intake.
    { on: "front", at: [0.6, 0.4], size: [0.13, 0.07], surface: "grille", mirror: true, cells: [3, 2], liftM: 0.012 },
    ...daylights,
    ...projectors({ x: [0.48, 0.56], h: 0.61, size: 0.036 }),
    // The light bar across the tailgate's dark band, joining the lamps at its ends: lit with them, by day a red line.
    { ...tailLine({ h: 0.965, wide: 1.0, thick: 0.022 }), cells: [10, 1], liftM: 0.012 },
    reversing(0.42, 0.56),
    thirdBrake(1.47, 0.36),
  ],
  blocks: [
    // The roof spoiler: the roof drawn on past the tailgate's glass, thinning to a lip.
    { at: [0, 1.4, 1.56], size: [1.22, 0.07, 0.2], surface: "paint", taper: [0.94, 0.4] },
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.1, h: 0.3, band: "bumper" },
      { z: -2.13, h: 0.33, band: "intake" },
      { z: -2.14, h: 0.46 },
      { z: -2.138, h: 0.545, band: "gap" },
      { z: -2.136, h: 0.55, band: "headDark" },
      { z: -2.128, h: 0.565, band: "headLamp" },
      { z: -2.105, h: 0.665, band: "headDark" },
      { z: -2.098, h: 0.68 },
      // The hood, then the screen, roof and tailgate's glass, each as one fair line.
      ...faired(
        [
          [-2.085, 0.695],
          [-1.6, 0.82],
          [-1.1, 0.9],
          [-0.8, 0.955],
        ],
        [[-2.09, undefined]],
      ),
      { z: -0.8, h: 0.955, band: "cowl" },
      ...faired(
        [
          [-0.72, 0.98],
          [-0.3, 1.2],
          [0.06, 1.4],
          [0.55, 1.45],
          [1.1, 1.44],
          [1.5, 1.4],
          [1.72, 1.25],
          [1.9, 1.06],
        ],
        [
          [-0.72, "screen"],
          [0.06, undefined],
          [1.5, "rearGlass"],
        ],
      ),
      { z: 1.9, h: 1.06, band: "tailBar" },
      { z: 1.955, h: 0.87 },
      { z: 2.04, h: 0.67, band: "gap" },
      { z: 2.045, h: 0.66 },
      { z: 2.13, h: 0.46, band: "diffuser" },
      { z: 2.12, h: 0.27 },
    ],
    crown: [
      [-2.14, 0.02],
      [-1.26, 0.0],
      [-0.8, 0.02],
      [-0.4, 0.055],
      [0.5, 0.07],
      [1.4, 0.06],
      [2.14, 0.03],
    ],
    shelf: [
      [-2.14, 0],
      [-1.26, 0.02],
      [-0.6, 0.04],
      [0.5, 0.05],
      [1.36, 0.07],
      [2.14, 0.04],
    ],
    halfWidth: [
      [-2.14, 0.74],
      [-1.9, 0.86],
      [-1.26, 0.9],
      [-0.6, 0.88],
      [0.4, 0.885],
      [1.36, 0.905],
      [1.9, 0.885],
      [2.14, 0.8],
    ],
    hoodSeamZ: [-2.0, -0.85],
    cleanEnds: true,
    // The chin lifts towards the nose, so the bumper's foot stays clear of the sill where the corners turn.
    sill: [
      [-2.14, 0.29],
      [-1.74, 0.21],
      [0, 0.2],
      [1.74, 0.22],
      [2.14, 0.27],
    ],
    exhausts: { x: [-0.08, 0.08], h: 0.35, z: 2.16, radius: 0.042, open: true },
  },
};

export const pil: CarSpec = {
  id: PIL.id,
  name: PIL.name,
  ride: PIL.ride,
  paint: "car-paint-pil-red",
  paints: [
    paint("car-paint-pil-red", "solid", { stripe: "car-paint-pil-red" }),
    paint("car-paint-white", "solid", { stripe: "car-paint-pil-red" }),
    paint("car-paint-grey", "metallic", { stripe: "car-paint-pil-red" }),
    paint("car-paint-black", "pearl", { flip: "car-paint-midnight", stripe: "car-paint-pil-red" }),
    paint("car-paint-ultramarine", "metallic", { stripe: "car-paint-pil-red" }),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: PIL.wheelRadiusM, widthM: 0.225, rimShare: 0.72, spokes: 5, twinSpokes: true, style: "split", stripedCalipers: true },
  shadowHalf: [0.92, 2.14],
  /**
   * A modern hot hatch's cockpit: one digital cluster, a flat-bottomed wheel, bolstered seats whose inserts are a check
   * of red and Västan blue lines on dark cloth, and a round knob on the lever with a red band round it; red rings round
   * the vents, and red light after dark.
   */
  interior: {
    gauges: "digital",
    wheel: "flat",
    shifter: "lever",
    knob: "ball",
    seats: "sport",
    screen: true,
    seatCheck: ["car-cabin-hot-red", "car-cabin-vastan"],
    // A little higher than the cabin seats it, and the speed set aside in the cluster, so the wheel's hub hides neither.
    eye: [0, 0.035, 0],
    speedAside: true,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-insert", headliner: "car-cabin-headliner-dark", accent: "car-cabin-hot-red", glow: "car-cabin-glow-red" },
  },
};
