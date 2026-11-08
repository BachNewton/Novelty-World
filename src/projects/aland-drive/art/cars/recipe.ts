import { CARS as TUNINGS, type CarId } from "../../sim/cars";
import { ROWS, type Band, type Block, type BodySpec, type Cabin, type Decal, type SilhouettePoint } from "./body";
import { rideOf, WORLD_RIDE, type CarSpec } from "./build";
import { curve, type Key } from "./curve";
import type { Surface } from "./mesh";
import type { RimStyle } from "./wheel";
import type { CarPaint } from "./paints";

/*
 * The one recipe every car's art is drawn on: a car is a set of numbers, where
 * the axles, the screen, the roof and the tail are, and which tail it has, in
 * full (`Shape`, through `bodyOf`) or as a sketch of a dozen numbers
 * (`sketched`). All are invented: no maker, no badge, no real car's face. A car
 * a player can drive takes its name, axles, track, wheels and ride height from
 * its simulation (`driven`), so it sits on its wheels where the simulation has
 * them.
 */

/** What a drivable car's art takes from its simulation. */
export function driven(id: CarId) {
  const tuning = TUNINGS[id];
  const { axleZ, trackM, wheelRadiusM } = tuning.car;
  return { id, name: tuning.name, ride: rideOf(tuning), axleZ, trackM, wheelRadiusM };
}

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

