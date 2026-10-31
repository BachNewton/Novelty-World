import { curve, smoothstep, type Key } from "./curve";
import { SoupBuilder, type Point, type Soup, type Surface } from "./mesh";

/*
 * A car's shell, lofted from its profiles. The silhouette is a line along the
 * car's centre from the bottom of the nose over the roof to the bottom of the
 * tail, and every point on it is the top of one rib. A rib is the same twelve
 * rows from the sill up the side, over the roof edge and in to the centre, each
 * row read off its own curve along the car and held under the silhouette, so a
 * hood, a tailgate and a bumper come out of one rule. The arches are the sill
 * row following a circle, and glass, lamps and trim are which rows and which
 * stretch of silhouette a face lies in, so they sit in the surface and cost no
 * extra faces.
 *
 * Heights are metres above the road, z runs from the nose (-) to the tail (+).
 */

export const ROWS = {
  sill: 0,
  sillTop: 1,
  lower: 2,
  mid: 3,
  shoulder: 4,
  belt: 5,
  windowBase: 6,
  windowTop: 7,
  rail: 8,
  roofOuter: 9,
  roofInner: 10,
  centre: 11,
} as const;

/** A stretch of the silhouette painted across some rows: `from` up to but not including `to`. */
export interface Band {
  surface: Surface;
  from: number;
  to: number;
}

export interface SilhouettePoint {
  z: number;
  h: number;
  /** The band on the stretch from here to the next point. */
  band?: string;
  /** From here to the next point the top is open: a pickup's bed, or a convertible's cockpit. */
  bed?: boolean;
  /** Only the hero's: a far model needs no more than the firm points. */
  fine?: boolean;
}

export type DecalFace = "rear" | "front" | "side" | "top";

export interface Decal {
  on: DecalFace;
  /** rear, front: x and height. side: z and height. top: x and z. */
  at: readonly [a: number, b: number];
  size: readonly [a: number, b: number];
  surface: Surface;
  /** Also on the other side of the car. */
  mirror?: boolean;
  cells?: readonly [a: number, b: number];
  liftM?: number;
  /** A far model leaves it out. */
  fine?: boolean;
  /** A disc rather than a rectangle, `size` its width and height. */
  round?: boolean;
}

/** A box stuck on a car, narrowing to `taper` of its size along z. */
export interface Block {
  at: readonly [x: number, h: number, z: number];
  size: readonly [wide: number, tall: number, long: number];
  surface: Surface;
  mirror?: boolean;
  /** The far end's width and height as a share of the near end's. */
  taper?: readonly [wide: number, tall: number];
  fine?: boolean;
}

/** Where the inside of the car is. */
export interface Cabin {
  dashZ: number;
  dashH: number;
  floorH: number;
  seatZ: number;
  rearSeatZ?: number;
  /** Behind this is bulkhead. */
  endZ: number;
  seatX: number;
  seatSurface: Surface;
}

export interface BodySpec {
  /** Half the track and axle places decide where the arches are. */
  trackM: number;
  axleZ: readonly [front: number, rear: number];
  wheelRadiusM: number;
  tyreWidthM: number;
  archClearM: number;
  flareM: number;

  silhouette: readonly SilhouettePoint[];
  bands: Readonly<Record<string, readonly Band[]>>;
  sill: readonly Key[];
  shoulder: readonly Key[];
  belt: readonly Key[];
  /** The top of the side glass, between where the glass starts and ends. */
  windowTop: readonly Key[];
  windowZ: readonly [from: number, to: number];
  /** How far the roof's edge sits below the centre line. */
  crown: readonly Key[];
  halfWidth: readonly Key[];
  railWidth: readonly Key[];
  /** How far the corners of the nose and tail pull back from the ends, and over what length. */
  cornerPullM: readonly [front: number, rear: number];
  cornerReachM: number;

  /** Thin dark gaps at door edges. */
  seams: readonly number[];
  /** Stretches of side glass that are pillar instead. */
  pillars: readonly (readonly [from: number, to: number])[];
  /** What the band between window top and roof edge is. */
  pillarSurface: Surface;
  sillSurface: Surface;
  /** What the belt strip under the side glass is. */
  beltSurface: Surface;

