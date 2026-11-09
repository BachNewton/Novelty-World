import { ROWS, type Band, type Block, type Decal, type Strut } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { louvres, sideIntake } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const DYN = driven("dyn");
const { sill, sillTop, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Ridgeway's desert pickup wears the maker's face on a truck's scale: a tall dark intake split down the middle by a
 * spine of the body's colour, which runs on up the hood as its power bulge between two vents, and at each upper corner
 * two stacked bars of light in a dark housing, the same again on the tailgate's corners. Every band starts and ends on
 * a row the far model has too (`build.ts`, `FAR`).
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  bumper: [{ surface: "cladding", from: sill, to: ALL }],
  /** The intake, split by the body's spine down the middle. */
  mouth: [{ surface: "grille", from: windowBase, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
};

/** The truck's ends and the cab, as heights over the road. */
const NOSE_Z = -2.8;
const TAIL_Z = 2.8;
const BED_H = 1.4;
/** Where the cab ends and the bed begins. */
const CAB_END_Z = 1.04;

/** A tube of the bed's cage or a shock, dark steel. */
const tube = (path: Strut["path"], radius = 0.028): Strut => ({ path, radius, surface: "trim", mirror: true });

/**
 * The bed's cage, a chase rack as desert trucks carry: a hoop standing behind the cab, braced back to the bed's tail,
 * and the rear bypass shocks rising through the bed floor to it, which say long travel from any angle.
 */
const cage: Strut[] = [
  tube([
    [0.86, BED_H - 0.02, CAB_END_Z + 0.2],
    [0.84, 1.86, CAB_END_Z + 0.24],
    [0.66, 2.0, CAB_END_Z + 0.26],
  ]),
  { path: [
    [-0.66, 2.0, CAB_END_Z + 0.26],
    [0.66, 2.0, CAB_END_Z + 0.26],
  ], radius: 0.028, surface: "trim" },
  tube([
    [0.7, 1.98, CAB_END_Z + 0.28],
    [0.86, BED_H - 0.02, TAIL_Z - 0.32],
  ], 0.024),
  // The rear shocks: a fat polished body over a thin rod, from the floor up to the hoop.
  { ...tube([
    [0.62, 1.0, 2.0],
    [0.64, 1.42, 1.7],
  ], 0.045), surface: "rim", fine: true },
  { ...tube([
    [0.64, 1.42, 1.7],
    [0.66, 1.92, CAB_END_Z + 0.32],
  ], 0.02), surface: "rim", fine: true },
  // The front shocks, standing in each wheel's well behind the tyre, seen through the tall arch.
  { ...tube([
    [0.62, 0.78, DYN.axleZ[0] + 0.1],
    [0.58, 1.18, DYN.axleZ[0] + 0.02],
  ], 0.04), surface: "caliper", fine: true },
  // The rock slider under each door, a step and a guard.
  tube(
    [
      [1.0, 0.58, -1.2],
      [1.03, 0.58, -1.0],
      [1.03, 0.58, 1.0],
      [1.0, 0.58, 1.2],
    ],
    0.035,
  ),
];

/** The roof's light bar over the screen: a dark housing on two feet, a strip of lamps along its face. */
const lightBar: Block[] = [
  { at: [0, 1.995, -0.2], size: [1.36, 0.085, 0.1], surface: "trim" },
  { at: [0, 1.995, -0.252], size: [1.28, 0.05, 0.012], surface: "lensHead" },
  { at: [0.5, 1.935, -0.18], size: [0.06, 0.06, 0.06], surface: "trim", mirror: true, fine: true },
];

/** The steel bumpers, front and back, and the plate under the nose that the truck lands on. */
const steel: Block[] = [
  { at: [0, 0.74, NOSE_Z - 0.04], size: [1.74, 0.2, 0.14], surface: "cladding", taper: [1.02, 1] },
  { at: [0, 0.6, NOSE_Z + 0.3], size: [1.3, 0.03, 0.6], surface: "trim", fine: true },
  { at: [0, 0.72, TAIL_Z + 0.03], size: [1.82, 0.18, 0.14], surface: "cladding" },
];

/** The twin stripes either side of the hood's spine and on over the roof, lifted clear of the curved panels. */
const stripes: Decal[] = [
  { on: "top", at: [0.2, -1.88], size: [0.15, 1.72], surface: "stripe", mirror: true, cells: [1, 6], liftM: 0.014 },
  { on: "top", at: [0.2, 0.32], size: [0.15, 1.2], surface: "stripe", mirror: true, cells: [1, 4], liftM: 0.012 },
  // A broad band low down each flank, from the front arch to the tail, read from the chase camera's height.
  { on: "side", at: [-0.08, 0.86], size: [2.84, 0.1], surface: "stripe", mirror: true, cells: [10, 1], liftM: 0.01 },
  { on: "side", at: [2.3, 0.86], size: [0.92, 0.1], surface: "stripe", mirror: true, cells: [4, 1], liftM: 0.01 },
];

/** A long-travel desert-racing crew-cab pickup: tall and wide, its wheels far out in big flares, a short bed under a cage. */
const shape: Shape = {
  trackM: DYN.trackM,
  axleZ: DYN.axleZ,
  wheelRadiusM: DYN.wheelRadiusM,
  tyreWidthM: 0.33,
  noseZ: NOSE_Z,
  tailZ: TAIL_Z,
  halfWidth: 1.0,
  sillH: 0.54,
  rearSillH: 0.56,
  flareM: 0.1,
  archClearM: 0.14,
  grilleH: 1.1,
  lampH: [1.12, 1.2],
  hoodLipH: 1.24,
  hoodH: 1.33,
  cowl: [-0.96, 1.37],
  header: [-0.3, 1.9],
  roof: [0.35, 1.97],
  roofEnd: [1.0, 1.95],
  shoulder: [
    [NOSE_Z, 1.02],
    [-2.5, 1.12],
    [-1.86, 1.2],
    [-0.96, 1.27],
    [0.2, 1.29],
    [1.84, 1.3],
    [TAIL_Z, 1.28],
  ],
  belt: [
    [NOSE_Z, 1.1],
    [-2.5, 1.2],
    [-1.86, 1.27],
    [-0.96, 1.34],
    [0.2, 1.36],
    [1.84, 1.37],
    [TAIL_Z, 1.36],
  ],
  windowTop: [
    [-0.92, 1.4],
    [-0.62, 1.62],
    [-0.3, 1.84],
    [0.3, 1.89],
    [0.96, 1.87],
    [1.0, 1.8],
  ],
  windowZ: [-0.92, 1.0],
  railWidth: [
    [NOSE_Z, 0.62],
    [-1.86, 0.8],
    [-0.96, 0.86],
    [-0.3, 0.8],
    [1.0, 0.82],
    [1.06, 0.9],
    [TAIL_Z, 0.9],
  ],
  tail: [],
  seams: [-0.86, 0.1, 0.96],
  pillars: [[0.06, 0.16]],
  mirror: { z: -0.72, h: 1.52, x: 1.08 },
  rearPlateH: 0.98,
  rearSeats: true,
  cabinEndZ: CAB_END_Z - 0.06,
  decals: [
    ...plates(0.98, 0.735),
    ...handles([-0.3, 0.55], 1.3),
    ...stripes,
    // Each lamp's two bars in a dark housing at the face's upper corners, which stands just off the face so the bars
    // can stand off it in turn.
    { on: "front", at: [0.72, 1.165], size: [0.4, 0.11], surface: "trim", mirror: true, cells: [4, 1], liftM: 0.006 },
    { on: "front", at: [0.71, 1.188], size: [0.36, 0.036], surface: "lensHead", mirror: true, cells: [5, 1], liftM: 0.012 },
    { on: "front", at: [0.75, 1.14], size: [0.28, 0.028], surface: "lensHead", mirror: true, cells: [4, 1], liftM: 0.012 },
    // The tailgate's corners: the same two bars, red.
    { on: "rear", at: [0.74, 1.22], size: [0.4, 0.12], surface: "trim", mirror: true, cells: [4, 1], liftM: 0.006 },
    { on: "rear", at: [0.73, 1.245], size: [0.36, 0.038], surface: "lensTail", mirror: true, cells: [5, 1], liftM: 0.012 },
    { on: "rear", at: [0.77, 1.195], size: [0.28, 0.03], surface: "lensTail", mirror: true, cells: [4, 1], liftM: 0.012 },
    { ...reversing(0.58, 1.195), size: [0.08, 0.03] },
    // Vents either side of the hood's spine, where the heat leaves the twin turbos.
    ...louvres({ x: 0.46, z: -2.2, long: 0.5, wide: 0.24, count: 5 }).map((slat) => ({ ...slat, liftM: 0.016 })),
    // A dark vent behind each front wheel, where the arch's air leaves.
    { ...sideIntake({ z: -1.32, h: 1.1, long: 0.16, tall: 0.12 }), cells: [2, 2], fine: true },
  ],
  blocks: [
    // The spine of the body's colour down the middle of the face, splitting the intake.
    { at: [0, 0.97, NOSE_Z - 0.03], size: [0.16, 0.3, 0.08], surface: "paint", taper: [0.85, 1] },
    // A slat of dark metal across each half of the intake.
    { at: [0.46, 0.96, NOSE_Z - 0.008], size: [0.6, 0.016, 0.02], surface: "rimDark", mirror: true, fine: true },
    ...steel,
    ...lightBar,
    // Red tow hooks through the front bumper.
    { at: [0.56, 0.74, NOSE_Z - 0.13], size: [0.05, 0.08, 0.06], surface: "caliper", mirror: true, fine: true },
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    outwardBlocks: true,
    silhouette: [
      // The nose runs one way along the truck from its foot up, so no strip of the face folds back over another.
      { z: NOSE_Z + 0.08, h: 0.62, band: "bumper" },
      { z: NOSE_Z + 0.01, h: 0.66 },
      { z: NOSE_Z, h: 0.8, band: "mouth" },
      { z: NOSE_Z + 0.004, h: 1.1, band: "gap" },
      { z: NOSE_Z + 0.006, h: 1.11 },
      { z: NOSE_Z + 0.02, h: 1.22 },
      // The hood, then the screen and the roof, each as one fair line.
      ...faired(
        [
          [NOSE_Z + 0.05, 1.25],
          [-2.4, 1.3],
          [-1.86, 1.335],
          [-1.02, 1.36],
        ],
        [[NOSE_Z + 0.05, undefined]],
      ),
      { z: -1.02, h: 1.36, band: "cowl" },
      { z: -0.96, h: 1.37, band: "screen" },
      ...faired(
        [
          [-0.3, 1.9],
          [0.35, 1.97],
          [1.0, 1.95],
        ],
        [[-0.3, undefined]],
      ),
      { z: 1.0, h: 1.95, band: "rearGlass" },
      { z: 1.02, h: 1.5 },
      { z: CAB_END_Z, h: BED_H, bed: true },
      { z: TAIL_Z - 0.06, h: BED_H },
      { z: TAIL_Z - 0.02, h: BED_H - 0.03 },
      { z: TAIL_Z, h: 0.86, band: "bumper" },
      { z: TAIL_Z - 0.01, h: 0.64 },
      { z: TAIL_Z - 0.08, h: 0.6 },
    ],
    sill: [
      [NOSE_Z, 0.6],
      [-2.4, 0.56],
      [0, 0.54],
      [2.4, 0.57],
      [TAIL_Z, 0.6],
    ],
    crown: [
      [NOSE_Z, 0.05],
      [-2.4, 0.09],
      [-1.4, 0.09],
      [-1.0, 0.04],
      [0, 0.04],
      [1.0, 0.04],
      [1.1, 0.01],
      [TAIL_Z, 0.01],
    ],
    halfWidth: [
      [NOSE_Z, 0.93],
      [-2.55, 0.99],
      [-1.86, 1.0],
      [-0.6, 0.985],
      [0.6, 0.985],
      [1.84, 1.0],
      [2.6, 0.995],
      [TAIL_Z, 0.97],
    ],
    cornerPullM: [0.12, 0.05],
    hoodSeamZ: [-2.7, -1.08],
    archLipM: 0.07,
    bedFloorH: 1.0,
    spares: [{ at: [0, 1.46, 1.82], radiusM: 0.44, widthM: 0.3, axis: "z" }],
    struts: cage,
  },
};

export const dyn: CarSpec = {
  id: DYN.id,
  name: DYN.name,
  ride: DYN.ride,
  paint: "car-paint-ember",
  paints: [
    paint("car-paint-ember", "solid", { stripe: "car-paint-black" }),
    paint("car-paint-black", "solid", { stripe: "car-paint-ember" }),
    paint("car-paint-sand", "matte", { stripe: "car-paint-ember" }),
    paint("car-paint-white", "solid", { stripe: "car-paint-signal-red" }),
    paint("car-paint-acid", "solid", { stripe: "car-paint-black" }),
    paint("car-paint-ultramarine", "metallic", { stripe: "car-paint-white" }),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: DYN.wheelRadiusM, widthM: 0.33, rimShare: 0.52, spokes: 6, twinSpokes: false, style: "blade", beadlock: true },
  shadowHalf: [1.1, TAIL_Z],
  // A modern truck's cab: one digital cluster, a chunky round wheel, a selector on the console, and grab handles.
  interior: {
    gauges: "digital",
    wheel: "round",
    shifter: "selector",
    seats: "sport",
    screen: true,
    colours: { glow: "car-cabin-glow-red", headliner: "car-cabin-headliner-dark" },
  },
};