export interface Shape {
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

export const thirdBrake = (z: number, wide = 0.5): Decal => ({ on: "top", at: [0, z], size: [wide, 0.028], surface: "lensTail", cells: [4, 1], fine: true });

/**
 * A stretch of silhouette sampled from one fair curve through `keys`, every `stepM`, the first key included and the
 * last left for the next point: a hood, a screen, a roof and a deck as one smooth line, so no kink between hand-placed
 * points shows as a dent in the reflection. `bands` says which band runs from each z on (`undefined` for paint), and a
 * band's start is always a point. Every third point is firm, so the far model keeps the outline.
 */
export function faired(keys: readonly Key[], bands: readonly (readonly [z: number, band: string | undefined])[], stepM = 0.08): SilhouettePoint[] {
  const top = curve(keys);
  const [start, end] = [keys[0][0], keys[keys.length - 1][0]];
  const count = Math.max(1, Math.round((end - start) / stepM));
  const at = new Set<number>(Array.from({ length: count }, (_, step) => start + ((end - start) * step) / count));
  for (const [z] of bands) if (z >= start && z < end) at.add(z);
  const bandAt = (z: number) => bands.filter(([from]) => from <= z + 1e-9).at(-1)?.[1];
  const starts = new Set(bands.map(([z]) => z));
  return [...at]
    .sort((a, b) => a - b)
    .map((z, index) => ({ z, h: top(z), band: bandAt(z), fine: index % 3 !== 0 && !starts.has(z) }));
}

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

export function bodyOf(shape: Shape): BodySpec {
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

/**
 * The plates, rear and front. The front one is a little smaller than the rear, as a short European plate is, so it
 * doesn't read as a slab across a nose; `recessed` sets it in a dark recess, for a nose with no bumper to carry it.
 */
export const plates = (rearH: number, frontH: number, { recessed = false } = {}): Decal[] => [
  { on: "rear", at: [0, rearH], size: [0.46, 0.11], surface: "plate", cells: [4, 1], fine: true },
  ...(recessed ? [{ on: "front", at: [0, frontH], size: [0.42, 0.11], surface: "grille", cells: [8, 2], liftM: 0.008, fine: true } satisfies Decal] : []),
  { on: "front", at: [0, frontH], size: [0.36, 0.085], surface: "plate", cells: [8, 2], liftM: 0.018, fine: true },
];

export const handles = (zs: readonly number[], h: number): Decal[] => zs.map((z) => ({ on: "side", at: [z, h], size: [0.13, 0.022], surface: "trim", mirror: true, fine: true }));

export const reversing = (x: number, h: number): Decal => ({ on: "rear", at: [x, h], size: [0.14, 0.035], surface: "lensReverse", mirror: true, cells: [2, 1], fine: true });

export const reflector = (x: number, h: number): Decal => ({ on: "rear", at: [x, h], size: [0.2, 0.03], surface: "lensTail", mirror: true, cells: [2, 1], fine: true });

/** A hero's lamps as units: projectors in the headlamp, dividers in the tail's light. */
export function lampUnits({ headX, headH, tailH, tailX }: { headX: readonly number[]; headH: number; tailH: number; tailX: readonly [number, number] }): Decal[] {
  const dividers = Array.from({ length: 4 }, (_, at) => tailX[0] + ((tailX[1] - tailX[0]) * at) / 3);
  return [
    ...headX.flatMap((x): Decal[] => [
      { on: "front", at: [x, headH], size: [0.075, 0.05], surface: "trim", mirror: true, round: true, fine: true, liftM: 0.012 },
      { on: "front", at: [x, headH], size: [0.05, 0.034], surface: "rim", mirror: true, round: true, fine: true, liftM: 0.016 },
    ]),
    ...dividers.map((x): Decal => ({ on: "rear", at: [x, tailH], size: [0.012, 0.09], surface: "trim", mirror: true, fine: true })),
  ];
}

type TailStyle = "fast" | "notch" | "upright" | "box" | "bed" | "open";

/** A car in a dozen numbers: the rest of its shape follows from them. A drivable car's wheels and name are its simulation's. */
export type Sketch = SketchShape & ({ driven: ReturnType<typeof driven> } | { name: string; base: number; radius: number });

interface SketchShape {
  paint: string;
  /** A drivable car's paints, the first `paint` itself (`paints.ts`). */
  paints?: readonly CarPaint[];
  livery?: boolean;
  /** Length, width, height. */
  size: readonly [number, number, number];
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
  /** The rim's design: what `twin` picks between when it isn't given. */
  style?: RimStyle;
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

export function sketched(car: Sketch): CarSpec {
  const sim = "driven" in car ? car.driven : null;
  const [name, radius, axleZ] = "driven" in car ? [car.driven.name, car.driven.wheelRadiusM, car.driven.axleZ] : [car.name, car.radius, [-car.base / 2, car.base / 2] as const];
  const [length, width, height] = car.size;
  const { tyre, sill, hood, tail: style } = car;
  const [cowlZ, headerZ, roofEndZ] = car.screen;
  const [noseZ, tailZ] = [-length / 2, length / 2];
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
    trackM: sim?.trackM ?? width - tyre - 0.03,
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
    id: sim?.id,
    name,
    ride: sim?.ride ?? WORLD_RIDE,
    paint: car.paint,
    paints: car.paints,
    livery: car.livery,
    body: bodyOf(shape),
    wheel: { radiusM: radius, widthM: tyre, rimShare: car.rim ?? 0.66, spokes: car.spokes ?? 5, twinSpokes: car.twin ?? false, style: car.style },
    shadowHalf: [w, tailZ],
  };
}

export const roundLamps = (x: number, h: number, wide: number): Decal[] => [
  { on: "front", at: [x, h], size: [wide + 0.03, wide + 0.03], surface: "rim", mirror: true, round: true, liftM: 0.01 },
  { on: "front", at: [x, h], size: [wide, wide], surface: "lensHead", mirror: true, round: true, liftM: 0.014 },
];
export const stripe = (wide: number, along: number, h: number, long: number): Decal => ({ on: "side", at: [along, h], size: [long, wide], surface: "stripe", mirror: true, cells: [8, 1] });
export const hoodStripe = (x: number, wide: number, z: number, long: number): Decal => ({ on: "top", at: [x, z], size: [wide, long], surface: "stripe", cells: [1, 8], mirror: true });
