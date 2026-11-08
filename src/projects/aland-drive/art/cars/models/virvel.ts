import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, louvres, projectors, sideIntake, splitter } from "../parts";
import { bodyOf, driven, handles, plates, thirdBrake, type Shape } from "../recipe";

const VIRVEL = driven("virvel");
const { sill, sillTop, belt, windowBase, rail, roofInner, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Tärna's signature, as Åska wears it: a line of light the whole width of each end, turned down at its outer ends into
 * a short fang. On Virvel it sits higher on a taller face, over three intakes rather than two.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** One wide intake, which two painted struts (blocks) divide into three. */
  mouth: [{ surface: "grille", from: sillTop, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  headDark: [{ surface: "trim", from: belt, to: rail }],
  headLamp: [{ surface: "lensHead", from: windowBase, to: ALL }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  /** The engine cover: a dark vent down its middle between painted buttresses, the V8's two banks standing in it. */
  deck: [{ surface: "grille", from: roofInner, to: ALL }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  tailBar: [{ surface: "lensTail", from: windowBase, to: ALL }],
  /** A band of paint under the lamp, the gearbox's mesh in its middle. */
  panel: [{ surface: "grille", from: roofInner, to: ALL }],
  diffuser: [{ surface: "grille", from: sill, to: ALL }],
};

const fangs = (on: "front" | "rear", h: number, surface: Decal["surface"]): Decal => ({ on, at: [0.8, h], size: [0.024, 0.08], surface, mirror: true, cells: [1, 3], liftM: 0.01 });

/**
 * A mid-engined V8 supercar: a little taller and shorter than Åska, its cabin further back on a longer nose, a short
 * engine deck with a window over the engine, a ducktail instead of a wing, and big intakes scooped into its flanks.
 */
const shape: Shape = {
  trackM: VIRVEL.trackM,
  axleZ: VIRVEL.axleZ,
  wheelRadiusM: VIRVEL.wheelRadiusM,
  tyreWidthM: 0.29,
  noseZ: -2.26,
  tailZ: 2.26,
  halfWidth: 1.0,
  sillH: 0.12,
  flareM: 0.035,
  archClearM: 0.035,
  grilleH: 0.4,
  lampH: [0.47, 0.49],
  hoodLipH: 0.52,
  hoodH: 0.7,
  cowl: [-0.92, 0.78],
  header: [-0.32, 1.12],
  roof: [0.05, 1.17],
  roofEnd: [0.4, 1.14],
  shoulder: [
    [-2.26, 0.42],
    [-1.9, 0.62],
    [-1.42, 0.79],
    [-0.85, 0.67],
    [0.1, 0.7],
    [0.85, 0.79],
    [1.22, 0.82],
    [2.26, 0.79],
  ],
  belt: [
    [-2.26, 0.48],
    [-1.9, 0.66],
    [-1.42, 0.82],
    [-0.92, 0.77],
    [-0.3, 0.76],
    [0.4, 0.82],
    [1.22, 0.86],
    [2.26, 0.84],
  ],
  windowTop: [
    [-0.89, 0.8],
    [-0.6, 0.93],
    [-0.25, 1.06],
    [0.05, 1.1],
    [0.35, 1.06],
    [0.62, 0.96],
    [0.82, 0.88],
  ],
  windowZ: [-0.89, 0.82],
  railWidth: [
    [-2.26, 0.6],
    [-1.42, 0.84],
    [-0.92, 0.74],
    [-0.32, 0.6],
    [0.05, 0.57],
    [0.6, 0.62],
    [1.22, 0.78],
    [2.26, 0.84],
  ],
  tail: [],
  seams: [-0.8, 0.22],
  pillars: [[0.36, 0.42]],
  mirror: { z: -0.55, h: 0.9, x: 0.83 },
  rearPlateH: 0.55,
  rearSeats: false,
  cabinEndZ: 0.6,
  seat: "seatTan",
  decals: [
    ...plates(0.56, 0.3),
    ...handles([-0.04], 0.75),
    fangs("front", 0.455, "lensHead"),
    fangs("rear", 0.865, "lensTail"),
    ...projectors({ x: [0.56, 0.66], h: 0.465, size: 0.028 }),
    sideIntake({ z: 0.53, h: 0.52, long: 0.5, tall: 0.36 }),
    thirdBrake(1.98, 0.42),
    // The radiators' outlets in the hood.
    ...louvres({ x: 0.27, z: -1.98, long: 0.3, wide: 0.3, count: 4 }),
  ],
  blocks: [
    // A strake of the body's colour standing in each intake's mouth, so it reads as a duct and not a hole.
    { at: [0.95, 0.52, 0.36], size: [0.05, 0.32, 0.035], surface: "paint", mirror: true, taper: [0.7, 0.9] },
    // The struts standing in the mouth.
    { at: [0.43, 0.34, -2.235], size: [0.035, 0.12, 0.05], surface: "paint", mirror: true },
    splitter({ z: -2.29, h: 0.21, halfWidth: 0.66, long: 0.12 }),
    ...diffuser({ z: 1.92, tailZ: 2.24, h: 0.22, x: [0.16, 0.48] }),
    // The V8's two banks under the engine cover, in the body's colour, standing out of its dark vent.
    { at: [0.15, 0.955, 1.16], size: [0.11, 0.05, 0.66], surface: "paint", mirror: true, taper: [0.8, 0.7] },
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.265, h: 0.26, band: "bumper" },
      { z: -2.26, h: 0.28, band: "mouth" },
      { z: -2.255, h: 0.4, band: "gap" },
      { z: -2.25, h: 0.41 },
      { z: -2.24, h: 0.44, band: "headDark" },
      { z: -2.232, h: 0.45, band: "headLamp" },
      { z: -2.222, h: 0.475, band: "headDark" },
      { z: -2.21, h: 0.49 },
      { z: -2.12, h: 0.52, fine: true },
      { z: -1.95, h: 0.57 },
      { z: -1.7, h: 0.62, fine: true },
      { z: -1.45, h: 0.665 },
      { z: -1.25, h: 0.7, fine: true },
      { z: -1.08, h: 0.73 },
      { z: -0.98, h: 0.755, band: "cowl" },
      { z: -0.92, h: 0.78, band: "screen" },
      { z: -0.32, h: 1.12 },
      { z: 0.05, h: 1.17 },
      { z: 0.4, h: 1.14, band: "rearGlass" },
      { z: 0.78, h: 0.95, band: "deck" },
      { z: 1.15, h: 0.94, band: "deck", fine: true },
      { z: 1.55, h: 0.935 },
      { z: 1.9, h: 0.94, fine: true },
      { z: 2.1, h: 0.955, band: "gap" },
      { z: 2.11, h: 0.94, band: "tailDark" },
      { z: 2.122, h: 0.92, band: "tailBar" },
      { z: 2.136, h: 0.882, band: "tailDark" },
      { z: 2.148, h: 0.852, band: "panel" },
      { z: 2.19, h: 0.64, band: "diffuser" },
      { z: 2.245, h: 0.42 },
      { z: 2.26, h: 0.23 },
    ],
    crown: [
      [-2.26, 0.02],
      [-1.9, -0.05],
      [-1.42, -0.16],
      [-1.0, -0.06],
      [-0.7, 0.04],
      [0.2, 0.05],
      [0.75, 0.02],
      [1.22, -0.1],
      [1.9, -0.06],
      [2.26, 0.01],
    ],
    shelf: [
      [-2.26, 0],
      [-1.42, 0.03],
      [-0.92, 0.11],
      [-0.32, 0.28],
      [0.35, 0.3],
      [0.95, 0.18],
      [1.6, 0.07],
      [2.26, 0.02],
    ],
    halfWidth: [
      [-2.26, 0.78],
      [-1.95, 0.93],
      [-1.42, 0.99],
      [-0.6, 0.95],
      [0.3, 0.97],
      [1.22, 1.0],
      [1.9, 0.98],
      [2.26, 0.88],
    ],
    hoodSeamZ: [-2.05, -0.95],
    cleanEnds: true,
    scoop: [
      [-0.6, 0],
      [-0.1, 0.02],
      [0.3, 0.05],
      [0.7, 0.07],
      [0.92, 0.03],
      [1.05, 0],
    ],
    exhausts: { x: [-0.32, -0.21, 0.21, 0.32], h: 0.45, z: 2.24, radius: 0.048 },
  },
};

export const virvel: CarSpec = {
  id: VIRVEL.id,
  name: VIRVEL.name,
  ride: VIRVEL.ride,
  paint: "car-paint-virvel",
  paints: [
    paint("car-paint-virvel", "metallic"),
    paint("car-paint-signal-red"),
    paint("car-paint-lemon"),
    paint("car-paint-white"),
    paint("car-paint-black", "metallic"),
    paint("car-paint-aubergine", "pearl", { flip: "car-paint-aubergine-flip" }),
    paint("car-paint-graphite", "matte"),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: VIRVEL.wheelRadiusM, widthM: 0.29, rimShare: 0.75, spokes: 5, twinSpokes: true, style: "split" },
  shadowHalf: [1.0, 2.26],
  // Tärna's sporting cabin: two dials and a screen between them, a flat-bottomed wheel, shell seats in tan, and a dark
  // headliner so the pillars framing the screen don't glare grey.
  interior: {
    gauges: "analogue",
    wheel: "flat",
    seats: "bucket",
    screen: true,
    colours: { insert: "car-cabin-insert-tan", headliner: "car-cabin-headliner-dark", glow: "car-cabin-glow-amber" },
    turnsToLock: 1.2,
  },
};