  mirror: { z: number; h: number; x: number };
  decals: readonly Decal[];
  wing?: { z: number; h: number; halfWidth: number; chord: number; rise: number };
  exhausts?: { x: readonly number[]; h: number; z: number; radius: number };
  roofBars?: { from: number; to: number; x: number; rise: number };
  bedFloorH?: number;
  bedSurface?: Surface;
  blocks?: readonly Block[];
  cabin?: Cabin;
  /** Where the hood's shut lines run, from and to. */
  hoodSeamZ?: readonly [from: number, to: number];
}

export interface BodyDetail {
  maxStepM: number;
  archSteps: number;
  rows: readonly number[];
  seams: boolean;
  fine: boolean;
  creaseDeg: number;
  /** A cabin to see through the glass to. */
  cabin: boolean;
}

interface Station extends SilhouettePoint {
  gap?: boolean;
}

interface Curves {
  sill: (z: number) => number;
  shoulder: (z: number) => number;
  belt: (z: number) => number;
  windowTop: (z: number) => number;
  crown: (z: number) => number;
  halfWidth: (z: number) => number;
  railWidth: (z: number) => number;
}

/** The rows that are a thin strip of gap: under the doors, and along the hood. */
const SEAM_ROWS = { door: 1, hood: 7.93 } as const;
const SEAM_HALF_M = 0.006;
const MERGE_M = 0.012;

function archTop(spec: BodySpec, z: number): number {
  const radius = spec.wheelRadiusM + spec.archClearM;
  return Math.max(...spec.axleZ.map((axle) => (Math.abs(z - axle) < radius ? spec.wheelRadiusM + Math.sqrt(radius * radius - (z - axle) ** 2) : 0)));
}

function flareAt(spec: BodySpec, z: number) {
  const reach = (spec.wheelRadiusM + spec.archClearM) * 1.05;
  return spec.flareM * Math.max(...spec.axleZ.map((axle) => Math.exp(-(((z - axle) / reach) ** 4))));
}

/** Where a station needs to be: where an arch bends, a seam or a pillar starts, and often enough to stay curved. */
function stationsOf(spec: BodySpec, curves: Curves, detail: BodyDetail): Station[] {
  const wanted: { z: number; gapTo?: number }[] = [];
  const radius = spec.wheelRadiusM + spec.archClearM;
  for (const axle of spec.axleZ) {
    const low = curves.sill(axle);
    const startAngle = Math.asin(Math.max(-1, (low - spec.wheelRadiusM) / radius));
    for (let step = 0; step <= detail.archSteps; step++) {
      const angle = startAngle + ((Math.PI - 2 * startAngle) * step) / detail.archSteps;
      wanted.push({ z: axle + Math.cos(angle) * radius });
    }
  }
  if (detail.seams) for (const seam of spec.seams) wanted.push({ z: seam - SEAM_HALF_M, gapTo: seam + SEAM_HALF_M }, { z: seam + SEAM_HALF_M });
  for (const [from, to] of spec.pillars) wanted.push({ z: from }, { z: to });

  const stations: Station[] = [];
  const path = spec.silhouette.filter((point) => detail.fine || !point.fine);
  for (let at = 0; at + 1 < path.length; at++) {
    const [from, to] = [path[at], path[at + 1]];
    const [low, high] = from.z < to.z ? [from.z, to.z] : [to.z, from.z];
    const inner = wanted
      .filter(({ z }) => z > low + MERGE_M && z < high - MERGE_M)
      .map(({ z }) => (z - from.z) / (to.z - from.z))
      .sort((a, b) => a - b);
    const ties = [0, ...inner, 1];
    const shares: number[] = [];
    ties.slice(1).forEach((tie, index) => {
      const length = Math.hypot(to.z - from.z, to.h - from.h) * (tie - ties[index]);
      const pieces = Math.max(1, Math.ceil(length / detail.maxStepM));
      for (let piece = 0; piece < pieces; piece++) shares.push(ties[index] + ((tie - ties[index]) * piece) / pieces);
    });
    for (const share of shares) {
      const z = from.z + (to.z - from.z) * share;
      const gapped = wanted.find((seam) => seam.gapTo !== undefined && Math.abs(seam.z - z) < 1e-6);
      stations.push({ z, h: from.h + (to.h - from.h) * share, band: from.band, bed: from.bed, gap: gapped !== undefined });
    }
  }
  stations.push({ ...path[path.length - 1], band: undefined, bed: false });
  return stations;
}

