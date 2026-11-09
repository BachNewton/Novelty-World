import { ROWS, type Band, type Block, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, projectors, splitter } from "../parts";
import { bodyOf, driven, faired, handles, plates, reflector, reversing, thirdBrake, type Shape } from "../recipe";

const SKERRY = driven("skerry-gt");
const { sill, sillTop, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Tärna's signature, as Åska, Virvel and Strimma wear it: a line of light the whole width of each end, turned down at
 * its outer ends into a short fang. The Skerry GT, the front-engined one, carries it high, right under the bonnet's lip
 * over a wide mouth, and on its tail under the ducktail, a bar of light the player follows all game.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** One wide mouth for the six's radiator, which a painted blade (a block) crosses. */
  mouth: [{ surface: "grille", from: sillTop, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  headDark: [{ surface: "trim", from: belt, to: rail }],
  headLamp: [{ surface: "lensHead", from: windowBase, to: ALL }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  tailBar: [{ surface: "lensTail", from: windowBase, to: ALL }],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** The bracket's fang at each outer end: a lens turned down from the line, in a dark housing that frames it. */
const fangs = (on: "front" | "rear", x: number, h: number, surface: Decal["surface"]): Decal[] => [
  { on, at: [x, h], size: [0.055, 0.1], surface: "trim", mirror: true, cells: [2, 4], liftM: 0.008, fine: true },
  { on, at: [x + 0.005, h - 0.005], size: [0.028, 0.085], surface, mirror: true, cells: [1, 4], liftM: 0.016 },
];

/** A gill behind each front wheel, where the engine bay breathes out: a dark slot with a painted blade along it. */
const gills: Block[] = [{ at: [0.9, 0.66, -0.78], size: [0.03, 0.016, 0.24], surface: "paint", mirror: true, taper: [1, 0.7], fine: true }];

/**
 * A front-engined sports fastback with a straight six: a long bonnet with a bulge down its middle, the cabin set well
 * behind the front axle, a fastback of glass falling to a ducktail, and hips that swell over the driven rear wheels.
 */
const shape: Shape = {
  trackM: SKERRY.trackM,
  axleZ: SKERRY.axleZ,
  wheelRadiusM: SKERRY.wheelRadiusM,
  tyreWidthM: 0.235,
  noseZ: -2.2,
  tailZ: 2.2,
  halfWidth: 0.9,
  sillH: 0.19,
  flareM: 0.04,
  archClearM: 0.045,
  grilleH: 0.47,
  lampH: [0.57, 0.6],
  hoodLipH: 0.615,
  hoodH: 0.81,
  cowl: [-0.48, 0.92],
  header: [0.1, 1.33],
  roof: [0.45, 1.41],
  roofEnd: [0.85, 1.38],
  shoulder: [
    [-2.2, 0.5],
    [-1.85, 0.68],
    [-1.3, 0.77],
    [-0.5, 0.79],
    [0.3, 0.81],
    [1.3, 0.89],
    [2.2, 0.88],
  ],
  belt: [
    [-2.2, 0.55],
    [-1.85, 0.73],
    [-1.3, 0.83],
    [-0.5, 0.88],
    [0.3, 0.905],
    [1.3, 0.97],
    [2.2, 0.95],
  ],
  windowTop: [
    [-0.45, 0.95],
    [-0.2, 1.1],
    [0.1, 1.27],
    [0.45, 1.35],
    [0.85, 1.31],
    [1.05, 1.22],
    [1.2, 1.12],
  ],
  windowZ: [-0.45, 1.2],
  railWidth: [
    [-2.2, 0.5],
    [-1.3, 0.72],
    [-0.5, 0.74],
    [0.1, 0.62],
    [0.6, 0.6],
    [1.3, 0.66],
    [2.2, 0.62],
  ],
  tail: [],
  seams: [-0.42, 0.52],
  pillars: [[0.58, 0.65]],
  mirror: { z: -0.28, h: 0.99, x: 0.82 },
  rearPlateH: 0.68,
  rearSeats: false,
  cabinEndZ: 1.0,
  decals: [
    ...plates(0.68, 0.37),
    ...handles([0.28], 0.86),
    ...fangs("front", 0.7, 0.57, "lensHead"),
    ...fangs("rear", 0.72, 1.0, "lensTail"),
    ...projectors({ x: [0.48, 0.58], h: 0.584, size: 0.026 }),
    thirdBrake(1.9, 0.4),
    reversing(0.4, 0.84),
    reflector(0.66, 0.56),
    { on: "side", at: [-0.78, 0.66], size: [0.26, 0.05], surface: "grille", mirror: true, cells: [4, 1], liftM: 0.018 },
  ],
  blocks: [
    // A painted blade across the mouth, from fender to fender.
    { at: [0, 0.385, -2.195], size: [1.08, 0.028, 0.05], surface: "paint" },
    splitter({ z: -2.25, h: 0.26, halfWidth: 0.6, long: 0.12 }),
    ...diffuser({ z: 1.95, tailZ: 2.19, h: 0.31, x: [0.2, 0.32] }),
    ...gills,
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.205, h: 0.26, band: "bumper" },
      { z: -2.2, h: 0.28, band: "mouth" },
      { z: -2.195, h: 0.47, band: "gap" },
      { z: -2.19, h: 0.48 },
      { z: -2.185, h: 0.56, band: "headDark" },
      // The line of light is a lens set back in its housing, deep enough to read as a lamp and not a stripe.
      { z: -2.168, h: 0.568, band: "headLamp" },
      { z: -2.166, h: 0.6, band: "headDark" },
      ...faired(
        [
          [-2.15, 0.615],
          [-1.8, 0.72],
          [-1.3, 0.81],
          [-0.55, 0.9],
        ],
        [[-2.15, undefined]],
      ),
      { z: -0.55, h: 0.9, band: "cowl" },
      ...faired(
        [
          [-0.48, 0.92],
          [-0.2, 1.12],
          [0.1, 1.33],
          [0.45, 1.41],
          [0.85, 1.38],
          [1.3, 1.22],
          [1.75, 1.075],
          [2.02, 1.09],
        ],
        [
          [-0.48, "screen"],
          [0.125, undefined],
          [1.2, "rearGlass"],
          [1.66, undefined],
        ],
      ),
      { z: 2.02, h: 1.09, band: "gap" },
      { z: 2.03, h: 1.06, band: "tailDark" },
      { z: 2.045, h: 1.035, band: "tailBar" },
      { z: 2.06, h: 0.995, band: "tailDark" },
      { z: 2.075, h: 0.965 },
      { z: 2.16, h: 0.72 },
      { z: 2.19, h: 0.47, band: "diffuser" },
      { z: 2.2, h: 0.29 },
    ],
    sill: [
      [-2.2, 0.21],
      [-1.8, 0.2],
      [0, 0.19],
      [1.8, 0.21],
      [2.2, 0.25],
    ],
    crown: [
      [-2.2, 0.02],
      [-1.3, 0.04],
      [-0.6, 0.035],
      [0, 0.05],
      [0.6, 0.06],
      [1.3, 0.02],
      [1.8, -0.02],
      [2.2, 0.01],
    ],
    shelf: [
      [-2.2, 0],
      [-1.3, 0.03],
      [-0.5, 0.06],
      [0.3, 0.1],
      [1.0, 0.13],
      [1.6, 0.1],
      [2.2, 0.03],
    ],
    halfWidth: [
      [-2.2, 0.74],
      [-1.9, 0.86],
      [-1.3, 0.885],
      [-0.6, 0.86],
      [0.3, 0.87],
      [1.3, 0.9],
      [1.9, 0.885],
      [2.2, 0.82],
    ],
    scoop: [
      [-0.8, 0],
      [0, 0.015],
      [0.8, 0],
    ],
    hoodSeamZ: [-2.0, -0.62],
    cornerPullM: [0.16, 0.12],
    exhausts: { x: [-0.56, -0.46, 0.46, 0.56], h: 0.35, z: 2.21, radius: 0.036, open: true },
  },
};

export const skerryGt: CarSpec = {
  id: SKERRY.id,
  name: SKERRY.name,
  ride: SKERRY.ride,
  paint: "car-paint-signal-red",
  paints: [
    paint("car-paint-signal-red"),
    paint("car-paint-silver", "metallic"),
    paint("car-paint-racing-green", "metallic"),
    paint("car-paint-midnight", "metallic"),
    paint("car-paint-ivory", "pearl", { flip: "car-paint-ivory-flip" }),
    paint("car-paint-graphite", "matte"),
    paint("car-paint-aska", "metallic"),
  ],
  body: bodyOf(shape),
  /** Tärna's grand tourer, the analogue way: two dials in a hooded binnacle, a round wheel, a lever, sports seats in tan leather with Tärna-blue accents. */
  interior: {
    gauges: "analogue",
    wheel: "round",
    shifter: "lever",
    seats: "sport",
    screen: true,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim-tan", insert: "car-cabin-insert-tan", headliner: "car-cabin-headliner-dark", accent: "car-cabin-tarna", glow: "car-cabin-glow-ice" },
    eye: [0, -0.04, 0],
  },
  wheel: { radiusM: SKERRY.wheelRadiusM, widthM: 0.235, rimShare: 0.74, spokes: 5, twinSpokes: true, style: "blade" },
  shadowHalf: [0.92, 2.2],
};
