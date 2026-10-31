import { CAR } from "../../sim/tuning";
import { ROWS, type Band, type Block, type BodySpec, type Cabin, type Decal, type SilhouettePoint } from "./body";
import type { CarSpec } from "./build";
import { curve, type Key } from "./curve";
import type { Surface } from "./mesh";

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
  nose?: NoseStyle;
  /** How far back the lamps lean from the nose's face: a wedge, or nearly none for an upright nose. */
  noseRake?: number;
  /** Seats behind the front pair, and the z of the cabin's back. */
  rearSeats?: boolean;
  cabinEndZ?: number;
  seat?: Surface;
  extra?: Partial<BodySpec>;
  rearPlateH: number;
  blocks?: readonly Block[];
  /** No roof: the screen's back is glass too, down to the cockpit. */
  openTop?: boolean;
}

/**
 * A car's face. "slit": a thin strip of lamp across the nose. "paint" and
 * "grille": lamps at the outer edges with paint or grille between them. "smooth":
 * a closed face with one line of light and only a low intake. "round": no strip
 * at all, for a shape that carries its lamps as `roundLamps`.
 */
type NoseStyle = "slit" | "paint" | "grille" | "smooth" | "round";

const outerLamps = (between: "paint" | "grille"): Readonly<Record<string, readonly Band[]>> => ({
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

const NOSES: Readonly<Record<NoseStyle, Readonly<Record<string, readonly Band[]>>>> = {
  slit: BANDS,
  paint: outerLamps("paint"),
  grille: outerLamps("grille"),
  smooth: {
    ...BANDS,
    headLamp: [{ surface: "lensHead", from: belt, to: ALL }],
    headDark: [],
    grille: [{ surface: "grille", from: rail, to: ALL }],
  },
  round: { ...BANDS, headLamp: [], headDark: [], grille: [{ surface: "grille", from: rail, to: ALL }] },
};

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
  const steps = 15;
  return Array.from({ length: steps - 1 }, (_, step) => {
    const z = start + ((end - start) * (step + 1)) / steps;
    return { z, h: hood(z), fine: (step + 1) % 3 !== 0 };
  });
}

function noseOf({ noseZ: z, sillH, grilleH, lampH, hoodLipH, noseRake = 1 }: Shape): SilhouettePoint[] {
  const bottom = sillH + 0.06;
  return [
    { z: z + 0.1, h: bottom, band: "bumper" },
    { z: z + 0.03, h: bottom + 0.08, band: "grille" },
    { z, h: grilleH },
    { z: z + 0.012 * noseRake, h: lampH[0] - 0.04, band: "gap" },
    { z: z + 0.016 * noseRake, h: lampH[0] - 0.03, band: "headDark" },
    { z: z + 0.03 * noseRake, h: lampH[0], band: "headLamp" },
    { z: z + 0.055 * noseRake, h: lampH[1], band: "headDark" },
    { z: z + 0.075 * noseRake, h: hoodLipH },
    { z: z + 0.2, h: hoodLipH + 0.05 },
  ];
}

/** The plate's coloured edge, which a world car shows or not. */
function worldOptions({ rearPlateH }: Shape): Decal[] {
  return [{ on: "rear", at: [-0.2, rearPlateH], size: [0.05, 0.1], surface: "plateBand", liftM: 0.012 }];
}

/** Two bars across the roof, which a world car shows or not. */
function rackOf({ roof, roofEnd, railWidth, tail }: Shape): Block[] {
  if (tail.some(({ bed }) => bed)) return [];
  const width = curve(railWidth)(roof[0]) * 2;
  const [front, rear] = [roof[0] - 0.05, (roof[0] + roofEnd[0]) / 2 + 0.2];
  return [front, rear].map((z) => ({ at: [0, Math.max(roof[1], roofEnd[1]) + 0.045, z], size: [width, 0.03, 0.05], surface: "rack" }));
}

function cabinOf({ cowl, hoodH, sillH, roof, tail, cabinEndZ, rearSeats = true, seat = "seat", trackM }: Shape): Cabin {
  const open = tail.some(({ bed }) => bed);
  const endZ = cabinEndZ ?? (open ? roof[0] : roof[0] + 0.9);
  const seatZ = cowl[0] + 0.98;
  return {
    dashZ: cowl[0] + 0.02,
    dashH: hoodH + 0.02,
    floorH: sillH + 0.14,
    seatZ,
    rearSeatZ: rearSeats ? seatZ + 0.82 : undefined,
    endZ,
    seatX: trackM * 0.23,
    seatSurface: seat,
  };
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
      { z: header[0], h: header[1], band: shape.openTop ? "screen" : undefined },
      { z: roof[0], h: roof[1], band: shape.openTop ? "screen" : undefined },
      { z: roofEnd[0], h: roofEnd[1] },
      ...shape.tail,
    ],
    bands: NOSES[shape.nose ?? "slit"],
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
    decals: [...shape.decals, ...worldOptions(shape)],
    blocks: [...rackOf(shape), ...(shape.blocks ?? [])],
    hoodSeamZ: [noseZ + 0.3, cowl[0] - 0.1],
    cabin: cabinOf(shape),
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

/** A hero's lamps as units: projectors in the headlamp, dividers in the tail's light. */
function lampUnits({ headX, headH, tailH, tailX }: { headX: readonly number[]; headH: number; tailH: number; tailX: readonly [number, number] }): Decal[] {
  const dividers = Array.from({ length: 4 }, (_, at) => tailX[0] + ((tailX[1] - tailX[0]) * at) / 3);
  return [
    ...headX.flatMap((x): Decal[] => [
      { on: "front", at: [x, headH], size: [0.075, 0.05], surface: "trim", mirror: true, round: true, fine: true, liftM: 0.012 },
      { on: "front", at: [x, headH], size: [0.05, 0.034], surface: "rim", mirror: true, round: true, fine: true, liftM: 0.016 },
    ]),
    ...dividers.map((x): Decal => ({ on: "rear", at: [x, tailH], size: [0.012, 0.09], surface: "trim", mirror: true, fine: true })),
  ];
}

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
  rearPlateH: 0.68,
  decals: [...plates(0.68, 0.36), reflector(0.56, 0.42), reversing(0.56, 0.8), ...handles([-0.1, 0.76], 0.92), thirdBrake(1.2), ...lampUnits({ headX: [0.38, 0.54], headH: 0.628, tailH: 0.945, tailX: [0.52, 0.78] })],
  extra: { exhausts: { x: [-0.5, 0.5], h: 0.3, z: 2.2, radius: 0.042 } },
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
    nose: "paint",
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
    rearPlateH: 0.72,
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
    nose: "grille",
    noseRake: 0.6,
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
    rearPlateH: 0.72,
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
    noseRake: 1.8,
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
    rearPlateH: 0.68,
    rearSeats: false,
    cabinEndZ: 1.0,
    decals: [...plates(0.68, 0.3), reflector(0.6, 0.36), reversing(0.32, 0.78), ...handles([0.72], 0.9), thirdBrake(1.05, 0.4)],
    extra: {
      wing: { z: 1.92, h: 1.13, halfWidth: 0.76, chord: 0.13, rise: 0.04 },
      exhausts: { x: [-0.58, -0.48, 0.48, 0.58], h: 0.26, z: 2.15, radius: 0.036 },
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
    nose: "grille",
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
    rearPlateH: 0.6,
    rearSeats: false,
    cabinEndZ: 0.8,
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
    noseRake: 0.7,
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
    nose: "paint",
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
    rearPlateH: 0.66,
    rearSeats: false,
    cabinEndZ: -0.2,
    decals: [
      ...plates(0.66, 0.44),
      ...handles([-0.5, 0.1], 1.02),
      { on: "side", at: [0.25, 1.62], size: [1.2, 0.02], surface: "trim", mirror: true, cells: [4, 1], fine: true },
    ],
  }),
};