/** A row between the rib's own rows, on a curve through its neighbours, so a hero's panels round off instead of folding. */
function rowAt(rib: readonly (readonly [number, number])[], row: number): [number, number] {
  const low = Math.floor(row);
  const share = row - low;
  if (share === 0) return [rib[low][0], rib[low][1]];
  const [p0, p1, p2, p3] = [rib[Math.max(low - 1, 0)], rib[low], rib[low + 1], rib[Math.min(low + 2, rib.length - 1)]];
  const along = (axis: 0 | 1) => {
    const [a, b, c, d] = [p0[axis], p1[axis], p2[axis], p3[axis]];
    const smooth = 0.5 * (2 * b + (c - a) * share + (2 * a - 5 * b + 4 * c - d) * share ** 2 + (3 * b - a - 3 * c + d) * share ** 3);
    return Math.min(Math.max(b, c), Math.max(Math.min(b, c), smooth));
  };
  return [along(0), along(1)];
}

function ribOf(spec: BodySpec, curves: Curves, station: Station, sideWall: boolean): [x: number, h: number][] {
  const { z, h: top } = station;
  const lowest = curves.sill(z);
  const sill = Math.max(lowest, archTop(spec, z));
  const width = curves.halfWidth(z);
  const flare = flareAt(spec, z);
  const shoulder = Math.max(curves.shoulder(z), sill + 0.05);
  const sillTop = Math.max(lowest + 0.08, sill + 0.012);
  const lower = Math.max(sillTop + (shoulder - sillTop) * 0.3, sill + 0.024);
  const mid = Math.max(sillTop + (shoulder - sillTop) * 0.68, sill + 0.036);
  const belt = Math.max(curves.belt(z), shoulder + 0.01);

  const beltX = width - 0.018 + flare * 0.35;
  const baseX = beltX - 0.014;
  const railX = curves.railWidth(z);
  const railH = top - curves.crown(z);
  const baseH = Math.min(belt + 0.012, railH);
  const hasWindow = z > spec.windowZ[0] && z < spec.windowZ[1];
  const windowH = hasWindow ? Math.min(Math.max(curves.windowTop(z), baseH), railH) : baseH;
  const windowShare = railH > baseH ? (windowH - baseH) / (railH - baseH) : 0;

  const roofOuter: [number, number] = [railX * 0.64, top - curves.crown(z) * 0.42];
  const roofInner: [number, number] = [railX * 0.3, top - curves.crown(z) * 0.1];
  const rib: [number, number][] = [
    [width - 0.04 + flare * 0.7, sill],
    [width - 0.014 + flare, sillTop],
    [width - 0.004 + flare, lower],
    [width + flare, mid],
    [width - 0.002 + flare * 0.75, shoulder],
    [beltX, belt],
    [baseX, baseH],
    [baseX + (railX - baseX) * windowShare, windowH],
    [railX, railH],
    roofOuter,
    roofInner,
    [0, top],
  ];
  if (station.bed && spec.bedFloorH !== undefined) {
    const inner = width - 0.09;
    rib[ROWS.windowBase] = [width - 0.03, top];
    rib[ROWS.windowTop] = [width - 0.06, top];
    rib[ROWS.rail] = [inner, top];
    rib[ROWS.roofOuter] = [inner - 0.012, spec.bedFloorH];
    rib[ROWS.roofInner] = [inner * 0.5, spec.bedFloorH];
    rib[ROWS.centre] = [0, spec.bedFloorH];
    return rib;
  }
  if (sideWall) return rib;
  return rib.map(([x, h]) => [x, Math.min(h, top)]);
}

