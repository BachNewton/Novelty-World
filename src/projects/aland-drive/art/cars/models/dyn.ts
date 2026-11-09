import { ROWS, type Band, type Block, type Decal, type Strut } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { louvres, sideIntake } from "../parts";
import { bodyOf, driven, faired, handles, plates, reversing, type Shape } from "../recipe";

const DYN = driven("dyn");
const { belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Ridgeway's desert pickup wears the maker's face on a truck's scale: a tall dark intake split down the middle by a
 * spine of the body's colour, which runs on up the hood as its power bulge between two vents, and at each upper corner
 * two stacked bars of light in a dark housing, the same again on the tailgate's corners. Every band starts and ends on
 * a row the far model has too (`build.ts`, `FAR`).
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  /** The intake, split by the body's spine down the middle. */
  mouth: [{ surface: "grille", from: windowBase, to: ALL }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
};

/** The truck's ends and the cab, as heights over the road. */
const NOSE_Z = -2.56;
const TAIL_Z = 2.56;
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
  { ...tube([
    [0.7, 1.98, CAB_END_Z + 0.28],
    [0.86, BED_H - 0.02, TAIL_Z - 0.32],
  ], 0.024), fine: true },
  // The rear shocks: a fat polished body over a thin rod, from the floor up to the hoop.
  { ...tube([
    [0.62, 1.0, 2.0],
    [0.64, 1.42, 1.7],
  ], 0.045), surface: "caliper", fine: true },
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
      [0.98, 0.58, -1.12],
      [1.03, 0.58, -0.96],
      [1.03, 0.58, 0.96],
      [0.98, 0.58, 1.12],
    ],
    0.035,
  ),
];

/** The roof's light bar over the screen: a dark housing on two feet, a strip of lamps along its face. */
const lightBar: Block[] = [
  { at: [0, 1.995, -0.2], size: [1.36, 0.085, 0.1], surface: "trim" },
  // Its lenses polished and dark: a light bar is off on a public road, so it is never one of the headlamps.
  { at: [0, 1.995, -0.252], size: [1.28, 0.05, 0.012], surface: "rim", fine: true },
  { at: [0.5, 1.935, -0.2], size: [0.06, 0.06, 0.05], surface: "trim", mirror: true, fine: true },
];

/** The steel bumpers, front and back, and the plate under the nose that the truck lands on. */
const steel: Block[] = [
  { at: [0, 0.74, NOSE_Z - 0.02], size: [1.74, 0.2, 0.12], surface: "cladding", taper: [1.02, 1] },
  { at: [0, 0.6, NOSE_Z + 0.3], size: [1.3, 0.03, 0.6], surface: "trim", fine: true },
  { at: [0, 0.72, TAIL_Z + 0.02], size: [1.82, 0.18, 0.12], surface: "cladding" },
];

