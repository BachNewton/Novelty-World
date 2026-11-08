import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { diffuser, lightLine, louvres, sideIntake, splitter } from "../parts";
import { bodyOf, driven, faired, handles, plates, reflector, reversing, type Shape } from "../recipe";

const VARG = driven("varg");
const { sill, sillTop, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Ridgeway's face is a ridge: a spine of the body's colour runs down the middle of the nose, splitting a big dark
 * intake, and swells into the hood's power bulge. Its lamps are two stacked bars of light at each outer corner, front
 * and rear, "ridge lines", so the car reads as four short double strokes by night. Every band starts and ends on a row
 * the far model has too (`build.ts`, `FAR`).
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** The intake, split by the body's spine down the middle. */
  mouth: [{ surface: "grille", from: windowBase, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/** A stripe along the top, lifted clear of a curved panel. */
const topStripe = (z: number, long: number): Decal => ({ on: "top", at: [0.115, z], size: [0.14, long], surface: "stripe", mirror: true, cells: [1, Math.max(2, Math.round(long / 0.26))], liftM: 0.012 });

/** A front-engined muscle supercar: a long hood with a power bulge, the cabin set far back, a short tail under a wing. */
const shape: Shape = {
  trackM: VARG.trackM,
  axleZ: VARG.axleZ,
  wheelRadiusM: VARG.wheelRadiusM,
  tyreWidthM: 0.31,
  noseZ: -2.37,
  tailZ: 2.37,
  halfWidth: 1.01,
  sillH: 0.12,
  flareM: 0.04,
  archClearM: 0.03,
  grilleH: 0.5,
  lampH: [0.51, 0.6],
  hoodLipH: 0.65,
  hoodH: 0.86,
  cowl: [-0.3, 0.895],
  header: [0.3, 1.18],
  roof: [0.62, 1.24],
  roofEnd: [0.9, 1.22],
  shoulder: [
    [-2.37, 0.42],
    [-2.0, 0.64],
    [-1.46, 0.78],
    [-0.6, 0.745],
    [0.4, 0.775],
    [1.32, 0.87],
    [1.9, 0.88],
    [2.37, 0.84],
  ],
  belt: [
    [-2.37, 0.52],
    [-2.0, 0.71],
    [-1.46, 0.82],
    [-0.9, 0.86],
    [-0.3, 0.89],
    [0.4, 0.93],
    [1.32, 0.99],
    [1.9, 1.0],
    [2.37, 0.98],
  ],
  windowTop: [
    [-0.27, 0.93],
    [0.0, 1.06],
    [0.3, 1.15],
    [0.62, 1.18],
    [0.9, 1.14],
    [1.2, 1.05],
    [1.45, 1.0],
  ],
  windowZ: [-0.27, 1.45],
  railWidth: [
    [-2.37, 0.13],
    [-1.9, 0.16],
    [-1.4, 0.2],
    [-0.9, 0.29],
    [-0.55, 0.43],
    [-0.3, 0.62],
    [0.2, 0.6],
    [0.9, 0.58],
    [1.6, 0.68],
    [2.0, 0.78],
    [2.37, 0.8],
  ],
  tail: [],
  seams: [-0.24, 0.98],
  pillars: [[0.94, 1.0]],
  mirror: { z: -0.08, h: 1.0, x: 0.86 },
  rearPlateH: 0.62,
  rearSeats: false,
  cabinEndZ: 1.15,
  decals: [
    ...plates(0.62, 0.24),
    ...handles([0.6], 0.84),
    // Two slats of dark metal across each half of the intake.
    { on: "front", at: [0.4, 0.345], size: [0.6, 0.014], surface: "rimDark", mirror: true, cells: [6, 1], liftM: 0.01, fine: true },
    { on: "front", at: [0.4, 0.4], size: [0.6, 0.014], surface: "rimDark", mirror: true, cells: [6, 1], liftM: 0.01, fine: true },
    // Each lamp's two bars in a dark housing, which stands just off the nose so the bars can stand off it in turn.
    { on: "front", at: [0.67, 0.551], size: [0.44, 0.088], surface: "trim", mirror: true, cells: [4, 1], liftM: 0.006 },
    { ...lightLine({ x: 0.66, h: 0.571, wide: 0.4, thick: 0.034 }), cells: [5, 1] },
    { ...lightLine({ x: 0.7, h: 0.528, wide: 0.3, thick: 0.026 }), cells: [4, 1] },
    { on: "rear", at: [0.67, 0.94], size: [0.44, 0.092], surface: "trim", mirror: true, cells: [4, 1], liftM: 0.006 },
    { on: "rear", at: [0.66, 0.959], size: [0.4, 0.032], surface: "lensTail", mirror: true, cells: [5, 1], liftM: 0.012 },
    { on: "rear", at: [0.7, 0.919], size: [0.3, 0.026], surface: "lensTail", mirror: true, cells: [4, 1], liftM: 0.012 },
    // The reversing lamp at the inner end of each tail lamp's lower bar, in the same housing.
    { ...reversing(0.5, 0.919), size: [0.075, 0.026] },
    reflector(0.7, 0.45),
    { ...sideIntake({ z: -0.98, h: 0.64, long: 0.24, tall: 0.08 }), cells: [3, 1] },
    { ...sideIntake({ z: 0.82, h: 0.44, long: 0.2, tall: 0.12 }), cells: [3, 1] },
    ...louvres({ x: 0.5, z: -1.25, long: 0.42, wide: 0.22, count: 5 }),
    topStripe(-1.35, 1.85),
    topStripe(0.6, 0.56),
    topStripe(1.89, 0.6),
  ],
  blocks: [splitter({ z: -2.355, h: 0.19, halfWidth: 0.55, long: 0.2 }),
    // A lip of the body's colour over the fender's vent and over the brake duct ahead of the rear wheel, so each reads as a duct.
    { at: [0.955, 0.688, -0.98], size: [0.05, 0.014, 0.28], surface: "paint", mirror: true, taper: [1, 0.6], fine: true },
    { at: [0.985, 0.508, 0.82], size: [0.06, 0.016, 0.24], surface: "paint", mirror: true, taper: [1, 0.7], fine: true },
    // The spine of the body's colour down the middle of the face, splitting the intake.
    { at: [0, 0.37, -2.34], size: [0.13, 0.16, 0.08], surface: "paint", taper: [0.85, 1] }, // The diffuser's strakes stand under the tail, out of sight from 100 m: near only.
    ...diffuser({ z: 1.95, tailZ: 2.34, h: 0.3, x: [0, 0.3] }).map((strake) => ({ ...strake, fine: true }))],
  extra: {
    bands: BANDS,
    silhouette: [
      { z: -2.33, h: 0.19, band: "bumper" },
      { z: -2.37, h: 0.29, band: "mouth" },
      { z: -2.37, h: 0.45 },
      { z: -2.369, h: 0.49, band: "gap" },
      { z: -2.368, h: 0.5 },
      { z: -2.355, h: 0.6 },
      // The long hood, then the screen, roof, fastback glass and the short deck, each as one fair line.
      ...faired(
        [
          [-2.31, 0.65],
          [-2.0, 0.745],
          [-1.4, 0.83],
          [-0.8, 0.873],
          [-0.36, 0.888],
        ],
        [[-2.31, undefined]],
      ),
      { z: -0.36, h: 0.888, band: "cowl" },
      ...faired(
        [
          [-0.3, 0.895],
          [0.05, 1.1],
          [0.35, 1.2],
          [0.65, 1.235],
          [0.95, 1.2],
          [1.3, 1.09],
          [1.6, 1.025],
          [1.9, 1.008],
          [2.2, 1.02],
        ],
        [
          [-0.3, "screen"],
          [0.3, undefined],
          [0.9, "rearGlass"],
          [1.56, undefined],
        ],
      ),
      { z: 2.2, h: 1.02, band: "gap" },
      { z: 2.21, h: 1.005 },
      { z: 2.245, h: 0.88 },
      { z: 2.29, h: 0.7 },
      { z: 2.325, h: 0.5 },
      { z: 2.335, h: 0.42, band: "diffuser" },
      { z: 2.37, h: 0.22 },
    ],
    crown: [
      [-2.37, 0.03],
      [-1.9, 0.06],
      [-1.46, 0.06],
      [-1.0, 0.075],
      [-0.5, 0.07],
      [0.2, 0.06],
      [0.9, 0.05],
      [1.4, 0.0],
      [1.9, -0.04],
      [2.37, -0.01],
    ],
    shelf: [
      [-2.37, 0.2],
      [-2.1, 0.14],
      [-1.46, 0.16],
      [-0.6, 0.24],
      [0.2, 0.3],
      [0.9, 0.32],
      [1.5, 0.24],
      [2.1, 0.12],
      [2.37, 0.12],
    ],
    halfWidth: [
      [-2.37, 0.84],
      [-2.15, 0.96],
      [-1.46, 0.99],
      [-0.8, 0.95],
      [-0.1, 0.935],
      [0.7, 0.99],
      [1.32, 1.01],
      [1.95, 0.99],
      [2.37, 0.91],
    ],
    scoop: [
      [-1.05, 0],
      [-0.4, 0.015],
      [0.4, 0.022],
      [0.95, 0],
    ],
    cornerPullM: [0.26, 0.2],
    hoodSeamZ: [-2.25, -0.42],
    cleanEnds: true,
    wing: { z: 2.0, h: 1.1, halfWidth: 0.8, chord: 0.16, rise: 0.045, endplates: true },
    exhausts: { x: [-0.66, -0.54, 0.54, 0.66], h: 0.3, z: 2.36, radius: 0.05 },
  },
};

export const varg: CarSpec = {
  id: VARG.id,
  name: VARG.name,
  ride: VARG.ride,
  paint: "car-paint-ember",
  paints: [
    paint("car-paint-ember", "solid", { stripe: "car-paint-black" }),
    paint("car-paint-black", "solid", { stripe: "car-paint-ember" }),
    paint("car-paint-signal-red", "solid", { stripe: "car-paint-white" }),
    paint("car-paint-ultramarine", "metallic", { stripe: "car-paint-white" }),
    paint("car-paint-grape", "metallic", { stripe: "car-paint-black" }),
    paint("car-paint-acid", "solid", { stripe: "car-paint-black" }),
    paint("car-paint-graphite", "matte", { stripe: "car-paint-signal-red" }),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: VARG.wheelRadiusM, widthM: 0.31, rimShare: 0.74, spokes: 5, twinSpokes: false, style: "blade" },
  shadowHalf: [1.01, 2.37],
  // Analogue and old-school: a big rev counter in front of the driver, a gear lever, oxblood leather under a black headliner.
  interior: {
    gauges: "muscle",
    wheel: "round",
    shifter: "lever",
    seats: "sport",
    screen: false,
    turnsToLock: 1.4,
    colours: { glow: "car-cabin-glow-red", headliner: "car-cabin-headliner-dark", insert: "car-cabin-seat-oxblood", seat: "car-cabin-seat-oxblood" },
  },
};
