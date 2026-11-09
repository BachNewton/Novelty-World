import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, louvres, sideIntake, splitter } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const ALTURA = driven("altura");
const { sill, sillTop, belt, windowBase, rail, roofOuter, roofInner, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Castellane's face is its lamps in pairs: two small lamps side by side at each end of a dark visor across the nose,
 * the paint carried between them, and at the tail two square lamps a side on a dark panel under a lip. A Castellane
 * of any decade wears its lights two by two.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** One slim mouth the width of the nose. */
  mouth: [{ surface: "grille", from: sillTop, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  /** The visor: dark at each end where the lamps sit, the nose's paint carried between them. */
  visor: [{ surface: "trim", from: belt, to: rail }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  /** A short, steep window over the engine, between the roof's sails. */
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  /** The engine cover's two slatted vents beside a painted spine. */
  deck: [{ surface: "grille", from: roofOuter, to: roofInner }],
  /** The tail's panel: dark at each end where the square lamps sit, the paint carried between them as on the nose. */
  tailPanel: [{ surface: "trim", from: belt, to: rail }],
  /** The engine's outlet, a mesh across the tail under the lamps. */
  mesh: [{ surface: "grille", from: windowBase, to: ALL }],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** The pairs of lamps: each lens in a thin dark frame of its own, standing off the visor or the tail panel. */
const pair = (on: "front" | "rear", x: readonly [number, number], h: number, size: readonly [number, number], surface: Decal["surface"]): Decal[] =>
  x.flatMap((across): Decal[] => [
    { on, at: [across, h], size: [size[0] + 0.016, size[1] + 0.016], surface: "rimDark", mirror: true, cells: [2, 1], liftM: 0.01, fine: true },
    { on, at: [across, h], size, surface, mirror: true, cells: [3, 2], liftM: 0.018 },
  ]);

/**
 * A 1990s mid-engined supercar: a low wedge of a nose, a glass canopy set in the middle of a wide body over a central
 * driving seat, a short steep window between the roof's sails, a long slatted engine cover and a squared tail under a
 * lip. Its flanks are scooped from the door into an intake ahead of the rear wheels.
 */
const shape: Shape = {
  trackM: ALTURA.trackM,
  axleZ: ALTURA.axleZ,
  wheelRadiusM: ALTURA.wheelRadiusM,
  tyreWidthM: 0.27,
  noseZ: -2.26,
  tailZ: 2.1,
  halfWidth: 0.93,
  sillH: 0.11,
  flareM: 0.03,
  archClearM: 0.035,
  grilleH: 0.33,
  lampH: [0.37, 0.45],
  hoodLipH: 0.47,
  hoodH: 0.64,
  cowl: [-1.1, 0.76],
  header: [-0.5, 1.095],
  roof: [-0.15, 1.13],
  roofEnd: [0.25, 1.095],
  shoulder: [
    [-2.26, 0.42],
    [-1.9, 0.6],
    [-1.5, 0.72],
    [-0.95, 0.7],
    [-0.3, 0.705],
    [0.4, 0.74],
    [1.21, 0.8],
    [2.1, 0.8],
  ],
  belt: [
    [-2.26, 0.455],
    [-1.9, 0.635],
    [-1.5, 0.755],
    [-0.95, 0.735],
    [-0.3, 0.74],
    [0.4, 0.775],
    [1.21, 0.835],
    [2.1, 0.835],
  ],
  windowTop: [
    [-1.07, 0.78],
    [-0.8, 0.925],
    [-0.45, 1.05],
    [-0.15, 1.085],
    [0.15, 1.055],
    [0.42, 0.975],
    [0.62, 0.905],
  ],
  windowZ: [-1.07, 0.62],
  railWidth: [
    [-2.26, 0.58],
    [-1.5, 0.84],
    [-1.1, 0.72],
    [-0.5, 0.6],
    [-0.1, 0.58],
    [0.4, 0.6],
    [1.21, 0.78],
    [2.1, 0.8],
  ],
  tail: [],
  seams: [-1.0, 0.2],
  pillars: [[0.22, 0.3]],
  mirror: { z: -0.78, h: 0.85, x: 0.82 },
  rearPlateH: 0.45,
  rearSeats: false,
  centreSeat: true,
  seat: "seatTan",
  cabinEndZ: 0.55,
  decals: [
    ...plates(0.45, 0.29, { recessed: true }),
    ...handles([0.08], 0.71),
    ...pair("front", [0.45, 0.595], 0.41, [0.125, 0.055], "lensHead"),
    // An amber indicator at each corner, under the visor.
    { on: "front", at: [0.66, 0.345], size: [0.09, 0.022], surface: "lensAmber", mirror: true, cells: [2, 1], liftM: 0.012 },
    ...pair("rear", [0.5, 0.675], 0.75, [0.135, 0.1], "lensTail"),
    reversing(0.585, 0.665),
    sideIntake({ z: 0.62, h: 0.5, long: 0.36, tall: 0.26 }),
    // The radiators' outlets either side of the hood's middle.
    ...louvres({ x: 0.26, z: -1.95, long: 0.26, wide: 0.2, count: 4, liftM: 0.022 }),
    // Slats of the body's colour across the engine cover's vents.
    ...louvres({ x: 0.42, z: 0.66, long: 0.66, wide: 0.3, count: 7, surface: "paint", liftM: 0.022 }),
  ],
  blocks: [
    // The intake's lip over it and its walls at each end, standing out of the scooped flank, so it reads as a duct.
    { at: [0.9, 0.645, 0.62], size: [0.07, 0.018, 0.42], surface: "paint", mirror: true, taper: [1, 0.6], fine: true },
    { at: [0.885, 0.5, 0.43], size: [0.06, 0.28, 0.016], surface: "paint", mirror: true, fine: true },
    { at: [0.875, 0.5, 0.81], size: [0.06, 0.28, 0.016], surface: "paint", mirror: true, fine: true },
    // A blade of the body's colour across the intake, so it reads as a shaped duct and not a hole.
    { at: [0.895, 0.5, 0.62], size: [0.05, 0.026, 0.38], surface: "paint", mirror: true, taper: [1, 0.8], fine: true },
    splitter({ z: -2.3, h: 0.235, halfWidth: 0.6, long: 0.12 }),
    ...diffuser({ z: 1.9, tailZ: 2.07, h: 0.33, x: [0, 0.44] }),
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: -2.262, h: 0.22, band: "bumper" },
      { z: -2.26, h: 0.25, band: "mouth" },
      { z: -2.256, h: 0.33 },
      { z: -2.252, h: 0.35, band: "gap" },
      { z: -2.248, h: 0.36, band: "visor" },
      { z: -2.222, h: 0.46 },
      // The hood, then the screen, roof, rear glass and engine cover, each as one fair line.
      ...faired(
        [
          [-2.21, 0.47],
          [-1.9, 0.55],
          [-1.5, 0.63],
          [-1.15, 0.745],
        ],
        [[-2.21, undefined]],
      ),
      { z: -1.15, h: 0.745, band: "cowl" },
      ...faired(
        [
          [-1.1, 0.76],
          [-0.8, 0.93],
          [-0.5, 1.095],
          [-0.15, 1.13],
          [0.25, 1.095],
          [0.6, 1.0],
          [1.0, 0.935],
          [1.5, 0.895],
          [2.0, 0.89],
        ],
        [
          [-1.1, "screen"],
          [-0.5, undefined],
          [0.25, "rearGlass"],
          [0.62, "deck"],
          [1.35, undefined],
        ],
      ),
      // The lip over the tail, then the dark panel the lamps sit on.
      { z: 2.0, h: 0.89, band: "gap" },
      { z: 2.012, h: 0.87, band: "tailPanel" },
      { z: 2.045, h: 0.64, band: "mesh" },
      { z: 2.052, h: 0.58 },
      { z: 2.075, h: 0.37, band: "diffuser" },
      { z: 2.095, h: 0.24 },
      { z: 2.1, h: 0.22 },
    ],
    crown: [
      [-2.26, 0.02],
      [-1.9, -0.05],
      [-1.5, -0.11],
      [-1.15, -0.04],
      [-0.85, 0.04],
      [0.0, 0.05],
      [0.6, 0.03],
      [1.21, -0.06],
      [1.8, -0.04],
      [2.1, 0.01],
    ],
    shelf: [
      [-2.26, 0],
      [-1.5, 0.03],
      [-1.1, 0.11],
      [-0.5, 0.28],
      [0.2, 0.3],
      [0.9, 0.18],
      [1.6, 0.07],
      [2.1, 0.02],
    ],
    halfWidth: [
      [-2.26, 0.76],
      [-1.95, 0.88],
      [-1.5, 0.925],
      [-0.7, 0.89],
      [0.3, 0.91],
      [1.21, 0.93],
      [1.8, 0.91],
      [2.1, 0.85],
    ],
    // The mirror hangs from where the faired screen meets the roof, not from the screen's foot.
    screenTop: [-0.5, 1.095],
    hoodSeamZ: [-2.05, -1.17],
    cleanEnds: true,
    scoop: [
      [-0.8, 0],
      [-0.3, 0.018],
      [0.3, 0.045],
      [0.65, 0.06],
      [0.86, 0],
    ],
    exhausts: { x: [-0.32, -0.22, 0.22, 0.32], h: 0.31, z: 2.11, radius: 0.04, open: true },
  },
};

export const altura: CarSpec = {
  id: ALTURA.id,
  name: ALTURA.name,
  ride: ALTURA.ride,
  paint: "car-paint-garnet",
  paints: [
    paint("car-paint-garnet", "metallic"),
    paint("car-paint-silver", "metallic"),
    paint("car-paint-saffron"),
    paint("car-paint-racing-green", "metallic"),
    paint("car-paint-black"),
    paint("car-paint-white"),
    paint("car-paint-midnight", "metallic"),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: ALTURA.wheelRadiusM, widthM: 0.27, rimShare: 0.68, spokes: 10, twinSpokes: false, style: "mesh" },
  shadowHalf: [0.93, 2.15],
  /**
   * A 1990s analogue cockpit round a central seat: one big rev counter in a binnacle with white faces, a three-spoke
   * leather wheel, a gated lever, tan leather and bare metal with a gold accent, and no screen.
   */
  interior: {
    gauges: "tacho",
    wheel: "round",
    shifter: "lever",
    seats: "bucket",
    screen: false,
    lightDials: true,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-insert-tan", headliner: "car-cabin-headliner-dark", accent: "car-cabin-gold", glow: "car-cabin-glow-amber" },
    turnsToLock: 1.25,
    eye: [0, 0, 0],
  },
};