/** The twin stripes either side of the hood's spine and on over the roof, lifted clear of the curved panels. */
const stripes: Decal[] = [
  { on: "top", at: [0.2, -1.82], size: [0.15, 1.36], surface: "stripe", mirror: true, cells: [1, 8], liftM: 0.022 },
  { on: "top", at: [0.2, 0.32], size: [0.15, 1.2], surface: "stripe", mirror: true, cells: [1, 4], liftM: 0.012 },
  // A broad band low down each flank, from the front arch to the tail, read from the chase camera's height.
  { on: "side", at: [0, 0.86], size: [2.5, 0.1], surface: "stripe", mirror: true, cells: [10, 1], liftM: 0.01 },
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
  flareM: 0.045,
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
    [-2.35, 1.12],
    [-1.86, 1.2],
    [-0.96, 1.27],
    [0.2, 1.29],
    [1.84, 1.3],
    [TAIL_Z, 1.28],
  ],
  belt: [
    [NOSE_Z, 1.1],
    [-2.35, 1.2],
    [-1.86, 1.27],
    [-0.96, 1.34],
    [0.2, 1.36],
    [1.84, 1.37],
    [TAIL_Z, 1.36],
  ],
  // Well under the screen's edge, so a broad pillar of paint frames the screen, as a truck's does.
  windowTop: [
    [-0.86, 1.39],
    [-0.62, 1.54],
    [-0.3, 1.76],
    [0.0, 1.82],
    [0.5, 1.84],
    [0.94, 1.83],
    [0.98, 1.78],
  ],
  windowZ: [-0.86, 0.98],
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
  mirror: { z: -0.72, h: 1.52, x: 0.92 },
  rearPlateH: 0.98,
  rearSeats: true,
  cabinEndZ: CAB_END_Z - 0.06,
  decals: [
    // The rear plate on the tailgate; the front one is on the bumper, among the blocks.
    ...plates(0.98, 0.735).filter(({ on }) => on === "rear"),
    ...handles([-0.12, 0.8], 1.3),
    ...stripes,
    // Each lamp's two bars in a dark housing at the face's upper corners, which stands just off the face so the bars
    // can stand off it in turn.
    { on: "front", at: [0.66, 1.1], size: [0.42, 0.11], surface: "trim", mirror: true, cells: [5, 1], liftM: 0.006 },
    { on: "front", at: [0.65, 1.124], size: [0.38, 0.04], surface: "lensHead", mirror: true, cells: [8, 1], liftM: 0.012 },
    { on: "front", at: [0.69, 1.074], size: [0.3, 0.03], surface: "lensHead", mirror: true, cells: [5, 1], liftM: 0.012 },
    // The tailgate's corners: the same two bars, red.
    { on: "rear", at: [0.74, 1.22], size: [0.4, 0.12], surface: "trim", mirror: true, cells: [4, 1], liftM: 0.006 },
    { on: "rear", at: [0.73, 1.245], size: [0.36, 0.038], surface: "lensTail", mirror: true, cells: [5, 1], liftM: 0.012 },
    { on: "rear", at: [0.77, 1.195], size: [0.28, 0.03], surface: "lensTail", mirror: true, cells: [4, 1], liftM: 0.012 },
    { ...reversing(0.58, 1.195), size: [0.08, 0.03] },
    // The tailgate's handle in a dark recess under its top edge.
    { on: "rear", at: [0, 1.3], size: [0.3, 0.05], surface: "trim", cells: [3, 1], fine: true },
    // Vents either side of the hood's spine, where the heat leaves the twin turbos.
    ...louvres({ x: 0.46, z: -2.2, long: 0.5, wide: 0.24, count: 5 }).map((slat) => ({ ...slat, liftM: 0.026 })),
    // A dark vent behind each front wheel, where the arch's air leaves.
    { ...sideIntake({ z: -1.12, h: 1.1, long: 0.16, tall: 0.12 }), cells: [2, 2], liftM: 0.016, fine: true },
  ],
  blocks: [
    // The spine of the body's colour down the middle of the face, splitting the intake.
    { at: [0, 0.92, NOSE_Z - 0.03], size: [0.16, 0.25, 0.08], surface: "paint", taper: [0.85, 1] },
    // A slat of dark metal across each half of the intake.
    { at: [0.46, 0.92, NOSE_Z - 0.008], size: [0.6, 0.016, 0.02], surface: "rimDark", mirror: true, fine: true },
    ...steel,
    ...lightBar,
    { at: [0, 0.745, NOSE_Z - 0.088], size: [0.36, 0.085, 0.012], surface: "plate", fine: true },
    // Red tow hooks through the front bumper.
    { at: [0.56, 0.74, NOSE_Z - 0.1], size: [0.05, 0.08, 0.06], surface: "caliper", mirror: true, fine: true },
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    silhouette: [
      // The nose runs one way along the truck from its foot up, so no strip of the face folds back over another.
      // The intake runs down behind the bumper to the foot.
      { z: NOSE_Z + 0.06, h: 0.62, band: "mouth" },
      { z: NOSE_Z, h: 0.75, band: "mouth" },
      { z: NOSE_Z + 0.003, h: 1.04 },
      { z: NOSE_Z + 0.012, h: 1.2 },
      // The hood, then the screen and the roof, each as one fair line.
      ...faired(
        [
          [NOSE_Z + 0.05, 1.25],
          [-2.25, 1.3],
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
      { z: TAIL_Z - 0.03, h: BED_H - 0.01 },
      { z: TAIL_Z, h: 0.72 },
      { z: TAIL_Z - 0.08, h: 0.6 },
    ],
    sill: [
      [NOSE_Z, 0.6],
      [-2.3, 0.56],
      [0, 0.54],
      [2.3, 0.57],
      [TAIL_Z, 0.6],
    ],
    crown: [
      [NOSE_Z, 0.05],
      [-2.2, 0.09],
      [-1.4, 0.09],
      [-1.0, 0.04],
      [0, 0.04],
      [1.0, 0.04],
      [1.1, 0.01],
      [TAIL_Z, 0.01],
    ],
    halfWidth: [
      [NOSE_Z, 0.93],
      [-2.4, 0.99],
      [-1.86, 1.0],
      [-0.6, 0.985],
      [0.6, 0.985],
      [1.84, 1.0],
      [2.4, 0.995],
      [TAIL_Z, 0.97],
    ],
    cornerPullM: [0.08, 0.05],
    hoodSeamZ: [-2.7, -1.08],
    archLipM: 0.09,
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
  // A modern truck's cab: one digital cluster, a chunky round wheel, a lever on the console, a big centre screen, and a
  // grab handle up each pillar for the crests, all in Ridgeway's ember on dark.
  interior: {
    gauges: "digital",
    wheel: "round",
    shifter: "lever",
    seats: "sport",
    screen: true,
    grabHandles: true,
    // The tall dash stands close behind the wheel: the readouts sit in its opening over the hub.
    clusterSight: 0.62,
    speedAside: true,
    // A pale headliner, so the broad pillars read lit and shaded rather than as dark slabs across the corners.
    colours: { dash: "car-cabin-carbon", accent: "car-cabin-ridgeway", glow: "car-cabin-glow-red" },
  },
};