function pulledZ(spec: BodySpec, z: number, x: number, width: number, zFront: number, zRear: number) {
  const fromNose = 1 - smoothstep(zFront, zFront + spec.cornerReachM, z);
  const fromTail = smoothstep(zRear - spec.cornerReachM, zRear, z);
  const across = (x / width) ** 2;
  return z + (fromNose * spec.cornerPullM[0] - fromTail * spec.cornerPullM[1]) * across;
}

function addDecal(builder: SoupBuilder, ground: number, decal: Decal) {
  const { on, at, size, surface, cells = [1, 1], liftM = 0.008 } = decal;
  const facing: Point = on === "rear" ? [0, 0, 1] : on === "front" ? [0, 0, -1] : on === "side" ? [1, 0, 0] : [0, 1, 0];
  const place = (a: number, b: number): Point => {
    if (on === "side") return [0, b + ground, a];
    if (on === "top") return [a, 0, b];
    return [a, b + ground, 0];
  };
  const onSurface = (a: number, b: number): Point | null => {
    const start = place(a, b);
    const origin: Point = [start[0] + facing[0] * 6, start[1] + facing[1] * 6, start[2] + facing[2] * 6];
    const hit = builder.raycast(origin, [-facing[0], -facing[1], -facing[2]]);
    return hit && [hit[0] + facing[0] * liftM, hit[1] + facing[1] * liftM, hit[2] + facing[2] * liftM];
  };
  if (decal.round) {
    const sides = 14;
    const rim = Array.from({ length: sides }, (_, step) => {
      const angle = (step / sides) * Math.PI * 2;
      return onSurface(at[0] + (Math.cos(angle) * size[0]) / 2, at[1] + (Math.sin(angle) * size[1]) / 2);
    });
    const middle = onSurface(at[0], at[1]);
    if (!middle) return;
    const group = builder.newGroup();
    const wedge = (a: Point, b: Point) => {
      const raw: Point = [(a[1] - middle[1]) * (b[2] - middle[2]) - (a[2] - middle[2]) * (b[1] - middle[1]), (a[2] - middle[2]) * (b[0] - middle[0]) - (a[0] - middle[0]) * (b[2] - middle[2]), (a[0] - middle[0]) * (b[1] - middle[1]) - (a[1] - middle[1]) * (b[0] - middle[0])];
      const [first, second] = raw[0] * facing[0] + raw[1] * facing[1] + raw[2] * facing[2] > 0 ? [a, b] : [b, a];
      builder.triangle(middle, first, second, surface, group);
      if (decal.mirror) builder.triangle([-middle[0], middle[1], middle[2]], [-second[0], second[1], second[2]], [-first[0], first[1], first[2]], surface, group);
    };
    rim.forEach((point, step) => {
      const next = rim[(step + 1) % sides];
      if (point && next) wedge(point, next);
    });
    return;
  }
  const grid: (Point | null)[][] = [];
  for (let row = 0; row <= cells[1]; row++) {
    const line: (Point | null)[] = [];
    for (let column = 0; column <= cells[0]; column++) line.push(onSurface(at[0] + size[0] * (column / cells[0] - 0.5), at[1] + size[1] * (row / cells[1] - 0.5)));
    grid.push(line);
  }
  const group = builder.newGroup();
  for (let row = 0; row < cells[1]; row++) {
    for (let column = 0; column < cells[0]; column++) {
      const [a, b, c, d] = [grid[row][column], grid[row][column + 1], grid[row + 1][column + 1], grid[row + 1][column]];
      if (!a || !b || !c || !d) continue;
      const edgeU: Point = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const edgeV: Point = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const normal: Point = [edgeU[1] * edgeV[2] - edgeU[2] * edgeV[1], edgeU[2] * edgeV[0] - edgeU[0] * edgeV[2], edgeU[0] * edgeV[1] - edgeU[1] * edgeV[0]];
      const faces = normal[0] * facing[0] + normal[1] * facing[1] + normal[2] * facing[2] > 0;
      if (decal.mirror) {
        if (faces) builder.mirroredQuad(a, b, c, d, surface, group);
        else builder.mirroredQuad(d, c, b, a, surface, group);
      } else if (faces) builder.quad(a, b, c, d, surface, group);
      else builder.quad(d, c, b, a, surface, group);
    }
  }
}

