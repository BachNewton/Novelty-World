import { ROWS, type Band, type Decal, type Fender, type Strut } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { projectors, sideIntake, splitter } from "../parts";
import { bodyOf, driven, faired, handles, type Shape } from "../recipe";

const SPAN = driven("span");
const { sillTop, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;
const [FRONT, REAR] = SPAN.axleZ;
/** Where each wheel's upright stands, just inside the tyre, and so where the arms meet. */
const HUB_X = SPAN.trackM / 2 - 0.145;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: 0, to: ALL }],
  mouth: [{ surface: "grille", from: sillTop, to: ALL }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  /** A small aero screen, wrapped down to the tub's sides, its back glass too. */
  screen: [{ surface: "glass", from: windowBase, to: ALL }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  mesh: [{ surface: "grille", from: rail, to: ALL }],
  diffuser: [{ surface: "grille", from: sillTop, to: ALL }],
};

/**
 * Fjäder's signature: each lamp a stack of three short bars of light, stepped out and down like a feather's barbs,
 * in a dark housing (near only: on the far model's coarser nose it would meet a bar in one plane); the same at the
 * tail in red.
 */
function feather(on: "front" | "rear", x: number, h: number, surface: Decal["surface"], scale = 1): Decal[] {
  return [
    { on, at: [x + 0.02 * scale, h], size: [0.17 * scale, 0.1 * scale], surface: "trim", mirror: true, cells: [4, 2], liftM: 0.008, fine: true },
    ...[0, 1, 2].map(
      (barb): Decal => ({ on, at: [x + (barb * 0.025 - 0.015) * scale, h + (0.03 - barb * 0.03) * scale], size: [(0.12 - barb * 0.015) * scale, 0.016 * scale], surface, mirror: true, cells: [4, 1], liftM: 0.016 }),
    ),
  ];
}

/** One corner's suspension, exposed: the upright, the two wishbones, the push or toe rod, all meeting at the upright. */
function corner(axle: number, bodyX: number, push: boolean): Strut[] {
  const arm = (h: number, hubH: number): Strut => ({
    path: [
      [bodyX, h, axle - 0.24],
      [HUB_X - 0.01, hubH, axle],
      [bodyX, h + 0.01, axle + 0.24],
    ],
    radius: 0.013,
    surface: "rimDark",
    mirror: true,
    fine: true,
  });
  return [
    { path: [[HUB_X, 0.15, axle], [HUB_X, 0.48, axle]], radius: 0.026, surface: "trim", mirror: true, fine: true },
    arm(0.17, 0.18),
    arm(0.37, 0.45),
    push
      ? { path: [[HUB_X - 0.02, 0.19, axle + 0.03], [bodyX - 0.06, 0.36, axle + 0.05]], radius: 0.011, surface: "rim", mirror: true, fine: true }
      : { path: [[HUB_X - 0.02, 0.3, axle + 0.09], [bodyX, 0.29, axle + 0.12]], radius: 0.01, surface: "rim", mirror: true, fine: true },
  ];
}

const fender = (axle: number, from: number, to: number, wide: number): Fender => ({
  axle,
  x: SPAN.trackM / 2,
  wide,
  clearM: 0.05,
  from,
  to,
  thick: 0.014,
  crown: 0.014,
  surface: "paint",
});

/** The hoop behind the seats, its two back stays, and the stays that hold each front wing to its upright. */
const STRUCTURE: Strut[] = [
  {
    path: [
      [0.54, 0.62, 0.66],
      [0.52, 0.9, 0.65],
      [0.46, 1.03, 0.64],
      [0.3, 1.09, 0.63],
      [0, 1.1, 0.63],
      [-0.3, 1.09, 0.63],
      [-0.46, 1.03, 0.64],
      [-0.52, 0.9, 0.65],
      [-0.54, 0.62, 0.66],
    ],
    radius: 0.024,
    surface: "rimDark",
  },
  { path: [[0.38, 1.07, 0.65], [0.2, 0.83, 1.12]], radius: 0.017, surface: "rimDark", mirror: true },
  // The frame's top rail, bare along each edge of the cockpit from the screen to the hoop.
  { path: [[0.555, 0.712, -0.4], [0.6, 0.716, -0.1], [0.605, 0.716, 0.3], [0.575, 0.705, 0.64]], radius: 0.016, surface: "rimDark", mirror: true },
  { path: [[HUB_X + 0.02, 0.68, FRONT - 0.06], [HUB_X, 0.48, FRONT]], radius: 0.012, surface: "trim", mirror: true, fine: true },
  ...corner(FRONT, 0.3, true),
  ...corner(REAR, 0.42, false),
];

/** A track car that is barely a body: a narrow tub with an open cockpit, its wheels outside it under cycle wings. */
const shape: Shape = {
  trackM: SPAN.trackM,
  axleZ: SPAN.axleZ,
  wheelRadiusM: SPAN.wheelRadiusM,
  tyreWidthM: 0.24,
  noseZ: -1.89,
  tailZ: 1.89,
  halfWidth: 0.64,
  sillH: 0.09,
  flareM: 0,
  grilleH: 0.25,
  lampH: [0.3, 0.33],
  hoodLipH: 0.38,
  hoodH: 0.47,
  cowl: [-0.68, 0.67],
  header: [-0.47, 0.86],
  roof: [-0.43, 0.7],
  roofEnd: [0.6, 0.7],
  shoulder: [
    [-1.89, 0.27],
    [-1.38, 0.36],
    [-0.9, 0.44],
    [-0.6, 0.5],
    [0.4, 0.53],
    [0.97, 0.5],
    [1.89, 0.48],
  ],
  belt: [
    [-1.89, 0.3],
    [-1.38, 0.4],
    [-0.9, 0.48],
    [-0.6, 0.55],
    [0.4, 0.58],
    [0.97, 0.56],
    [1.89, 0.53],
  ],
  windowTop: [
    [-9, 0],
    [9, 0],
  ],
  windowZ: [0, 0],
  railWidth: [
    [-1.89, 0.18],
    [-1.38, 0.22],
    [-0.9, 0.3],
    [-0.68, 0.4],
    [-0.47, 0.46],
    [0.6, 0.46],
    [0.72, 0.22],
    [1.2, 0.2],
    [1.89, 0.3],
  ],
  tail: [],
  seams: [],
  pillars: [],
  mirror: { z: -0.5, h: 0.66, x: 0.56 },
  rearPlateH: 0.52,
  rearSeats: false,
  decals: [
    // The main beam: a lit lens in the lamp, so it reads as a headlamp at night.
    ...projectors({ x: [0.245], h: 0.31, size: 0.04 }),
    { on: "rear", at: [0, 0.45], size: [0.46, 0.11], surface: "plate", cells: [4, 1], fine: true },
    ...handles([-0.1], 0.6),
    ...feather("front", 0.24, 0.31, "lensHead"),
    ...feather("rear", 0.25, 0.55, "lensTail", 1.1),
    // The rain light, in the middle of the tail between the lamps.
    { on: "rear", at: [0, 0.56], size: [0.06, 0.06], surface: "lensTail", cells: [1, 1], liftM: 0.012 },
    sideIntake({ z: 0.22, h: 0.42, long: 0.3, tall: 0.13 }),
    // The tub's bare carbon lower half, under the painted top: the structure showing through the body.
    { on: "side", at: [-0.2, 0.255], size: [1.64, 0.15], surface: "trim", mirror: true, cells: [16, 2], liftM: 0.012 },
  ],
  blocks: [
    splitter({ z: -1.96, h: 0.17, halfWidth: 0.46, long: 0.13 }),
    // The front wing's endplates, standing at the splitter's tips.
    { at: [0.465, 0.205, -1.895], size: [0.012, 0.08, 0.13], surface: "trim", mirror: true },
    // The diffuser's strakes under the tail.
    ...[0.16, 0.34].map((x) => ({ at: [x, 0.19, 1.62] as const, size: [0.012, 0.1, 0.5] as const, surface: "trim" as const, mirror: true, taper: [1, 1.4] as const })),
  ],
  extra: {
    bands: BANDS,
    openWheels: true,
    cleanEnds: true,
    bedFloorH: 0.18,
    bedSurface: "interior",
    silhouette: [
      { z: -1.86, h: 0.17, band: "bumper" },
      { z: -1.885, h: 0.2, band: "mouth" },
      { z: -1.89, h: 0.25 },
      ...faired(
        [
          [-1.87, 0.38],
          [-1.6, 0.43],
          [-1.38, 0.47],
          [-1.0, 0.55],
          [-0.72, 0.645],
        ],
        [[-1.87, undefined]],
      ),
      { z: -0.72, h: 0.645, band: "cowl" },
      { z: -0.68, h: 0.67, band: "screen" },
      { z: -0.47, h: 0.86, band: "screen" },
      // The scuttle over the driver's legs, falling to the cockpit's rim.
      { z: -0.42, h: 0.79, bed: true },
      { z: -0.12, h: 0.7, bed: true },
      ...faired(
        [
          [0.6, 0.7],
          [0.72, 0.86],
          [0.92, 0.93],
          [1.3, 0.84],
          [1.62, 0.73],
          [1.8, 0.68],
        ],
        [[0.6, undefined]],
      ),
      { z: 1.8, h: 0.68, band: "tailDark" },
      { z: 1.82, h: 0.5, band: "mesh" },
      { z: 1.86, h: 0.39, band: "diffuser" },
      { z: 1.89, h: 0.2 },
    ],
    crown: [
      [-1.89, 0.03],
      [-1.38, 0.05],
      [-0.9, 0.06],
      [-0.68, 0.05],
      [-0.47, 0.02],
      [0.6, 0.02],
      [0.75, 0.12],
      [1.0, 0.16],
      [1.5, 0.1],
      [1.89, 0.03],
    ],
    halfWidth: [
      [-1.89, 0.3],
      [-1.75, 0.34],
      [-1.38, 0.36],
      [-1.0, 0.46],
      [-0.75, 0.6],
      [-0.3, 0.64],
      [0.3, 0.64],
      [0.62, 0.58],
      [0.97, 0.47],
      [1.4, 0.48],
      [1.89, 0.46],
    ],
    hoodSeamZ: [0, 0],
    cornerPullM: [0.2, 0.05],
    fenders: [fender(FRONT, 15, 150, 0.29), fender(REAR, 25, 172, 0.3)],
    struts: STRUCTURE,
    wing: { z: 1.6, h: 1.08, halfWidth: 0.76, chord: 0.22, rise: 0.06, endplates: true, stayM: 0.45 },
    exhausts: { x: [-0.11, 0.11], h: 0.31, z: 1.875, radius: 0.04 },
    cabin: { dashZ: -0.62, dashH: 0.5, floorH: 0.18, seatZ: 0.2, endZ: 0.6, seatX: 0.3, seatSurface: "seat", wideM: 1.1 },
  },
};

export const span: CarSpec = {
  id: SPAN.id,
  name: SPAN.name,
  ride: SPAN.ride,
  paint: "car-paint-fjader",
  paints: [
    paint("car-paint-fjader"),
    paint("car-paint-carbon-weave", "metallic"),
    paint("car-paint-lime"),
    paint("car-paint-white"),
    paint("car-paint-lemon"),
    paint("car-paint-ultramarine", "metallic"),
    paint("car-paint-graphite", "matte"),
  ],
  body: bodyOf(shape),
  /** A track car's cockpit: one race display with shift lights, a small flat wheel, buckets in harnesses, bare carbon, Fjäder orange. */
  interior: {
    gauges: "race",
    wheel: "flat",
    shifter: "sequential",
    seats: "bucket",
    screen: false,
    harness: true,
    rearMirror: false,
    colours: { dash: "car-cabin-carbon", trim: "car-cabin-carbon", insert: "car-cabin-carbon", accent: "car-cabin-fjader", glow: "car-cabin-glow-red" },
    turnsToLock: 0.9,
    eye: [0, 0.16, 0],
  },
  wheel: { radiusM: SPAN.wheelRadiusM, widthM: 0.24, rimShare: 0.72, spokes: 6, twinSpokes: false, style: "blade" },
  shadowHalf: [0.92, 1.89],
};
