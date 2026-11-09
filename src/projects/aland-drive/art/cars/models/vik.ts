import { ROWS, type Band, type Decal } from "../body";
import type { CarSpec } from "../build";
import { paint } from "../paints";
import { bodyOf, driven, faired, handles, roundLamps, type Shape } from "../recipe";

const VIK = driven("vik");
const { sill, belt, windowBase, rail, centre } = ROWS;
const ALL = centre + 1;

/*
 * Every band starts and ends on a row the far model has too (`build.ts`, `FAR`), so the far version's dark shapes are
 * the near one's.
 */
const BANDS: Readonly<Record<string, readonly Band[]>> = {
  /** A slim chrome bumper at each end. */
  chrome: [{ surface: "rim", from: sill, to: ALL }],
  /** The oval mouth, in the middle of the nose between the lamps. */
  mouth: [{ surface: "grille", from: rail, to: ALL }],
  cowl: [{ surface: "trim", from: belt, to: ALL }],
  /** The upright screen in its frame, its back glass too down to the scuttle. */
  screen: [{ surface: "glass", from: windowBase, to: ALL }],
  gap: [{ surface: "gap", from: belt, to: ALL }],
  tailDark: [{ surface: "trim", from: belt, to: ALL }],
  tailBar: [{ surface: "lensTail", from: windowBase, to: ALL }],
};

/**
 * Tärna's signature as the maker first drew it, in the 1960s: the bracket across the nose in chrome, a bar over the
 * oval mouth turned down at its ends, and on the tail already in light, a slim bar the width of the deck turned down
 * into a fang at each end.
 */
const bracket: Decal[] = [
  { on: "front", at: [0, 0.445], size: [0.5, 0.018], surface: "rim", cells: [6, 1], liftM: 0.014 },
  { on: "front", at: [0.245, 0.41], size: [0.018, 0.07], surface: "rim", mirror: true, cells: [1, 2], liftM: 0.014 },
];
const tailFangs: Decal[] = [
  { on: "rear", at: [0.47, 0.645], size: [0.05, 0.09], surface: "trim", mirror: true, cells: [2, 4], liftM: 0.008, fine: true },
  { on: "rear", at: [0.475, 0.64], size: [0.026, 0.075], surface: "lensTail", mirror: true, cells: [1, 4], liftM: 0.016 },
];

/**
 * Tärna's first car, a tiny open roadster from the 1960s: a long low bonnet between fenders that stand above it, round
 * lamps in the fenders' fronts, an upright screen, a cockpit cut into the body behind it and a short rounded deck, on
 * skinny tyres and wire wheels.
 */