function addMirrors(builder: SoupBuilder, spec: BodySpec, ground: number, fine: boolean) {
  const { z, h, x } = spec.mirror;
  const y = h + ground;
  for (const side of [1, -1]) {
    const ordered = (rings: Point[][]) => (side > 0 ? rings : [...rings].reverse());
    const shell = (out: number, wide: number, tall: number, back: number): Point[] => [
      [side * out, y - tall * 0.8, z + back],
      [side * out, y + tall * 0.9, z + back],
      [side * out, y + tall, z - wide],
      [side * out, y - tall * 0.7, z - wide],
    ];
    const stations = fine
      ? [shell(x, 0.03, 0.03, 0.03), shell(x + 0.02, 0.05, 0.05, 0.033), shell(x + 0.06, 0.06, 0.06, 0.036), shell(x + 0.11, 0.058, 0.06, 0.036), shell(x + 0.145, 0.05, 0.052, 0.034), shell(x + 0.165, 0.03, 0.035, 0.03)]
      : [shell(x, 0.03, 0.035, 0.03), shell(x + 0.05, 0.055, 0.055, 0.035), shell(x + 0.16, 0.035, 0.05, 0.03)];
    builder.rings(ordered(stations), "paint");
    const stalk = (out: number): Point[] => [
      [side * out, y - 0.04, z - 0.03],
      [side * out, y - 0.015, z - 0.03],
      [side * out, y - 0.015, z + 0.03],
      [side * out, y - 0.04, z + 0.03],
    ];
    builder.rings(ordered([stalk(x - 0.09), stalk(x + 0.02)]), "trim");
    const glassZ = z + 0.037;
    const [a, b, c, d]: Point[] = [
      [side * (x + 0.012), y - 0.04, glassZ],
      [side * (x + 0.012), y + 0.046, glassZ],
      [side * (x + 0.155), y + 0.042, glassZ],
      [side * (x + 0.155), y - 0.036, glassZ],
    ];
    const glass = fine ? "rim" : "trim";
    if (side > 0) builder.quad(d, c, b, a, glass);
    else builder.quad(a, b, c, d, glass);
  }
}

function addWing(builder: SoupBuilder, spec: BodySpec, ground: number) {
  if (!spec.wing) return;
  const { z, h, halfWidth, chord, rise } = spec.wing;
  const y = h + ground;
  const section = (x: number, sag: number): Point[] => [
    [x, y - 0.012 - sag, z - chord],
    [x, y + 0.012 - sag, z - chord],
    [x, y + rise - sag, z + chord * 0.5],
    [x, y + rise - 0.03 - sag, z + chord * 0.5],
  ];
  builder.rings([-1, -0.62, 0, 0.62, 1].map((share) => section(share * halfWidth, 0.03 * share * share)), "paint");
  for (const side of [1, -1]) {
    const x = side * halfWidth * 0.72;
    const foot: Point[] = [
      [x - 0.012, y - 0.2, z - 0.1],
      [x - 0.012, y - 0.2, z + 0.02],
      [x - 0.012, y, z + 0.02],
      [x - 0.012, y, z - 0.1],
    ];
    builder.rings([foot, foot.map(([at, up, along]): Point => [at + 0.024, up, along])], "trim");
  }
}

function addExhausts(builder: SoupBuilder, spec: BodySpec, ground: number) {
  if (!spec.exhausts) return;
  const { x, h, z, radius } = spec.exhausts;
  const round = (at: number, zAt: number, r: number): Point[] =>
    Array.from({ length: 8 }, (_, step) => {
      const angle = (-step / 8) * Math.PI * 2;
      return [at + Math.cos(angle) * r, h + ground + Math.sin(angle) * r, zAt];
    });
  for (const at of x) {
    builder.rings([round(at, z - 0.12, radius), round(at, z, radius)], "rim");
    builder.rings([round(at, z + 0.001, radius * 0.72)], "gap");
  }
}

