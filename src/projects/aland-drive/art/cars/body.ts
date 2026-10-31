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
  /** From here to the next point the top is open: a pickup's bed. */
  bed?: boolean;
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
}

export interface BodyDetail {
  maxStepM: number;
  archSteps: number;
  rows: readonly number[];
  seams: boolean;
  fine: boolean;
  creaseDeg: number;
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
  const path = spec.silhouette;
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

function addMirrors(builder: SoupBuilder, spec: BodySpec, ground: number) {
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
    builder.rings(ordered([shell(x, 0.03, 0.035, 0.03), shell(x + 0.05, 0.055, 0.055, 0.035), shell(x + 0.16, 0.035, 0.05, 0.03)]), "paint");
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
    if (side > 0) builder.quad(d, c, b, a, "trim");
    else builder.quad(a, b, c, d, "trim");
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
  const rows = detail.rows;
  const ribs = stations.map((station) => ribOf(spec, curves, station, false));
  const grid: Point[][] = ribs.map((rib, index) => {
    const station = stations[index];
    const width = curves.halfWidth(station.z);
    return rib.map(([x, h]): Point => [x, h + ground, pulledZ(spec, station.z, x, width, Math.min(zFront, zNose), zRear)]);
  });

  const inPillar = (z: number) => spec.pillars.some(([from, to]) => z >= from && z <= to);
  const windowOpen = (index: number) => ribs[index][ROWS.windowTop][1] - ribs[index][ROWS.windowBase][1] > 0.006;

  for (let index = 0; index + 1 < stations.length; index++) {
    const station = stations[index];
    const midZ = (station.z + stations[index + 1].z) / 2;
    const open = windowOpen(index) || windowOpen(index + 1);
    for (let at = 0; at + 1 < rows.length; at++) {
      const [row, up] = [rows[at], rows[at + 1]];
      const band = station.band === undefined ? undefined : spec.bands[station.band].find(({ from, to }) => row >= from && row < to);
      const surfaceOf = (): Surface => {
        if (band) return band.surface;
        if (station.gap && row >= ROWS.sillTop && row < ROWS.belt) return "gap";
        if (row < ROWS.sillTop) return spec.sillSurface;
        if (row === ROWS.belt && open) return spec.beltSurface;
        if (row === ROWS.windowBase && open) return inPillar(midZ) ? "trim" : "glass";
        if (row === ROWS.windowTop && open) return spec.pillarSurface;
        if (station.bed && row >= ROWS.rail) return "trim";
        return "paint";
      };
      builder.mirroredQuad(grid[index][row], grid[index][up], grid[index + 1][up], grid[index + 1][row], surfaceOf());
    }
    const [a, b] = [grid[index][0], grid[index + 1][0]];
    const under = builder.newGroup();
    builder.quad(a, b, [-b[0], b[1], b[2]], [-a[0], a[1], a[2]], "under", under);
  }

  // Each well's inner wall, kept under the hood: a low nose would have it through the paint.
  const wellX = spec.trackM / 2 - spec.tyreWidthM / 2 - 0.03;
  const radius = spec.wheelRadiusM + spec.archClearM;
  const wall = builder.newGroup();
  for (const axle of spec.axleZ) {
    const low = spec.sill[0][1] + ground;
    const high = spec.wheelRadiusM + radius + ground + 0.03;
    const inWell = stations.map((station, index) => ({ z: station.z, top: Math.min(high, grid[index][ROWS.rail][1] - 0.04) })).filter(({ z }) => Math.abs(z - axle) <= radius);
    inWell.slice(1).forEach(({ z, top }, index) => {
      const before = inWell[index];
      if (z > before.z) builder.mirroredQuad([wellX, low, before.z], [wellX, before.top, before.z], [wellX, top, z], [wellX, low, z], "under", wall);
    });
  }

  for (const decal of spec.decals) if (detail.fine || !decal.fine) addDecal(builder, ground, decal);
  if (detail.fine) addExhausts(builder, spec, ground);
  addMirrors(builder, spec, ground);
  addWing(builder, spec, ground);
  addRoofBars(builder, spec, curves, ground);
  return builder.finish(detail.creaseDeg);
}