const shape: Shape = {
  trackM: VIK.trackM,
  axleZ: VIK.axleZ,
  wheelRadiusM: VIK.wheelRadiusM,
  tyreWidthM: 0.165,
  noseZ: -1.975,
  tailZ: 1.975,
  halfWidth: 0.775,
  sillH: 0.17,
  flareM: 0.045,
  archClearM: 0.05,
  grilleH: 0.48,
  lampH: [0.5, 0.55],
  hoodLipH: 0.6,
  hoodH: 0.7,
  cowl: [-0.3, 0.76],
  header: [-0.12, 1.1],
  roof: [-0.1, 0.8],
  roofEnd: [-0.06, 0.8],
  shoulder: [
    [-1.975, 0.44],
    [-1.6, 0.54],
    [-1.15, 0.6],
    [-0.3, 0.64],
    [0.5, 0.66],
    [1.15, 0.66],
    [1.975, 0.56],
  ],
  belt: [
    [-1.975, 0.5],
    [-1.6, 0.6],
    [-1.15, 0.66],
    [-0.3, 0.7],
    [0.5, 0.72],
    [1.15, 0.72],
    [1.975, 0.62],
  ],
  windowTop: [
    [-9, 0],
    [9, 0],
  ],
  windowZ: [0, 0],
  railWidth: [
    [-1.975, 0.4],
    [-1.15, 0.55],
    [-0.3, 0.6],
    [0.4, 0.62],
    [1.15, 0.6],
    [1.975, 0.55],
  ],
  tail: [],
  seams: [-0.22, 0.62],
  pillars: [],
  mirror: { z: -0.45, h: 0.8, x: 0.62 },
  rearPlateH: 0.5,
  rearSeats: false,
  decals: [
    { on: "rear", at: [0, 0.5], size: [0.38, 0.09], surface: "plate", cells: [8, 2], liftM: 0.008, fine: true },
    { on: "front", at: [0, 0.3], size: [0.36, 0.085], surface: "plate", cells: [8, 2], liftM: 0.018, fine: true },
    ...handles([0.45], 0.66),
    ...roundLamps(0.5, 0.52, 0.13),
    ...bracket,
    ...tailFangs,
  ],
  blocks: [
    // The screen's chrome frame along its top.
    { at: [0, 1.105, -0.12], size: [1.0, 0.016, 0.02], surface: "rim", fine: true },
  ],
  extra: {
    bands: BANDS,
    cleanEnds: true,
    bedFloorH: 0.31,
    bedSurface: "interior",
    silhouette: [
      { z: -1.973, h: 0.26, band: "chrome" },
      { z: -1.97, h: 0.32 },
      { z: -1.965, h: 0.34, band: "mouth" },
      { z: -1.955, h: 0.47 },
      ...faired(
        [
          [-1.945, 0.53],
          [-1.7, 0.62],
          [-1.15, 0.69],
          [-0.36, 0.74],
        ],
        [[-1.945, undefined]],
      ),
      { z: -0.36, h: 0.74, band: "cowl" },
      { z: -0.3, h: 0.76, band: "screen" },
      { z: -0.12, h: 1.1, band: "screen" },
      // The scuttle's rim, and the cockpit open from it back to behind the seats.
      { z: -0.06, h: 0.8, bed: true },
      { z: 0.6, h: 0.78, bed: true },
      ...faired(
        [
          [1.06, 0.8],
          [1.3, 0.84],
          [1.6, 0.8],
          [1.9, 0.73],
        ],
        [[1.06, undefined]],
      ),
      { z: 1.9, h: 0.73, band: "gap" },
      { z: 1.91, h: 0.71, band: "tailDark" },
      { z: 1.92, h: 0.69, band: "tailBar" },
      { z: 1.935, h: 0.655, band: "tailDark" },
      { z: 1.945, h: 0.63 },
      { z: 1.965, h: 0.45 },
      { z: 1.973, h: 0.4, band: "chrome" },
      { z: 1.975, h: 0.33 },
    ],
    sill: [
      [-1.975, 0.2],
      [-1.6, 0.18],
      [0, 0.17],
      [1.6, 0.18],
      [1.975, 0.21],
    ],
    crown: [
      [-1.975, 0.0],
      [-1.5, -0.05],
      [-1.15, -0.07],
      [-0.6, -0.02],
      [-0.3, 0.02],
      [0.5, 0.02],
      [1.15, -0.06],
      [1.6, -0.05],
      [1.975, 0.0],
    ],
    halfWidth: [
      [-1.975, 0.55],
      [-1.75, 0.7],
      [-1.15, 0.775],
      [-0.6, 0.72],
      [0, 0.73],
      [0.6, 0.74],
      [1.15, 0.775],
      [1.7, 0.73],
      [1.975, 0.6],
    ],
    hoodSeamZ: [-1.85, -0.42],
    cornerPullM: [0.22, 0.16],
    exhausts: { x: [0.4], h: 0.27, z: 1.98, radius: 0.03, open: true },
    cabin: { dashZ: -0.28, dashH: 0.72, floorH: 0.31, seatZ: 0.66, endZ: 1.02, seatX: VIK.trackM * 0.23, seatSurface: "seat" },
  },
};

export const vik: CarSpec = {
  id: VIK.id,
  name: VIK.name,
  ride: VIK.ride,
  paint: "car-paint-oxblood",
  paints: [
    paint("car-paint-oxblood"),
    paint("car-paint-racing-green"),
    paint("car-paint-cream"),
    paint("car-paint-powder-blue"),
    paint("car-paint-signal-red"),
    paint("car-paint-black"),
  ],
  body: bodyOf(shape),
  /** An old roadster's cockpit: chrome-ringed ivory dials set in a dash in the body's colour, a big thin-rimmed wooden wheel, tan seats. */
  interior: { gauges: "classic", wheel: "classic", screen: false, paintedDash: true, seats: "comfort", colours: { glow: "car-cabin-glow-amber" } },
  wheel: { radiusM: VIK.wheelRadiusM, widthM: 0.165, rimShare: 0.7, spokes: 12, twinSpokes: false, style: "wire" },
  shadowHalf: [0.775, 1.975],
};