function addRoofBars(builder: SoupBuilder, spec: BodySpec, curves: Curves, ground: number) {
  if (!spec.roofBars) return;
  const { from, to, x, rise } = spec.roofBars;
  const topAt = (z: number) => {
    const path = spec.silhouette;
    for (let at = 0; at + 1 < path.length; at++) {
      if (z >= path[at].z && z <= path[at + 1].z) return path[at].h + ((path[at + 1].h - path[at].h) * (z - path[at].z)) / (path[at + 1].z - path[at].z);
    }
    return path[0].h;
  };
  for (const side of [1, -1]) {
    const y = (z: number, up: number) => topAt(z) - curves.crown(z) + up + ground;
    const section = (z: number, up: number): Point[] => {
      const ring: Point[] = [
        [side * (x - 0.018), y(z, up), z],
        [side * (x - 0.018), y(z, up + 0.03), z],
        [side * (x + 0.018), y(z, up + 0.03), z],
        [side * (x + 0.018), y(z, up), z],
      ];
      return side > 0 ? ring : ring.reverse();
    };
    builder.rings(
      [section(from, 0), section(from + 0.1, rise), section((from + to) / 2, rise), section(to - 0.1, rise), section(to, 0)],
      "trim",
    );
  }
}

function addBlock(builder: SoupBuilder, { at, size, surface, mirror, taper = [1, 1] }: Block, ground: number) {
  const ring = (z: number, wide: number, tall: number, side: number): Point[] => [
    [side * at[0] - wide / 2, at[1] + ground - tall / 2, z],
    [side * at[0] - wide / 2, at[1] + ground + tall / 2, z],
    [side * at[0] + wide / 2, at[1] + ground + tall / 2, z],
    [side * at[0] + wide / 2, at[1] + ground - tall / 2, z],
  ];
  for (const side of mirror ? [1, -1] : [1]) {
    builder.rings([ring(at[2] - size[2] / 2, size[0], size[1], side), ring(at[2] + size[2] / 2, size[0] * taper[0], size[1] * taper[1], side)], surface);
  }
}

/** Enough of an inside for a window to look into: floor, dash, seats and a wheel, on the driver's side as in Finland. */
function addCabin(builder: SoupBuilder, spec: BodySpec, cabin: Cabin, ground: number) {
  const { dashZ, dashH, floorH, seatZ, rearSeatZ, endZ, seatX, seatSurface } = cabin;
  const block = (at: Block["at"], size: Block["size"], surface: Surface, mirror = false, taper?: Block["taper"]) => {
    addBlock(builder, { at, size, surface, mirror, taper }, ground);
  };
  const wide = spec.trackM * 0.92;
  const length = endZ - dashZ;
  block([0, floorH - 0.02, dashZ + length / 2], [wide, 0.04, length], "interior");
  block([0, (floorH + dashH) / 2, dashZ], [wide, dashH - floorH, 0.05], "interior");
  block([0, (floorH + dashH) / 2 + 0.05, endZ], [wide, dashH - floorH + 0.1, 0.04], "interior");
  block([0, dashH - 0.1, dashZ + 0.2], [wide * 0.96, 0.16, 0.42], "interior", false, [0.98, 0.6]);
  block([0, floorH + 0.12, dashZ + 0.68], [0.2, 0.2, 0.8], "interior");
  const seat = (x: number, z: number, seatWide: number) => {
    const seatH = floorH + 0.28;
    block([x, seatH - 0.05, z - 0.13], [seatWide, 0.1, 0.42], seatSurface, true);
    block([x, seatH + 0.25, z + 0.1], [seatWide * 0.92, 0.5, 0.1], seatSurface, true, [0.92, 0.95]);
    block([x, seatH + 0.56, z + 0.1], [seatWide * 0.5, 0.12, 0.08], seatSurface, true);
  };
  seat(seatX, seatZ, 0.46);
  if (rearSeatZ !== undefined) seat(seatX * 0.92, rearSeatZ, 0.48);
  // The steering wheel, a ring leaning back towards the driver.
  const wheelR = 0.17;
  const wheelZ = dashZ + 0.46;
  const wheelY = dashH + 0.08 + ground;
  const tube = 0.014;
  const lean = 0.42;
  const segments = 10;
  const point = (angle: number, grow: number, push: number): Point => {
    const up = Math.sin(angle) * (wheelR + grow);
    return [-seatX + Math.cos(angle) * (wheelR + grow), wheelY + up * Math.cos(lean), wheelZ + push - up * Math.sin(lean)];
  };
  for (let step = 0; step < segments; step++) {
    const [from, to] = [(step / segments) * Math.PI * 2, ((step + 1) / segments) * Math.PI * 2];
    const section = (angle: number): Point[] => [point(angle, -tube, -tube), point(angle, -tube, tube), point(angle, tube, tube), point(angle, tube, -tube)];
    builder.rings([section(from), section(to)], "seat");
  }
  block([-seatX, dashH + 0.06, wheelZ - 0.1], [0.07, 0.07, 0.34], "interior");
}