type TailStyle = "fast" | "notch" | "upright" | "box" | "bed" | "open";

/** A car in a dozen numbers: the rest of its shape follows from them. */
interface Sketch {
  name: string;
  paint: string;
  livery?: boolean;
  /** Length, wheelbase, width, height. */
  size: readonly [number, number, number, number];
  radius: number;
  tyre: number;
  sill: number;
  hood: number;
  /** Where the screen starts, where it meets the roof, where the roof ends. */
  screen: readonly [cowl: number, header: number, roofEnd: number];
  tail: TailStyle;
  nose: NoseStyle;
  rake?: number;
  spokes?: number;
  twin?: boolean;
  rim?: number;
  belt?: number;
  flare?: number;
  decals?: readonly Decal[];
  blocks?: readonly Block[];
  seat?: Surface;
  rearSeats?: boolean;
  wing?: BodySpec["wing"];
  roofBars?: boolean;
}

function sketched(car: Sketch): CarSpec {
  const [length, base, width, height] = car.size;
  const { radius, tyre, sill, hood, tail: style } = car;
  const [cowlZ, headerZ, roofEndZ] = car.screen;
  const [noseZ, tailZ] = [-length / 2, length / 2];
  const axleZ = [-base / 2, base / 2] as const;
  const w = width / 2;
  const rise = car.belt ?? 0.08;
  const beltAt = (z: number) => hood - 0.04 + (rise * (z - cowlZ)) / (tailZ - cowlZ);
  const deck = beltAt(tailZ) + 0.05;
  const open = style === "open";
  const bed = style === "bed";
  const lampLow = hood * 0.72;

  const lower = (top: number, inset: number): SilhouettePoint[] => [
    { z: tailZ - inset, h: top - 0.22 },
    { z: tailZ - inset * 0.3, h: top - 0.42, band: "bumper" },
    { z: tailZ, h: sill + 0.22, band: "bumper" },
    { z: tailZ - 0.08, h: sill + 0.08 },
  ];
  const tails: Record<TailStyle, () => SilhouettePoint[]> = {
    fast: () => [
      { z: roofEndZ + 0.04, h: height - 0.05, band: "rearGlass" },
      { z: tailZ - 0.42, h: deck + 0.04 },
      { z: tailZ - 0.14, h: deck + 0.05, band: "gap" },
      { z: tailZ - 0.13, h: deck + 0.03, band: "tailDark" },
      { z: tailZ - 0.1, h: deck, band: "tailBar" },
      { z: tailZ - 0.07, h: deck - 0.1, band: "tailDark" },
      ...lower(deck, 0.05),
    ],
    notch: () => [
      { z: roofEndZ + 0.04, h: height - 0.05, band: "rearGlass" },
      { z: tailZ - 0.9, h: deck + 0.02 },
      { z: tailZ - 0.12, h: deck, band: "gap" },
      { z: tailZ - 0.11, h: deck - 0.015, band: "tailDark" },
      { z: tailZ - 0.09, h: deck - 0.04, band: "tailBar" },
      { z: tailZ - 0.06, h: deck - 0.15, band: "tailDark" },
      ...lower(deck - 0.05, 0.04),
    ],
    upright: () => [
      { z: roofEndZ + 0.12, h: height - 0.07, band: "rearGlassLamp" },
      { z: tailZ - 0.1, h: deck, band: "tallLamp" },
      ...lower(deck, 0.06),
    ],
    box: () => [
      { z: tailZ - 0.14, h: height - 0.04, band: "tallLamp" },
      { z: tailZ - 0.04, h: height - 0.16, band: "rearGlassLamp" },
      { z: tailZ - 0.02, h: deck + 0.14, band: "tallLamp" },
      ...lower(deck, 0.02),
    ],
    bed: () => [
      { z: roofEndZ + 0.1, h: height - 0.03, band: "rearGlass" },
      { z: roofEndZ + 0.12, h: deck + 0.2 },
      { z: roofEndZ + 0.14, h: deck, bed: true },
      { z: tailZ - 0.1, h: deck, band: "tallLamp" },
      { z: tailZ - 0.06, h: deck - 0.03, band: "tallLamp" },
      ...lower(deck - 0.02, 0.03),
    ],
    open: () => [
      { z: roofEndZ + 0.04, h: deck, bed: true },
      { z: roofEndZ + 1.15, h: deck + 0.02 },
      { z: tailZ - 0.14, h: deck, band: "gap" },
      { z: tailZ - 0.13, h: deck - 0.02, band: "tailDark" },
      { z: tailZ - 0.1, h: deck - 0.05, band: "tailBar" },
      { z: tailZ - 0.07, h: deck - 0.13, band: "tailDark" },
      ...lower(deck - 0.05, 0.05),
    ],
  };
  const headerH = open ? hood + (height - hood) : height - 0.05;
  const roofZ = open ? headerZ + 0.02 : (headerZ + roofEndZ) / 2;
  const roofEnd: readonly [number, number] = open ? [headerZ + 0.04, deck + 0.02] : [roofEndZ, height - 0.03];
  const hasWindow = !open;
  const windowEnd = bed ? roofEndZ + 0.02 : style === "fast" ? roofEndZ + 0.5 : style === "notch" ? roofEndZ + 0.2 : roofEndZ + 0.1;
  const seats = !open && !bed && style !== "box" ? car.rearSeats ?? true : (car.rearSeats ?? false);

  const shape: Shape = {
    openTop: open,
    trackM: width - tyre - 0.03,
    axleZ,
    wheelRadiusM: radius,
    tyreWidthM: tyre,
    noseZ,
    tailZ,
    halfWidth: w,
    sillH: sill,
    grilleH: hood * 0.56,
    lampH: [lampLow, lampLow + hood * 0.08],
    hoodLipH: hood * 0.86,
    hoodH: hood,
    cowl: [cowlZ, hood + 0.07],
    header: [headerZ, headerH],
    roof: [roofZ, open ? deck + 0.02 : height],
    roofEnd,
    shoulder: [
      [noseZ, hood * 0.68],
      [axleZ[0], Math.max(hood - 0.08, radius * 2 + 0.11)],
      [0, hood - 0.08],
      [axleZ[1], Math.max(beltAt(axleZ[1]) - 0.06, radius * 2 + 0.11)],
      [tailZ, beltAt(tailZ) - 0.08],
    ],
    belt: [
      [noseZ, hood * 0.76],
      [axleZ[0], Math.max(hood - 0.05, radius * 2 + 0.13)],
      [cowlZ, hood],
      [tailZ, beltAt(tailZ)],
    ],
    windowTop: hasWindow
      ? [
          [cowlZ + 0.03, hood + 0.03],
          [headerZ, height - 0.14],
          [(headerZ + roofEndZ) / 2, height - 0.07],
          [roofEndZ, height - 0.12],
          [Math.max(windowEnd, roofEndZ + 0.01), bed ? height - 0.14 : hood + 0.1],
        ]
      : [
          [-9, 0],
          [9, 0],
        ],
    windowZ: hasWindow ? [cowlZ + 0.03, windowEnd] : [0, 0],
    railWidth: [
      [noseZ, w * 0.5],
      [axleZ[0], w * 0.68],
      [cowlZ, w * 0.8],
      [(cowlZ + headerZ) / 2 + 0.2, w * 0.72],
      [roofEndZ, w * 0.7],
      [tailZ, w * 0.74],
    ],
    tail: tails[style](),
    seams: open || bed ? [cowlZ + 0.12, cowlZ + 1.05] : [cowlZ + 0.12, headerZ + 0.75, Math.min(headerZ + 1.5, axleZ[1] - radius - 0.1)],
    pillars: hasWindow && !bed ? [[headerZ + 0.72, headerZ + 0.79]] : [],
    mirror: { z: cowlZ + 0.3, h: hood + 0.14, x: w - 0.06 },
    rearPlateH: sill + 0.42,
    decals: [...plates(sill + 0.42, sill + 0.2), ...handles([headerZ + 0.5], hood - 0.04), ...(car.decals ?? [])],
    blocks: car.blocks,
    nose: car.nose,
    noseRake: car.rake,
    flareM: car.flare,
    rearSeats: seats,
    cabinEndZ: bed ? roofEndZ : open ? headerZ + 1.2 : Math.min(roofEndZ + 0.2, tailZ - 0.5),
    seat: car.seat,
    extra: {
      ...(bed || open ? { bedFloorH: open ? sill + 0.14 : deck - 0.42, bedSurface: open ? ("interior" as const) : ("trim" as const) } : {}),
      wing: car.wing,
      roofBars: car.roofBars ? { from: headerZ + 0.3, to: roofEndZ - 0.1, x: w * 0.6, rise: 0.05 } : undefined,
    },
  };
  return {
    name: car.name,
    paint: car.paint,
    livery: car.livery,
    body: bodyOf(shape),
    wheel: { radiusM: radius, widthM: tyre, rimShare: car.rim ?? 0.66, spokes: car.spokes ?? 5, twinSpokes: car.twin ?? false },
    shadowHalf: [w, tailZ],
  };
}

