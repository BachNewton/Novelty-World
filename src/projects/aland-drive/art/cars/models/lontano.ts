import { ROWS, type Band, type Decal, type Strut } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { louvres } from "../parts";
import { bodyOf, driven, faired, handles, plates, type Shape } from "../recipe";

const LONTANO = driven("lontano");
const { sill, sillTop, belt, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  sill: [{ surface: "cladding", from: sill, to: sillTop }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  screen: [{ surface: "glass", from: rail, to: ALL }],
  rearGlass: [{ surface: "glass", from: rail, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
};

const NOSE_Z = -2.245;
const TAIL_Z = 2.19;

/**
 * Castellane's lamps in pairs, as its 1960s cars wore them: two round lamps side by side in each wing, under a clear
 * cover in a dark, chrome-edged hollow, and at the tail two round lamps a side. The Altura of the 1990s carried the
 * same pairs as small square lamps at each end of a dark visor.
 */
const lampPair = (on: "front" | "rear", x: readonly [number, number], h: number, size: number, surface: Decal["surface"], hollow: readonly [number, number] | null): Decal[] => {
  const middle = (x[0] + x[1]) / 2;
  return [
    ...(hollow
      ? [
          { on, at: [middle, h], size: [hollow[0] + 0.012, hollow[1] + 0.012], surface: "rim", mirror: true, round: true, liftM: 0.012 } satisfies Decal,
          { on, at: [middle, h], size: hollow, surface: "rimDark", mirror: true, round: true, liftM: 0.018 } satisfies Decal,
        ]
      : []),
    ...x.flatMap((across): Decal[] => [
      { on, at: [across, h], size: [size + 0.022, size + 0.022], surface: "rim", mirror: true, round: true, liftM: hollow ? 0.024 : 0.012 },
      { on, at: [across, h], size: [size, size], surface, mirror: true, round: true, liftM: hollow ? 0.03 : 0.018 },
    ]),
  ];
};

/** A small oval mouth low in the nose, edged in chrome, with fine bright bars across it. */
const GRILLE = { h: 0.355, size: [0.5, 0.17] as const };
const grille = (): Decal[] => {
  const [wide, tall] = GRILLE.size;
  const bars = [-0.045, 0, 0.045].map((up): Decal => {
    const across = wide * Math.sqrt(1 - ((2 * up) / tall) ** 2) - 0.05;
    return { on: "front", at: [0, GRILLE.h + up], size: [across, 0.008], surface: "rim", cells: [6, 1], liftM: 0.03, fine: true };
  });
  return [
    { on: "front", at: [0, GRILLE.h], size: [wide + 0.03, tall + 0.03], surface: "rim", round: true, liftM: 0.012 },
    { on: "front", at: [0, GRILLE.h], size: [wide, tall], surface: "grille", round: true, liftM: 0.02 },
    ...bars,
  ];
};

/** Three slots behind each front wheel, letting the engine bay's heat out, each in a thin chrome frame. */
const sideVents = (): Decal[] =>
  [-0.66, -0.58, -0.5].flatMap((z, at): Decal[] => {
    const tall = 0.15 - at * 0.025;
    return [
      { on: "side", at: [z, 0.52], size: [0.055, tall + 0.02], surface: "rim", mirror: true, cells: [1, 2], liftM: 0.012, fine: true },
      { on: "side", at: [z, 0.52], size: [0.04, tall], surface: "grille", mirror: true, cells: [1, 2], liftM: 0.018 },
    ];
  });

/** Chrome bumperettes either side of the mouth and at the tail's corners: thin blades following the body round. */
const BUMPERETTES: readonly Strut[] = [
  {
    path: [
      [0.27, 0.275, NOSE_Z - 0.03],
      [0.4, 0.275, NOSE_Z - 0.02],
      [0.52, 0.28, NOSE_Z + 0.02],
      [0.6, 0.29, NOSE_Z + 0.09],
      [0.64, 0.3, NOSE_Z + 0.17],
    ],
    radius: 0.018,
    surface: "rim",
    mirror: true,
    fine: true,
  },
  {
    path: [
      [0.3, 0.37, TAIL_Z - 0.01],
      [0.46, 0.37, TAIL_Z - 0.055],
      [0.58, 0.375, TAIL_Z - 0.115],
      [0.66, 0.38, TAIL_Z - 0.19],
      [0.71, 0.385, TAIL_Z - 0.28],
    ],
    radius: 0.018,
    surface: "rim",
    mirror: true,
    fine: true,
  },
];

/**
 * A 1960s front-engined V12 grand tourer: a long bonnet vented either side over the V12, the wings standing above it
 * with the lamps let into their noses, a small glasshouse on thin pillars set well back, a fastback falling to a short
 * tail cut off under a ducktail lip, and the hips swelling over the rear wheels.
 */
const shape: Shape = {
  trackM: LONTANO.trackM,
  axleZ: LONTANO.axleZ,
  wheelRadiusM: LONTANO.wheelRadiusM,
  tyreWidthM: 0.2,
  noseZ: NOSE_Z,
  tailZ: TAIL_Z,
  halfWidth: 0.87,
  sillH: 0.15,
  flareM: 0.035,
  archClearM: 0.04,
  grilleH: 0.42,
  lampH: [0.46, 0.58],
  hoodLipH: 0.55,
  hoodH: 0.76,
  cowl: [-0.22, 0.86],
  header: [0.3, 1.16],
  roof: [0.62, 1.2],
  roofEnd: [0.95, 1.16],
  shoulder: [
    [NOSE_Z, 0.5],
    [-1.9, 0.64],
    [-1.2, 0.715],
    [-0.5, 0.68],
    [0.3, 0.685],
    [1.22, 0.75],
    [1.9, 0.745],
    [TAIL_Z, 0.72],
  ],
  belt: [
    [NOSE_Z, 0.535],
    [-1.9, 0.675],
    [-1.2, 0.75],
    [-0.5, 0.715],
    [0.3, 0.72],
    [1.22, 0.785],
    [1.9, 0.78],
    [TAIL_Z, 0.755],
  ],
  windowTop: [
    [-0.2, 0.8],
    [0.05, 0.98],
    [0.32, 1.1],
    [0.62, 1.14],
    [0.95, 1.1],
    [1.25, 0.98],
    [1.45, 0.88],
  ],
  windowZ: [-0.2, 1.45],
  railWidth: [
    [NOSE_Z, 0.42],
    [-1.6, 0.58],
    [-0.22, 0.66],
    [0.3, 0.56],
    [0.62, 0.52],
    [1.2, 0.58],
    [1.8, 0.6],
    [TAIL_Z, 0.52],
  ],
  tail: [],
  seams: [-0.15, 0.95],
  pillars: [[0.9, 0.95]],
  mirror: { z: -0.32, h: 0.86, x: 0.76 },
  rearPlateH: 0.47,
  rearSeats: false,
  // The tail's corners rounded well back, as a 1960s body's are, rather than squared off under the lip.
  cornerPullM: [0.2, 0.2],
  cabinEndZ: 1.3,
  seat: "seatTan",
  decals: [
    ...plates(0.47, 0.24),
    ...handles([0.78], 0.73),
    ...lampPair("front", [0.44, 0.6], 0.53, 0.12, "lensHead", [0.36, 0.17]),
    // A small amber indicator under each pair of lamps.
    { on: "front", at: [0.58, 0.4], size: [0.07, 0.035], surface: "lensAmber", mirror: true, round: true, liftM: 0.014 },
    ...lampPair("rear", [0.5, 0.66], 0.62, 0.11, "lensTail", null),
    { on: "rear", at: [0.36, 0.42], size: [0.08, 0.05], surface: "lensReverse", mirror: true, round: true, liftM: 0.014, fine: true },
    ...grille(),
    ...sideVents(),
    // A chrome quick-release filler on the left haunch, as a racer for the road wore it.
    { on: "top", at: [-0.66, 1.62], size: [0.1, 0.1], surface: "rim", round: true, liftM: 0.014, fine: true },
    // The vents either side of the bonnet's middle, letting the heat out of the V12's bay.
    ...louvres({ x: 0.36, z: -1.35, long: 0.36, wide: 0.13, count: 5, liftM: 0.016 }),
  ],
  extra: {
    bands: BANDS,
    silhouette: [
      // Each end runs one way along the car, so its side walls never fold back over each other at the pulled corners.
      { z: NOSE_Z, h: 0.2 },
      { z: NOSE_Z + 0.005, h: 0.3 },
      { z: NOSE_Z + 0.013, h: 0.42 },
      { z: NOSE_Z + 0.03, h: 0.5 },
      { z: NOSE_Z + 0.06, h: 0.545 },
      // The bonnet, then the screen, roof, fastback and tail, each as one fair line.
      ...faired(
        [
          [NOSE_Z + 0.06, 0.545],
          [-1.9, 0.635],
          [-1.2, 0.755],
          [-0.6, 0.825],
          [-0.3, 0.848],
        ],
        [[NOSE_Z + 0.06, undefined]],
      ),
      { z: -0.3, h: 0.848, band: "cowl" },
      ...faired(
        [
          [-0.22, 0.86],
          [0.05, 1.03],
          [0.3, 1.16],
          [0.62, 1.2],
          [0.95, 1.165],
          [1.3, 1.075],
          [1.7, 0.975],
          [2.1, 0.93],
        ],
        [
          [-0.22, "screen"],
          [0.3, undefined],
          [0.95, "rearGlass"],
          [1.68, undefined],
        ],
      ),
      // The ducktail's lip, then the tail falling to its foot.
      { z: 2.13, h: 0.925, band: "gap" },
      { z: 2.14, h: 0.9 },
      { z: 2.158, h: 0.72 },
      { z: 2.172, h: 0.5 },
      { z: 2.183, h: 0.32 },
      { z: TAIL_Z, h: 0.22 },
    ],
    crown: [
      [NOSE_Z, -0.025],
      [-1.7, -0.045],
      [-1.0, -0.035],
      [-0.45, -0.01],
      [-0.15, 0.025],
      [0.6, 0.05],
      [1.22, 0.0],
      [1.8, -0.02],
      [TAIL_Z, 0.0],
    ],
    shelf: [
      [NOSE_Z, 0],
      [-0.5, 0],
      [-0.1, 0.05],
      [0.6, 0.1],
      [1.22, 0.17],
      [1.8, 0.1],
      [TAIL_Z, 0.03],
    ],
    halfWidth: [
      [NOSE_Z, 0.66],
      [-2.0, 0.8],
      [-1.2, 0.86],
      [-0.45, 0.835],
      [0.4, 0.845],
      [1.22, 0.87],
      [1.9, 0.83],
      [TAIL_Z, 0.72],
    ],
    hoodSeamZ: [-2.05, -0.36],
    cleanEnds: true,
    scoop: [
      [-0.9, 0],
      [-0.4, 0.012],
      [0.4, 0.016],
      [0.85, 0],
    ],
    exhausts: { x: [-0.5, -0.42, 0.42, 0.5], h: 0.24, z: TAIL_Z + 0.02, radius: 0.032, open: true },
    struts: BUMPERETTES,
  },
};

export const lontano: CarSpec = {
  id: LONTANO.id,
  name: LONTANO.name,
  ride: LONTANO.ride,
  paint: "car-paint-garnet",
  paints: [
    paint("car-paint-garnet", "metallic"),
    paint("car-paint-silver", "metallic"),
    paint("car-paint-powder-blue"),
    paint("car-paint-racing-green", "metallic"),
    paint("car-paint-cream"),
    paint("car-paint-midnight", "metallic"),
  ],
  body: bodyOf(shape),
  wheel: { radiusM: LONTANO.wheelRadiusM, widthM: 0.2, rimShare: 0.66, spokes: 20, twinSpokes: false, style: "wire" },
  shadowHalf: [0.87, 2.22],
  /**
   * A 1960s cockpit: a row of chrome-ringed ivory dials in a dash painted the body's colour, a big thin-rimmed wooden
   * wheel, a gated lever, tan leather buckets, and an amber glow after dark.
   */
  interior: {
    gauges: "classic",
    wheel: "classic",
    shifter: "lever",
    seats: "bucket",
    screen: false,
    paintedDash: true,
    lightDials: true,
    colours: { dash: "car-cabin-dash", trim: "car-cabin-trim-tan", insert: "car-cabin-wood", headliner: "car-cabin-headliner-dark", accent: "car-cabin-metal", glow: "car-cabin-glow-amber" },
    turnsToLock: 1.6,
    // The seat set low, so the headliner is a band over the road and not a slab, and the dials sighted high in the
    // wheel's opening, clear of its spokes.
    eye: [0, -0.045, 0],
    clusterSight: 0.75,
  },
};