/** `ground` is the height of the car's own origin above the road, negated: y in the car is height + ground. */
export function buildBody(spec: BodySpec, ground: number, detail: BodyDetail): Soup {
  const curves: Curves = {
    sill: curve(spec.sill),
    shoulder: curve(spec.shoulder),
    belt: curve(spec.belt),
    windowTop: curve(spec.windowTop),
    crown: curve(spec.crown),
    halfWidth: curve(spec.halfWidth),
    railWidth: curve(spec.railWidth),
  };
  const stations = stationsOf(spec, curves, detail);
  const zFront = spec.silhouette[0].z;
  const zRear = Math.max(...spec.silhouette.map(({ z }) => z));
  const zNose = Math.min(...spec.silhouette.map(({ z }) => z));
  const builder = new SoupBuilder();
  const under = builder.newGroup();
  const rows = detail.rows;
  const ribs = stations.map((station) => ribOf(spec, curves, station, false));
  const grid: Point[][] = ribs.map((rib, index) => {
    const station = stations[index];
    const width = curves.halfWidth(station.z);
    return rows.map((row): Point => {
      const [x, h] = rowAt(rib, row);
      return [x, h + ground, pulledZ(spec, station.z, x, width, Math.min(zFront, zNose), zRear)];
    });
  });
  const railAt = rows.indexOf(ROWS.rail);

  const inPillar = (z: number) => spec.pillars.some(([from, to]) => z >= from && z <= to);
  const windowOpen = (index: number) => ribs[index][ROWS.windowTop][1] - ribs[index][ROWS.windowBase][1] > 0.006;
  const doorZ = [Math.min(...spec.seams), Math.max(...spec.seams)];

  for (let index = 0; index + 1 < stations.length; index++) {
    const station = stations[index];
    const midZ = (station.z + stations[index + 1].z) / 2;
    const open = windowOpen(index) || windowOpen(index + 1);
    for (let at = 0; at + 1 < rows.length; at++) {
      const exact = rows[at];
      const row = Math.floor(exact);
      const band = station.band === undefined ? undefined : spec.bands[station.band].find(({ from, to }) => row >= from && row < to);
      const surfaceOf = (): Surface => {
        if (band) return band.surface;
        if (station.gap && row >= ROWS.sillTop && row < ROWS.belt) return "gap";
        if (row < ROWS.sillTop) return spec.sillSurface;
        if (detail.fine && exact === SEAM_ROWS.door && midZ > doorZ[0] && midZ < doorZ[1]) return "gap";
        if (detail.fine && exact === SEAM_ROWS.hood && spec.hoodSeamZ && midZ > spec.hoodSeamZ[0] && midZ < spec.hoodSeamZ[1]) return "gap";
        if (row === ROWS.belt && open) return spec.beltSurface;
        if (row === ROWS.windowBase && open) return inPillar(midZ) ? "trim" : "glass";
        if (row === ROWS.windowTop && open) return spec.pillarSurface;
        if (station.bed && row >= ROWS.rail) return spec.bedSurface ?? "trim";
        return "paint";
      };
      builder.mirroredQuad(grid[index][at], grid[index][at + 1], grid[index + 1][at + 1], grid[index + 1][at], surfaceOf());
    }
    const [a, b] = [grid[index][0], grid[index + 1][0]];
    builder.quad(a, b, [-b[0], b[1], b[2]], [-a[0], a[1], a[2]], "under", under);
  }

  // Each well's inner wall, kept under the hood: a low nose would have it through the paint.
  const wellX = spec.trackM / 2 - spec.tyreWidthM / 2 - 0.03;
  const radius = spec.wheelRadiusM + spec.archClearM;
  const wall = builder.newGroup();
  for (const axle of spec.axleZ) {
    const low = spec.sill[0][1] + ground;
    const high = spec.wheelRadiusM + radius + ground + 0.03;
    const inWell = stations.map((station, index) => ({ z: station.z, top: Math.min(high, grid[index][railAt][1] - 0.04) })).filter(({ z }) => Math.abs(z - axle) <= radius);
    inWell.slice(1).forEach(({ z, top }, index) => {
      const before = inWell[index];
      if (z > before.z) builder.mirroredQuad([wellX, low, before.z], [wellX, before.top, before.z], [wellX, top, z], [wellX, low, z], "under", wall);
    });
  }

  for (const decal of spec.decals) if (detail.fine || !decal.fine) addDecal(builder, ground, decal);
  if (detail.fine) addExhausts(builder, spec, ground);
  addMirrors(builder, spec, ground, detail.fine);
  addWing(builder, spec, ground);
  addRoofBars(builder, spec, curves, ground);
  for (const block of spec.blocks ?? []) if (detail.fine || !block.fine) addBlock(builder, block, ground);
  if (detail.cabin && spec.cabin) addCabin(builder, spec, spec.cabin, ground);
  return builder.finish(detail.creaseDeg);
}