const round = (x: number, h: number, wide: number): Decal[] => [
  { on: "front", at: [x, h], size: [wide + 0.03, wide + 0.03], surface: "rim", mirror: true, round: true, liftM: 0.01 },
  { on: "front", at: [x, h], size: [wide, wide], surface: "lensHead", mirror: true, round: true, liftM: 0.014 },
];
const stripe = (wide: number, along: number, h: number, long: number): Decal => ({ on: "side", at: [along, h], size: [long, wide], surface: "stripe", mirror: true, cells: [8, 1] });
const hoodStripe = (x: number, wide: number, z: number, long: number): Decal => ({ on: "top", at: [x, z], size: [wide, long], surface: "stripe", cells: [1, 8], mirror: true });

/** The eight other cars a player can own. */
const SALTA = sketched({ name: "Sälta", paint: "car-paint-sky", size: [4.75, 2.72, 1.72, 1.44], radius: 0.31, tyre: 0.185, sill: 0.2, hood: 0.88, screen: [-0.95, -0.25, 2.0], tail: "upright", nose: "grille", rake: 0.3, roofBars: true, spokes: 8, rim: 0.6, belt: 0.04, seat: "seatTan" });
const VIK = sketched({ name: "Vik", paint: "car-paint-oxblood", size: [3.95, 2.3, 1.55, 1.12], radius: 0.3, tyre: 0.165, sill: 0.17, hood: 0.72, screen: [-0.28, -0.12, 0.2], tail: "open", nose: "round", rake: 2, spokes: 14, rim: 0.7, seat: "seatTan", flare: 0.05, decals: round(0.46, 0.57, 0.15) });
const STEN = sketched({ name: "Sten", paint: "car-paint-orange", size: [3.95, 2.5, 1.78, 1.42], radius: 0.31, tyre: 0.215, sill: 0.2, hood: 0.86, screen: [-0.92, -0.2, 1.42], tail: "upright", nose: "grille", rake: 0.6, flare: 0.045, spokes: 6, decals: [stripe(0.09, 0, 0.56, 3)], blocks: [{ at: [0, 1.44, -0.05], size: [0.34, 0.04, 0.24], surface: "trim", fine: true }, { at: [0.3, 0.62, -1.99], size: [0.17, 0.17, 0.08], surface: "lensHead", mirror: true }] });
const BERG = sketched({ name: "Berg", paint: "car-paint-cream", size: [4.4, 2.6, 1.84, 1.92], radius: 0.4, tyre: 0.26, sill: 0.42, hood: 1.24, screen: [-1.0, -0.62, 1.98], tail: "box", nose: "round", rake: 0.2, spokes: 5, rim: 0.56, belt: 0.02, decals: round(0.56, 0.98, 0.2), roofBars: true, blocks: [{ at: [0, 1.15, 2.3], size: [0.72, 0.72, 0.2], surface: "tyre" }] });
const STROM = sketched({ name: "Ström", paint: "car-paint-mint", size: [4.5, 2.85, 1.9, 1.62], radius: 0.36, tyre: 0.235, sill: 0.26, hood: 0.98, screen: [-1.2, -0.3, 1.5], tail: "fast", nose: "smooth", rake: 1.4, rim: 0.74, spokes: 3, twin: true, belt: 0.14 });
const ANKAR = sketched({ name: "Ankar", paint: "car-paint-black", size: [5.1, 3.05, 1.92, 1.46], radius: 0.35, tyre: 0.245, sill: 0.19, hood: 0.92, screen: [-0.95, -0.2, 1.0], tail: "notch", nose: "grille", rake: 0.4, spokes: 10, rim: 0.74, seat: "seatTan", decals: [stripe(0.012, 0, 0.8, 4.2)] });
const BRIS = sketched({ name: "Bris", paint: "car-paint-white", size: [4.3, 2.55, 1.8, 1.3], radius: 0.32, tyre: 0.225, sill: 0.18, hood: 0.84, screen: [-0.6, -0.1, 0.3], tail: "open", nose: "paint", rake: 1.3, rim: 0.74, seat: "seatTan", rearSeats: true });
const GRUS = sketched({ name: "Grus", paint: "car-paint-white", size: [4.2, 2.5, 1.88, 1.34], radius: 0.32, tyre: 0.245, sill: 0.2, hood: 0.8, screen: [-0.78, -0.08, 0.8], tail: "fast", nose: "paint", rake: 1.6, flare: 0.06, rim: 0.7, spokes: 6, rearSeats: false, decals: [hoodStripe(0.14, 0.18, -1.45, 1.35), stripe(0.14, 0, 0.5, 3)], wing: { z: 1.85, h: 1.2, halfWidth: 0.78, chord: 0.14, rise: 0.045 } });

