import { CAR } from "../../sim/tuning";
import { ROWS, type Band, type BodySpec, type Decal, type SilhouettePoint } from "./body";
import type { CarSpec } from "./build";
import { curve, type Key } from "./curve";

/*
 * The cars, each a set of numbers on one shared recipe: where the axles, the
 * screen, the roof and the tail are, and which of three tails it has. All are
 * invented: no maker, no badge, no real car's face. The player's car has the
 * simulation's own dimensions; the others have theirs, for the day each has its
 * own tuning.
 */

const { sillTop, belt, windowBase, rail, roofInner, centre } = ROWS;
const ALL = centre + 1;

const BANDS: Readonly<Record<string, readonly Band[]>> = {
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  rearFrame: [{ surface: "trim", from: rail, to: ALL }],
  /** A tall lamp at each outer edge of a rear window. */
  rearGlassLamp: [
    { surface: "lensTail", from: belt, to: rail },
    { surface: "glass", from: rail, to: ALL },
  ],
  tallLamp: [{ surface: "lensTail", from: belt, to: rail }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  grille: [{ surface: "grille", from: sillTop, to: ALL }],
  headLamp: [{ surface: "lensHead", from: windowBase, to: roofInner }],
  headDark: [{ surface: "trim", from: belt, to: roofInner }],
  tailBar: [{ surface: "lensTail", from: belt, to: ALL }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  bumper: [{ surface: "cladding", from: 0, to: ALL }],
};

interface Shape {
  trackM: number;
  axleZ: readonly [number, number];
  wheelRadiusM: number;
  tyreWidthM: number;
  /** The nose end and the tail end. */
  noseZ: number;
  tailZ: number;
  halfWidth: number;
  sillH: number;
  /** The top of the bumper's face, then the lamp's strip, then the hood's front edge. */
  grilleH: number;
  lampH: readonly [low: number, high: number];
  hoodLipH: number;
  /** The hood over the front axle, and where the screen starts. */
  hoodH: number;
  cowl: readonly [z: number, h: number];
  /** Where the screen reaches the roof. */
  header: readonly [z: number, h: number];
  roof: readonly [z: number, h: number];
  roofEnd: readonly [z: number, h: number];
  /** Keys of the shoulder and belt over the car, nose to tail. */
  shoulder: readonly Key[];
  belt: readonly Key[];
  windowTop: readonly Key[];
  windowZ: readonly [number, number];
  railWidth: readonly Key[];
  tail: readonly SilhouettePoint[];
  seams: readonly number[];
  pillars: readonly (readonly [number, number])[];
  mirror: BodySpec["mirror"];
  decals: readonly Decal[];
  rearSillH?: number;
  flareM?: number;
  cornerPullM?: readonly [number, number];
  archClearM?: number;
  sillSurface?: BodySpec["sillSurface"];
  roofCrownM?: number;
  outerLamps?: "paint" | "grille";
  extra?: Partial<BodySpec>;
}

/** Lamps only at the outer edges, with the grille or the paint between them. */
const OUTER_LAMPS = (between: "paint" | "grille"): Readonly<Record<string, readonly Band[]>> => ({
  ...BANDS,
  headLamp: [
    { surface: "lensHead", from: belt, to: rail },
    { surface: between, from: rail, to: ALL },
  ],
  headDark: [
    { surface: "trim", from: belt, to: rail },
    { surface: between, from: rail, to: ALL },
  ],
});

const thirdBrake = (z: number, wide = 0.5): Decal => ({ on: "top", at: [0, z], size: [wide, 0.028], surface: "lensTail", cells: [4, 1], fine: true });

/** The hood between its front edge and the screen, as one fair curve: a kink here shows as a dent in the reflection. */
function hoodOf({ noseZ, hoodLipH, axleZ, hoodH, cowl }: Shape): SilhouettePoint[] {
  const hood = curve([
    [noseZ + 0.075, hoodLipH],
    [noseZ + 0.2, hoodLipH + 0.05],
    [axleZ[0], hoodH],
    [cowl[0] - 0.08, cowl[1] - 0.015],
  ]);
  const start = noseZ + 0.2;
  const end = cowl[0] - 0.08;
  return [1, 2, 3, 4, 5].map((step) => {
    const z = start + ((end - start) * step) / 6;
    return { z, h: hood(z) };
  });
}

function noseOf({ noseZ: z, sillH, grilleH, lampH, hoodLipH }: Shape): SilhouettePoint[] {
  const bottom = sillH + 0.06;
  return [
    { z: z + 0.1, h: bottom, band: "bumper" },
    { z: z + 0.03, h: bottom + 0.08, band: "grille" },
    { z, h: grilleH },
    { z: z + 0.012, h: lampH[0] - 0.04, band: "gap" },
    { z: z + 0.016, h: lampH[0] - 0.03, band: "headDark" },
    { z: z + 0.03, h: lampH[0], band: "headLamp" },
    { z: z + 0.055, h: lampH[1], band: "headDark" },
    { z: z + 0.075, h: hoodLipH },
    { z: z + 0.2, h: hoodLipH + 0.05 },
  ];
}

function bodyOf(shape: Shape): BodySpec {
  const { noseZ, tailZ, halfWidth: w, axleZ, cowl, header, roof, roofEnd } = shape;
  const crown = shape.roofCrownM ?? 0.06;
  return {
    trackM: shape.trackM,
    axleZ,
    wheelRadiusM: shape.wheelRadiusM,
    tyreWidthM: shape.tyreWidthM,
    archClearM: shape.archClearM ?? 0.055,
    flareM: shape.flareM ?? 0.022,
    silhouette: [
      ...noseOf(shape),
      ...hoodOf(shape),
      { z: cowl[0] - 0.08, h: cowl[1] - 0.015, band: "cowl" },
      { z: cowl[0], h: cowl[1], band: "screen" },
      { z: header[0], h: header[1] },
      { z: roof[0], h: roof[1] },
      { z: roofEnd[0], h: roofEnd[1] },
      ...shape.tail,
    ],
    bands: shape.outerLamps ? OUTER_LAMPS(shape.outerLamps) : BANDS,
    sill: [
      [noseZ, shape.sillH + 0.05],
      [noseZ + 0.4, shape.sillH + 0.01],
      [0, shape.sillH],
      [tailZ - 0.4, (shape.rearSillH ?? shape.sillH) + 0.02],
      [tailZ, (shape.rearSillH ?? shape.sillH) + 0.07],
    ],
    shoulder: shape.shoulder,
    belt: shape.belt,
    windowTop: shape.windowTop,
    windowZ: shape.windowZ,
    crown: [
      [noseZ, 0.03],
      [axleZ[0], crown],
      [roofEnd[0], crown + 0.012],
      [tailZ, 0.03],
    ],
    halfWidth: [
      [noseZ, w - 0.2],
      [noseZ + 0.25, w - 0.05],
      [axleZ[0], w - 0.012],
      [0, w - 0.024],
      [axleZ[1], w],
      [tailZ - 0.25, w - 0.022],
      [tailZ, w - 0.09],
    ],
    railWidth: shape.railWidth,
    cornerPullM: shape.cornerPullM ?? [0.2, 0.12],
    cornerReachM: 0.7,
    seams: shape.seams,
    pillars: shape.pillars,
    pillarSurface: "paint",
    sillSurface: shape.sillSurface ?? "cladding",
    beltSurface: "trim",
    mirror: shape.mirror,
    decals: shape.decals,
    ...shape.extra,
  };
}

const plates = (rearH: number, frontH: number): Decal[] => [
  { on: "rear", at: [0, rearH], size: [0.46, 0.11], surface: "plate", cells: [4, 1], fine: true },
  { on: "front", at: [0, frontH], size: [0.46, 0.1], surface: "plate", cells: [8, 2], liftM: 0.016, fine: true },
];

const handles = (zs: readonly number[], h: number): Decal[] => zs.map((z) => ({ on: "side", at: [z, h], size: [0.13, 0.022], surface: "trim", mirror: true, fine: true }));

const reversing = (x: number, h: number): Decal => ({ on: "rear", at: [x, h], size: [0.14, 0.035], surface: "lensReverse", mirror: true, cells: [2, 1], fine: true });

const reflector = (x: number, h: number): Decal => ({ on: "rear", at: [x, h], size: [0.2, 0.03], surface: "lensTail", mirror: true, cells: [2, 1], fine: true });

const halfBase = CAR.wheelBaseM / 2;

/** The sports fastback the game starts in: wide hips, a ducktail, a full-width bar of light. */
const playerShape: Shape = {
  trackM: CAR.trackM,
  axleZ: [-halfBase, halfBase],
  wheelRadiusM: CAR.wheelRadiusM,
  tyreWidthM: 0.235,
  noseZ: -2.2,
  tailZ: 2.2,
  halfWidth: 0.895,
  sillH: 0.19,
  grilleH: 0.46,
  lampH: [0.6, 0.655],
  hoodLipH: 0.69,
  hoodH: 0.87,
  cowl: [-0.72, 0.945],
  header: [0, 1.36],
  roof: [0.35, 1.415],
  roofEnd: [1.02, 1.37],
  shoulder: [
    [-2.2, 0.58],
    [-1.3, 0.77],
    [0, 0.78],
    [1.3, 0.85],
    [2.2, 0.83],
  ],
  belt: [
    [-2.2, 0.66],
    [-1.3, 0.8],
    [-0.72, 0.87],
    [0.9, 0.95],
    [2.2, 1.04],
  ],
  windowTop: [
    [-0.7, 0.9],
    [-0.4, 1.02],
    [-0.1, 1.19],
    [0.15, 1.3],
    [0.5, 1.345],
    [1.0, 1.25],
    [1.55, 0.96],
  ],
  windowZ: [-0.7, 1.55],
  railWidth: [
    [-2.2, 0.42],
    [-1.2, 0.6],
    [-0.72, 0.72],
    [0.1, 0.61],
    [0.9, 0.62],
    [1.8, 0.66],
    [2.2, 0.55],
  ],
  tail: [
    { z: 1.06, h: 1.355, band: "rearGlass" },
    { z: 1.74, h: 1.09 },
    { z: 1.78, h: 1.075 },
    { z: 1.97, h: 1.09 },
    { z: 2.04, h: 1.05, band: "gap" },
    { z: 2.05, h: 1.035, band: "tailDark" },
    { z: 2.075, h: 1.0, band: "tailBar" },
    { z: 2.11, h: 0.89, band: "tailDark" },
    { z: 2.12, h: 0.85 },
    { z: 2.16, h: 0.72 },
    { z: 2.2, h: 0.56, band: "bumper" },
    { z: 2.2, h: 0.4, band: "bumper" },
    { z: 2.12, h: 0.27 },
  ],
  seams: [-0.62, 0.35, 0.9],
  pillars: [[0.33, 0.39]],
  mirror: { z: -0.42, h: 0.99, x: 0.82 },
  decals: [...plates(0.68, 0.36), reflector(0.56, 0.42), reversing(0.56, 0.8), ...handles([-0.1, 0.76], 0.92), thirdBrake(1.2)],
  extra: { exhausts: { x: [-0.5, 0.5], h: 0.3, z: 2.14, radius: 0.042 } },
};

export const PLAYER_CAR: CarSpec = {
  name: "Skerry GT",
  paint: "car-body",
  body: bodyOf(playerShape),
  wheel: { radiusM: CAR.wheelRadiusM, widthM: 0.235, rimShare: 0.74, spokes: 5, twinSpokes: true },
  shadowHalf: [0.92, 2.2],
};

/** A small upright five-door: short nose, tall tail, lamps up the sides of the rear window. */
const HATCH: CarSpec = {
  name: "Ljus",
  paint: "car-paint-teal",
  wheel: { radiusM: 0.31, widthM: 0.195, rimShare: 0.68, spokes: 7, twinSpokes: false },
  shadowHalf: [0.86, 1.98],
  body: bodyOf({
    trackM: 1.5,
    axleZ: [-1.23, 1.23],
    wheelRadiusM: 0.31,
    tyreWidthM: 0.195,
    noseZ: -1.96,
    tailZ: 1.96,
    halfWidth: 0.86,
    sillH: 0.2,
    grilleH: 0.5,
    lampH: [0.64, 0.75],
    outerLamps: "paint",
    hoodLipH: 0.78,
    hoodH: 0.94,
    cowl: [-0.92, 0.98],
    header: [-0.2, 1.44],
    roof: [0.3, 1.5],
    roofEnd: [1.4, 1.46],
    shoulder: [
      [-1.96, 0.62],
      [-1.2, 0.76],
      [0.5, 0.8],
      [1.96, 0.84],
    ],
    belt: [
      [-1.96, 0.7],
      [-1.2, 0.84],
      [-0.9, 0.9],
      [1.3, 0.97],
      [1.96, 1.0],
    ],
    windowTop: [
      [-0.88, 0.94],
      [-0.5, 1.15],
      [-0.2, 1.36],
      [0.3, 1.43],
      [1.1, 1.39],
      [1.5, 1.32],
    ],
    windowZ: [-0.88, 1.5],
    railWidth: [
      [-1.96, 0.44],
      [-1.2, 0.58],
      [-0.92, 0.68],
      [-0.1, 0.62],
      [1.4, 0.6],
      [1.96, 0.62],
    ],
    tail: [
      { z: 1.56, h: 1.42, band: "rearGlassLamp" },
      { z: 1.86, h: 1.02, band: "tallLamp" },
      { z: 1.9, h: 0.85 },
      { z: 1.96, h: 0.6, band: "bumper" },
      { z: 1.96, h: 0.42, band: "bumper" },
      { z: 1.88, h: 0.28 },
    ],
    seams: [-0.8, 0.22, 0.86],
    pillars: [[0.18, 0.26]],
    mirror: { z: -0.62, h: 1.02, x: 0.78 },
    decals: [...plates(0.72, 0.38), ...handles([-0.15, 0.72], 0.98)],
  }),
};

/** A long, low Nordic estate: a roof that runs right to the back, and bars on it. */
const ESTATE: CarSpec = {
  name: "Fjärd",
  paint: "car-paint-navy",
  wheel: { radiusM: 0.33, widthM: 0.215, rimShare: 0.7, spokes: 5, twinSpokes: false },
  shadowHalf: [0.92, 2.38],
  body: bodyOf({
    trackM: 1.58,
    axleZ: [-1.42, 1.38],
    wheelRadiusM: 0.33,
    tyreWidthM: 0.215,
    noseZ: -2.38,
    tailZ: 2.38,
    halfWidth: 0.91,
    sillH: 0.2,
    grilleH: 0.5,
    lampH: [0.64, 0.7],
    hoodLipH: 0.74,
    hoodH: 0.9,
    cowl: [-0.9, 0.97],
    header: [-0.1, 1.42],
    roof: [0.5, 1.48],
    roofEnd: [1.85, 1.43],
    shoulder: [
      [-2.38, 0.6],
      [-1.4, 0.77],
      [0.5, 0.8],
      [2.38, 0.85],
    ],
    belt: [
      [-2.38, 0.68],
      [-1.4, 0.82],
      [-0.9, 0.88],
      [1.6, 0.96],
      [2.38, 0.98],
    ],
    windowTop: [
      [-0.86, 0.92],
      [-0.5, 1.1],
      [-0.1, 1.33],
      [0.5, 1.41],
      [1.5, 1.37],
      [2.0, 1.26],
    ],
    windowZ: [-0.86, 2.0],
    railWidth: [
      [-2.38, 0.44],
      [-1.4, 0.6],
      [-0.9, 0.72],
      [0, 0.64],
      [1.9, 0.62],
      [2.38, 0.64],
    ],
    tail: [
      { z: 1.95, h: 1.4, band: "rearGlassLamp" },
      { z: 2.3, h: 0.98, band: "tallLamp" },
      { z: 2.33, h: 0.84 },
      { z: 2.38, h: 0.6, band: "bumper" },
      { z: 2.38, h: 0.42, band: "bumper" },
      { z: 2.3, h: 0.28 },
    ],
    seams: [-0.78, 0.36, 1.0],
    pillars: [
      [0.32, 0.4],
      [1.42, 1.5],
    ],
    mirror: { z: -0.6, h: 1.0, x: 0.83 },
    decals: [...plates(0.72, 0.38), ...handles([-0.05, 0.86], 0.95)],
    extra: { roofBars: { from: 0.1, to: 1.7, x: 0.54, rise: 0.05 } },
  }),
};

/** A low two-seater: long hood, cabin set back, a wing. */
const COUPE: CarSpec = {
  name: "Sund",
  paint: "car-paint-mustard",
  wheel: { radiusM: 0.34, widthM: 0.265, rimShare: 0.76, spokes: 6, twinSpokes: true },
  shadowHalf: [0.96, 2.2],
  body: bodyOf({
    trackM: 1.62,
    axleZ: [-1.27, 1.23],
    wheelRadiusM: 0.34,
    tyreWidthM: 0.265,
    noseZ: -2.2,
    tailZ: 2.15,
    halfWidth: 0.93,
    sillH: 0.16,
    flareM: 0.04,
    grilleH: 0.4,
    lampH: [0.53, 0.58],
    hoodLipH: 0.61,
    hoodH: 0.8,
    cowl: [-0.42, 0.9],
    header: [0.2, 1.22],
    roof: [0.5, 1.27],
    roofEnd: [0.9, 1.24],
    shoulder: [
      [-2.2, 0.5],
      [-1.27, 0.78],
      [0, 0.72],
      [1.2, 0.86],
      [2.15, 0.8],
    ],
    belt: [
      [-2.2, 0.56],
      [-1.27, 0.8],
      [-0.4, 0.84],
      [1.0, 0.94],
      [2.15, 0.96],
    ],
    windowTop: [
      [-0.38, 0.87],
      [-0.1, 0.95],
      [0.2, 1.1],
      [0.6, 1.19],
      [0.95, 1.14],
      [1.3, 0.98],
    ],
    windowZ: [-0.38, 1.3],
    railWidth: [
      [-2.2, 0.44],
      [-1.2, 0.62],
      [-0.42, 0.72],
      [0.3, 0.56],
      [1.0, 0.58],
      [1.8, 0.7],
      [2.15, 0.6],
    ],
    tail: [
      { z: 0.95, h: 1.22, band: "rearGlass" },
      { z: 1.72, h: 0.99 },
      { z: 1.76, h: 0.975 },
      { z: 2.0, h: 0.97, band: "gap" },
      { z: 2.01, h: 0.95, band: "tailDark" },
      { z: 2.04, h: 0.92, band: "tailBar" },
      { z: 2.07, h: 0.86, band: "tailDark" },
      { z: 2.09, h: 0.82 },
      { z: 2.15, h: 0.56, band: "bumper" },
      { z: 2.15, h: 0.36, band: "bumper" },
      { z: 2.05, h: 0.24 },
    ],
    seams: [-0.32, 0.92],
    pillars: [],
    mirror: { z: -0.14, h: 0.95, x: 0.8 },
    decals: [...plates(0.68, 0.3), reflector(0.6, 0.36), reversing(0.32, 0.78), ...handles([0.72], 0.9), thirdBrake(1.05, 0.4)],
    extra: {
      wing: { z: 1.92, h: 1.13, halfWidth: 0.76, chord: 0.13, rise: 0.04 },
      exhausts: { x: [-0.58, -0.48, 0.48, 0.58], h: 0.26, z: 2.09, radius: 0.036 },
    },
  }),
};

/** A working pickup: tall, square, a long bed, high on its tyres. */
const PICKUP: CarSpec = {
  name: "Holm",
  paint: "car-paint-forest",
  wheel: { radiusM: 0.385, widthM: 0.25, rimShare: 0.62, spokes: 6, twinSpokes: false },
  shadowHalf: [1.0, 2.62],
  body: bodyOf({
    trackM: 1.66,
    axleZ: [-1.6, 1.6],
    wheelRadiusM: 0.385,
    tyreWidthM: 0.25,
    noseZ: -2.62,
    tailZ: 2.62,
    halfWidth: 0.97,
    sillH: 0.36,
    rearSillH: 0.42,
    archClearM: 0.09,
    flareM: 0.035,
    grilleH: 0.8,
    lampH: [0.88, 1.0],
    outerLamps: "grille",
    hoodLipH: 1.06,
    hoodH: 1.14,
    cowl: [-0.92, 1.2],
    header: [-0.3, 1.72],
    roof: [0.05, 1.76],
    roofEnd: [0.68, 1.74],
    roofCrownM: 0.05,
    cornerPullM: [0.12, 0.05],
    shoulder: [
      [-2.62, 0.9],
      [-1.6, 1.0],
      [0.8, 1.0],
      [2.62, 1.06],
    ],
    belt: [
      [-2.62, 0.98],
      [-1.6, 1.08],
      [-0.9, 1.12],
      [0.8, 1.16],
      [2.62, 1.2],
    ],
    windowTop: [
      [-0.88, 1.16],
      [-0.6, 1.4],
      [-0.3, 1.64],
      [0.1, 1.69],
      [0.68, 1.66],
      [0.76, 1.6],
    ],
    windowZ: [-0.88, 0.76],
    railWidth: [
      [-2.62, 0.52],
      [-1.6, 0.68],
      [-0.92, 0.76],
      [0, 0.68],
      [0.8, 0.72],
      [0.86, 0.82],
      [2.62, 0.84],
    ],
    tail: [
      { z: 0.82, h: 1.72, band: "rearGlass" },
      { z: 0.84, h: 1.36 },
      { z: 0.86, h: 1.24, bed: true },
      { z: 2.5, h: 1.24, band: "tallLamp" },
      { z: 2.56, h: 1.2, band: "tallLamp" },
      { z: 2.6, h: 0.88 },
      { z: 2.62, h: 0.68, band: "bumper" },
      { z: 2.62, h: 0.5, band: "bumper" },
      { z: 2.54, h: 0.42 },
    ],
    seams: [-0.8, 0.06, 0.74],
    pillars: [[0.03, 0.1]],
    mirror: { z: -0.62, h: 1.27, x: 0.9 },
    decals: [...plates(0.6, 0.66), ...handles([-0.2, 0.42], 1.1)],
    extra: { bedFloorH: 0.82 },
    sillSurface: "cladding",
  }),
};

/** A tall tradesman's van: almost no nose, a slab of a back with lamps up its corners. */
const VAN: CarSpec = {
  name: "Kobb",
  paint: "car-paint-white",
  wheel: { radiusM: 0.345, widthM: 0.215, rimShare: 0.62, spokes: 5, twinSpokes: false },
  shadowHalf: [0.96, 2.48],
  body: bodyOf({
    trackM: 1.66,
    axleZ: [-1.62, 1.42],
    wheelRadiusM: 0.345,
    tyreWidthM: 0.215,
    noseZ: -2.48,
    tailZ: 2.46,
    halfWidth: 0.95,
    sillH: 0.24,
    grilleH: 0.62,
    lampH: [0.78, 0.92],
    outerLamps: "paint",
    hoodLipH: 1.0,
    hoodH: 1.18,
    cowl: [-1.5, 1.24],
    header: [-0.72, 1.92],
    roof: [-0.1, 1.98],
    roofEnd: [2.1, 1.96],
    roofCrownM: 0.07,
    cornerPullM: [0.2, 0.04],
    shoulder: [
      [-2.48, 0.8],
      [-1.6, 0.92],
      [1.4, 0.92],
      [2.46, 0.92],
    ],
    belt: [
      [-2.48, 0.92],
      [-1.5, 1.08],
      [0, 1.14],
      [2.46, 1.16],
    ],
    windowTop: [
      [-1.46, 1.12],
      [-1.1, 1.42],
      [-0.72, 1.72],
      [-0.36, 1.76],
    ],
    windowZ: [-1.46, -0.3],
    railWidth: [
      [-2.48, 0.5],
      [-1.5, 0.76],
      [-0.7, 0.72],
      [2.1, 0.74],
      [2.46, 0.72],
    ],
    tail: [
      { z: 2.3, h: 1.94, band: "tallLamp" },
      { z: 2.43, h: 1.8, band: "rearGlassLamp" },
      { z: 2.46, h: 1.32, band: "tallLamp" },
      { z: 2.46, h: 0.8, band: "bumper" },
      { z: 2.46, h: 0.42, band: "bumper" },
      { z: 2.38, h: 0.3 },
    ],
    seams: [-1.2, -0.28, 0.82, 2.2],
    pillars: [],
    mirror: { z: -1.2, h: 1.32, x: 0.9 },
    decals: [
      ...plates(0.66, 0.44),
      ...handles([-0.5, 0.1], 1.02),
      { on: "side", at: [0.25, 1.62], size: [1.2, 0.02], surface: "trim", mirror: true, cells: [4, 1], fine: true },
    ],
  }),
};

export const CARS: readonly CarSpec[] = [PLAYER_CAR, HATCH, ESTATE, COUPE, PICKUP, VAN];
