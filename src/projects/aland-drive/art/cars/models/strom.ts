import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { projectors, tailLine } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const STROM = driven("strom");
const { sill, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */

/**
 * Västan's face as Pil set it down, on the maker's electric car, which needs no grille: the one dark band the width of
 * the nose is a gloss panel, slim lamps at its outer ends joined across it by a line of light where Pil has its blade.
 * At the tail the lamps stand up the sides of the fastback's glass and turn in across the tailgate under it.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  headDark: [{ surface: "trim", from: belt, to: ALL }],
  headLamp: [
    { surface: "lensHead", from: belt, to: rail },
    { surface: "trim", from: rail, to: ALL },
  ],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  rearGlassLamp: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "glass", from: rail, to: ALL },
  ],
  tailBar: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "trim", from: rail, to: ALL },
  ],
};

const face: Decal[] = [
  // The line of light across the gloss band, from lamp to lamp.
  { on: "front", at: [0, 0.705], size: [0.92, 0.012], surface: "lensHead", cells: [8, 1], liftM: 0.014 },
  // Each lamp's daytime line along its top, turned down at its outer end like an arrowhead.
  { on: "front", at: [0.68, 0.737], size: [0.2, 0.014], surface: "lensHead", mirror: true, cells: [4, 1], liftM: 0.016 },
  { on: "front", at: [0.772, 0.719], size: [0.018, 0.045], surface: "lensHead", mirror: true, cells: [1, 2], liftM: 0.016 },
  // The battery's cooling slot low in the nose.
  { on: "front", at: [0, 0.47], size: [0.72, 0.06], surface: "grille", cells: [8, 1], liftM: 0.012 },
];

/**
 * An electric fastback on a raised floor: a short nose and the cabin pushed forward over the battery, a long roof
 * falling to a small ducktail, cladding round its arches and along its sills, aero wheels, no pipes.
 */
const shape: Shape = {
  trackM: STROM.trackM,
  axleZ: STROM.axleZ,
  wheelRadiusM: STROM.wheelRadiusM,
  tyreWidthM: 0.235,
  noseZ: -2.25,
  tailZ: 2.25,
  halfWidth: 0.95,
  sillH: 0.26,
  flareM: 0.035,
  archClearM: 0.05,
  cornerPullM: [0.16, 0.12],
  grilleH: 0.56,
  lampH: [0.66, 0.75],
  hoodLipH: 0.78,
  hoodH: 0.96,
  cowl: [-1.2, 1.02],
  header: [-0.28, 1.56],
  roof: [0.3, 1.62],
  roofEnd: [1.4, 1.5],
  shoulder: [
    [-2.25, 0.71],
    [-1.9, 0.86],
    [-1.425, 0.92],
    [-1.2, 0.95],
    [0.4, 0.98],
    [1.425, 1.03],
    [2.25, 1.01],
  ],
  belt: [
    [-2.25, 0.78],
    [-1.9, 0.93],
    [-1.425, 0.99],
    [-1.2, 1.02],
    [0.4, 1.05],
    [1.425, 1.09],
    [2.25, 1.08],
  ],
  windowTop: [
    [-1.17, 1.04],
    [-0.75, 1.24],
    [-0.3, 1.44],
    [0.3, 1.5],
    [0.9, 1.48],
    [1.1, 1.45],
    [1.2, 1.42],
  ],
  windowZ: [-1.17, 1.2],
  railWidth: [
    [-2.25, 0.48],
    [-1.425, 0.7],
    [-1.2, 0.76],
    [-0.3, 0.72],
    [0.6, 0.7],
    [1.425, 0.7],
    [2.0, 0.62],
    [2.25, 0.54],
  ],
  tail: [],
  seams: [-1.1, 0.12, 1.0],
  pillars: [[0.08, 0.16]],
  mirror: { z: -0.95, h: 1.08, x: 0.9 },
  rearPlateH: 0.72,
  cabinEndZ: 1.3,
  decals: [
    ...plates(0.72, 0.53),
    ...handles([-0.5, 0.6], 0.92),
    ...face,
    ...projectors({ x: [0.56, 0.64], h: 0.7, size: 0.03 }),
    { ...tailLine({ h: 1.14, wide: 1.1, thick: 0.022 }), cells: [10, 1], liftM: 0.012 },
    reversing(0.4, 0.66),
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    archLipM: 0.03,
    silhouette: [
      { z: -2.2, h: 0.36, band: "bumper" },
      { z: -2.235, h: 0.42 },
      { z: -2.25, h: 0.56 },
      { z: -2.248, h: 0.64, band: "gap" },
      { z: -2.246, h: 0.645, band: "headDark" },
      { z: -2.238, h: 0.66, band: "headLamp" },
      { z: -2.215, h: 0.75, band: "headDark" },
      { z: -2.208, h: 0.765 },
      ...faired(
        [
          [-2.195, 0.78],
          [-1.8, 0.9],
          [-1.425, 0.96],
          [-1.27, 0.99],
        ],
        [[-2.195, undefined]],
      ),
      { z: -1.27, h: 0.99, band: "cowl" },
      ...faired(
        [
          [-1.2, 1.02],
          [-0.75, 1.3],
          [-0.28, 1.56],
          [0.3, 1.62],
          [0.9, 1.6],
          [1.4, 1.5],
          [1.9, 1.3],
          [2.08, 1.22],
        ],
        [
          [-1.2, "screen"],
          [-0.28, undefined],
          [1.4, "rearGlass"],
          [1.64, "rearGlassLamp"],
        ],
      ),
      { z: 2.08, h: 1.22, band: "tailBar" },
      { z: 2.14, h: 1.06 },
      { z: 2.2, h: 0.86, band: "gap" },
      { z: 2.205, h: 0.85 },
      { z: 2.24, h: 0.6, band: "bumper" },
      { z: 2.25, h: 0.38 },
    ],
    crown: [
      [-2.25, 0.02],
      [-1.425, 0.01],
      [-1.0, 0.03],
      [-0.4, 0.06],
      [0.5, 0.07],
      [1.4, 0.065],
      [2.25, 0.03],
    ],
    shelf: [
      [-2.25, 0],
      [-1.425, 0.03],
      [-0.6, 0.05],
      [0.5, 0.07],
      [1.4, 0.08],
      [2.25, 0.05],
    ],
    halfWidth: [
      [-2.25, 0.78],
      [-2.0, 0.9],
      [-1.425, 0.95],
      [-0.7, 0.93],
      [0.4, 0.935],
      [1.425, 0.95],
      [2.0, 0.935],
      [2.25, 0.84],
    ],
    hoodSeamZ: [-2.1, -1.32],
    sill: [
      [-2.25, 0.36],
      [-1.9, 0.27],
      [0, 0.26],
      [1.9, 0.28],
      [2.25, 0.34],
    ],
  },
};

export const strom: CarSpec = {
  id: STROM.id,
  name: STROM.name,
  ride: STROM.ride,
  paint: "car-paint-mint",
  paints: [
    paint("car-paint-mint"),
    paint("car-paint-ivory", "pearl", { flip: "car-paint-ivory-flip" }),
    paint("car-paint-glacier", "metallic"),
    paint("car-paint-copper", "metallic"),
    paint("car-paint-ultramarine", "metallic"),
    paint("car-paint-graphite", "matte"),
  ],
  body: bodyOf(shape),
  /** Västan's electric cabin: one wide digital display and a centre screen, a round wheel, a puck of a selector, comfort seats with Västan's blue band, pale inserts. */
  interior: {
    gauges: "digital",
    wheel: "round",
    shifter: "selector",
    seats: "comfort",
    screen: true,
    seatBand: "car-cabin-vastan",
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim", insert: "car-cabin-ivory", headliner: "car-cabin-headliner", accent: "car-cabin-vastan", glow: "car-cabin-glow-ice" },
  },
  wheel: { radiusM: STROM.wheelRadiusM, widthM: 0.235, rimShare: 0.74, spokes: 7, twinSpokes: false, style: "aero" },
  shadowHalf: [0.95, 2.25],
};