/** Cars of the world, which nobody drives. */
const WORLD: readonly Sketch[] = [
  { name: "Raggare", paint: "car-paint-cream", livery: true, size: [5.5, 3.05, 1.98, 1.42], radius: 0.36, tyre: 0.215, sill: 0.2, hood: 0.92, screen: [-0.8, -0.2, 0.9], tail: "notch", nose: "round", rake: 0.3, rim: 0.56, spokes: 9, belt: 0.06, decals: [...round(0.68, 0.74, 0.17), { on: "front", at: [0, 0.34], size: [1.9, 0.09], surface: "rim", cells: [6, 1] }, { on: "rear", at: [0, 0.36], size: [1.9, 0.09], surface: "rim", cells: [6, 1] }, stripe(0.03, 0, 0.72, 4.8)], blocks: [{ at: [0.86, 1.02, 2.2], size: [0.1, 0.34, 1.1], surface: "paint", mirror: true, taper: [0.5, 0.2] }] },
  { name: "Myra", paint: "car-paint-sky", size: [2.75, 1.75, 1.46, 1.52], radius: 0.24, tyre: 0.145, sill: 0.17, hood: 0.8, screen: [-0.72, -0.26, 1.05], tail: "upright", nose: "paint", rake: 0.5, rim: 0.56 },
  { name: "Brev", paint: "car-paint-post", livery: true, size: [4.6, 2.8, 1.84, 2.0], radius: 0.33, tyre: 0.205, sill: 0.24, hood: 1.16, screen: [-1.42, -0.66, 2.1], tail: "box", nose: "paint", rake: 0.7, rim: 0.56, decals: [stripe(0.22, 0.5, 1.2, 2.8)] },
  { name: "Åker", paint: "car-paint-grey", size: [5.0, 3.0, 1.84, 1.72], radius: 0.36, tyre: 0.215, sill: 0.34, hood: 1.08, screen: [-0.86, -0.3, 0.68], tail: "bed", nose: "grille", rake: 0.3, rim: 0.55 },
  { name: "Droska", paint: "car-paint-black", livery: true, size: [4.8, 2.82, 1.84, 1.47], radius: 0.33, tyre: 0.215, sill: 0.2, hood: 0.92, screen: [-0.95, -0.22, 1.0], tail: "notch", nose: "grille", rake: 0.5, blocks: [{ at: [0, 1.53, 0.35], size: [0.56, 0.12, 0.16], surface: "plate" }] },
  { name: "Vakt", paint: "car-paint-white", livery: true, size: [4.8, 2.8, 1.86, 1.52], radius: 0.33, tyre: 0.225, sill: 0.2, hood: 0.93, screen: [-1.0, -0.25, 1.95], tail: "upright", nose: "paint", rake: 0.9, decals: [stripe(0.26, 0, 0.66, 4.2)], blocks: [{ at: [0, 1.57, 0.3], size: [1.05, 0.09, 0.26], surface: "stripe" }] },
  { name: "Pärla", paint: "car-paint-silver", size: [3.55, 2.34, 1.64, 1.5], radius: 0.29, tyre: 0.175, sill: 0.2, hood: 0.86, screen: [-0.98, -0.3, 1.32], tail: "upright", nose: "paint", rake: 1 },
  { name: "Nio", paint: "car-paint-silver", size: [4.0, 2.48, 1.68, 1.42], radius: 0.3, tyre: 0.185, sill: 0.2, hood: 0.86, screen: [-0.92, -0.24, 1.3], tail: "upright", nose: "grille", rake: 0.4 },
  { name: "Tusen", paint: "car-paint-silver", size: [4.2, 2.58, 1.76, 1.48], radius: 0.31, tyre: 0.195, sill: 0.2, hood: 0.92, screen: [-1.05, -0.28, 1.4], tail: "upright", nose: "slit", rake: 1 },
  { name: "Nu", paint: "car-paint-silver", size: [4.3, 2.66, 1.8, 1.46], radius: 0.325, tyre: 0.215, sill: 0.19, hood: 0.94, screen: [-1.0, -0.2, 1.3], tail: "upright", nose: "grille", rake: 1.2 },
  { name: "Rad", paint: "car-paint-silver", size: [4.7, 2.76, 1.82, 1.46], radius: 0.325, tyre: 0.215, sill: 0.2, hood: 0.92, screen: [-0.96, -0.22, 0.98], tail: "notch", nose: "slit", rake: 1 },
  { name: "Stig", paint: "car-paint-silver", size: [4.4, 2.66, 1.84, 1.62], radius: 0.345, tyre: 0.225, sill: 0.28, hood: 1.02, screen: [-1.02, -0.28, 1.5], tail: "upright", nose: "grille", rake: 0.8, roofBars: true },
  { name: "Långa", paint: "car-paint-silver", size: [4.75, 2.78, 1.84, 1.5], radius: 0.325, tyre: 0.215, sill: 0.2, hood: 0.92, screen: [-1.0, -0.24, 1.95], tail: "upright", nose: "slit", rake: 0.9, roofBars: true },
  { name: "Flock", paint: "car-paint-silver", size: [4.65, 2.82, 1.84, 1.72], radius: 0.33, tyre: 0.215, sill: 0.2, hood: 1.0, screen: [-1.42, -0.62, 1.92], tail: "upright", nose: "paint", rake: 1 },
  { name: "Gammal", paint: "car-paint-silver", size: [4.5, 2.62, 1.7, 1.42], radius: 0.3, tyre: 0.185, sill: 0.2, hood: 0.86, screen: [-0.9, -0.26, 0.92], tail: "notch", nose: "grille", rake: 0.2 },
  { name: "Bud", paint: "car-paint-white", size: [4.3, 2.72, 1.76, 1.8], radius: 0.31, tyre: 0.195, sill: 0.22, hood: 1.0, screen: [-1.2, -0.46, 1.95], tail: "box", nose: "paint", rake: 0.8 },
  { name: "Verk", paint: "car-paint-white", size: [5.0, 3.0, 1.84, 1.7], radius: 0.35, tyre: 0.225, sill: 0.3, hood: 1.04, screen: [-0.9, -0.28, 0.66], tail: "bed", nose: "paint", rake: 0.5 },
  { name: "Puls", paint: "car-paint-silver", size: [3.9, 2.56, 1.76, 1.54], radius: 0.32, tyre: 0.195, sill: 0.2, hood: 0.92, screen: [-1.06, -0.3, 1.2], tail: "upright", nose: "smooth", rake: 1.2, rim: 0.72 },
];

/** Cars a player can drive, with a hero model and a world model each. */
export const CARS: readonly CarSpec[] = [PLAYER_CAR, HATCH, ESTATE, COUPE, PICKUP, VAN, SALTA, VIK, STEN, BERG, STROM, ANKAR, BRIS, GRUS];

/** Cars only ever seen in the world: a world model and a stand-in. */
export const WORLD_CARS: readonly CarSpec[] = WORLD.map(sketched);