/** A car at a distance: its outline in four ribs, glass where the glass is, about thirty triangles. */
export function buildDistant(spec: BodySpec, ground: number): Soup {
  const curves = { sill: curve(spec.sill), belt: curve(spec.belt), halfWidth: curve(spec.halfWidth), railWidth: curve(spec.railWidth) };
  const path = spec.silhouette;
  const topAt = (z: number) => Math.max(...path.slice(1).map((point, index) => {
    const before = path[index];
    const [low, high] = before.z < point.z ? [before.z, point.z] : [point.z, before.z];
    if (z < low || z > high || low === high) return 0;
    return before.h + ((point.h - before.h) * (z - before.z)) / (point.z - before.z);
  }));
  const ends = path.map(({ z }) => z);
  const [nose, tail] = [Math.min(...ends), Math.max(...ends)];
  const hasGlass = spec.windowZ[1] > spec.windowZ[0];
  const middle = hasGlass ? spec.windowZ : [nose + (tail - nose) * 0.3, nose + (tail - nose) * 0.7];
  const stations = [nose + 0.04, middle[0], middle[1], tail - 0.04];
  const ribs = stations.map((z): Point[] => {
    const top = topAt(z);
    const width = curves.halfWidth(z) + 0.01;
    const belt = Math.min(curves.belt(z), top);
    return [
      [width, curves.sill(z) + ground, z],
      [width, belt + ground, z],
      [Math.min(curves.railWidth(z), width), top + ground, z],
    ];
  });
  const builder = new SoupBuilder();
  ribs.slice(1).forEach((rib, at) => {
    const before = ribs[at];
    const upper = at === 1 && hasGlass ? "glass" : "paint";
    builder.mirroredQuad(before[0], before[1], rib[1], rib[0], "paint");
    builder.mirroredQuad(before[1], before[2], rib[2], rib[1], upper);
    const [a, b] = [before[2], rib[2]];
    builder.quad(a, [-a[0], a[1], a[2]], [-b[0], b[1], b[2]], b, "paint");
  });
  const cap = (rib: Point[], outward: boolean) => {
    const [a, b, c] = rib;
    const flip = ([x, y, z]: Point): Point => [-x, y, z];
    const quad = (p: Point, q: Point, r: Point, t: Point) => {
      if (outward) builder.quad(p, q, r, t, "paint");
      else builder.quad(t, r, q, p, "paint");
    };
    quad(flip(a), a, b, flip(b));
    quad(flip(b), b, c, flip(c));
  };
  cap(ribs[ribs.length - 1], true);
  cap(ribs[0], false);
  return builder.finish(1);
}
