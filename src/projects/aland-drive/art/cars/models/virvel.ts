import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, louvres, projectors, sideIntake, splitter } from "../parts";
import { bodyOf, driven, faired, handles, plates, type Shape } from "../recipe";

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

/** The bracket's fang at each outer end: a lens turned down from the line, in a dark housing that frames it. */
const fangs = (on: "front" | "rear", h: number, surface: Decal["surface"]): Decal[] => [
  { on, at: [0.8, h], size: [0.06, 0.12], surface: "trim", mirror: true, cells: [2, 4], liftM: 0.008, fine: true },
  { on, at: [0.805, h - 0.005], size: [0.03, 0.105], surface, mirror: true, cells: [1, 4], liftM: 0.016 },
];

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
    [-2.26, 0.43],
    [-1.9, 0.62],
    [-1.42, 0.785],
    [-0.92, 0.735],
    [-0.3, 0.725],
    [0.4, 0.785],
    [1.22, 0.825],
    [2.26, 0.8],
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
    ...plates(0.56, 0.31),
    ...handles([-0.04], 0.75),
    ...fangs("front", 0.44, "lensHead"),
    ...fangs("rear", 0.81, "lensTail"),
    ...projectors({ x: [0.54, 0.66], h: 0.462, size: 0.036 }),
    sideIntake({ z: 0.53, h: 0.52, long: 0.5, tall: 0.36 }),
    // The radiators' outlets in the hood.
    ...louvres({ x: 0.27, z: -1.98, long: 0.3, wide: 0.3, count: 4 }),
  ],
  blocks: [
    // A strake of the body's colour standing in each intake's mouth, its lip over it and its wall at the back, standing
    // out of the scooped flank, so it reads as a duct and not a hole.
    { at: [0.95, 0.52, 0.36], size: [0.05, 0.32, 0.035], surface: "paint", mirror: true, taper: [0.7, 0.9], fine: true },
    { at: [0.95, 0.705, 0.53], size: [0.07, 0.018, 0.54], surface: "paint", mirror: true, taper: [1, 0.6], fine: true },
    { at: [0.925, 0.52, 0.785], size: [0.06, 0.34, 0.016], surface: "paint", mirror: true, fine: true },
    // The struts standing in the mouth.
    { at: [0.43, 0.34, -2.235], size: [0.035, 0.12, 0.05], surface: "paint", mirror: true },
    splitter({ z: -2.3, h: 0.26, halfWidth: 0.56, long: 0.16 }),
    ...diffuser({ z: 1.92, tailZ: 2.24, h: 0.22, x: [0.16, 0.48] }),
    // The V8's two banks under the engine cover, in the body's colour, standing out of its dark vent.
    { at: [0.15, 0.955, 1.16], size: [0.13, 0.05, 0.66], surface: "paint", mirror: true, taper: [0.75, 0.4] },
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.265, h: 0.26, band: "bumper" },
      { z: -2.26, h: 0.28, band: "mouth" },
      { z: -2.255, h: 0.4, band: "gap" },
      { z: -2.25, h: 0.41 },
      { z: -2.245, h: 0.44, band: "headDark" },
      // The line of light is a lens set back in its housing, deep enough to read as a lamp and not a stripe.
      { z: -2.228, h: 0.448, band: "headLamp" },
      { z: -2.226, h: 0.476, band: "headDark" },
      // The hood, then the screen, roof, rear glass and engine cover, each as one fair line.
      ...faired(
        [
          [-2.21, 0.49],
          [-1.9, 0.585],
          [-1.42, 0.672],
          [-0.98, 0.755],
        ],
        [[-2.21, undefined]],
      ),
      { z: -0.98, h: 0.755, band: "cowl" },
      ...faired(
        [
          [-0.92, 0.78],
          [-0.6, 0.975],
          [-0.3, 1.12],
          [0.05, 1.17],
          [0.4, 1.13],
          [0.78, 0.955],
          [1.3, 0.92],
          [1.8, 0.9],
          [2.1, 0.905],
        ],
        [
          [-0.92, "screen"],
          [-0.32, undefined],
          [0.4, "rearGlass"],
          [0.78, "deck"],
          [1.55, undefined],
        ],
      ),
      { z: 2.1, h: 0.905, band: "gap" },
      { z: 2.11, h: 0.89, band: "tailDark" },
      { z: 2.122, h: 0.87, band: "tailBar" },
      { z: 2.136, h: 0.832, band: "tailDark" },
      { z: 2.148, h: 0.802, band: "panel" },
      { z: 2.19, h: 0.64, band: "diffuser" },
      { z: 2.245, h: 0.42, band: "diffuser" },
      { z: 2.26, h: 0.29 },
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
      [1.9, 0.97],
      [2.26, 0.86],
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
    exhausts: { x: [-0.32, -0.21, 0.21, 0.32], h: 0.45, z: 2.3, radius: 0.048, open: true, outward: true },
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
  // Tärna's sporting cabin, analogue and digital: two dials with a fine display high between them, the gear over the
  // speed in figures where the wheel's opening shows them, a flat-bottomed wheel, carbon with tan leather and Tärna blue
  // round the dials and vents, a dark headliner, and the eye a little lower so the low roof is a band, not a lid.
  interior: {
    gauges: "analogue",
    centreDisplay: true,
    wheel: "flat",
    seats: "bucket",
    screen: true,
    colours: { dash: "car-cabin-carbon", trim: "car-cabin-carbon", insert: "car-cabin-insert-tan", headliner: "car-cabin-headliner-dark", accent: "car-cabin-tarna", glow: "car-cabin-glow-amber" },
    turnsToLock: 1.2,
    eye: [0, -0.025, 0],
  },
};
