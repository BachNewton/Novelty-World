import { curve, smoothstep, type Key } from "./curve";
import { SoupBuilder, SURFACES, type Point, type Soup, type Surface } from "./mesh";

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
  /** The taper keeps the block's foot level, `at`'s height its near end's middle, so it grows or shrinks upwards only. */
  footLevel?: boolean;
  fine?: boolean;
}

/**
 * A wing over an open wheel, fixed to the body, as a track car's cycle wing or a minimal pod: a strip of arc over the
 * tyre, from `from` to `to` degrees round the wheel (0 straight ahead, 90 over the top, 180 straight behind), standing
 * `clearM` off the tyre, `wide` across, centred `x` out from the car's middle and mirrored.
 */
export interface Fender {
  axle: number;
  x: number;
  wide: number;
  clearM: number;
  from: number;
  to: number;
  /** How thick its edges are, and how much higher its middle stands: a crowned wing. */
  thick: number;
  crown: number;
  surface: Surface;
}

/** A tube along a path of points (x across, height, z along): a roll hoop, a suspension arm, a stay. */
export interface Strut {
  path: readonly (readonly [x: number, h: number, z: number])[];
  radius: number;
  surface: Surface;
  /** Also on the other side of the car. */
  mirror?: boolean;
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
  /**
   * A central driving seat's car: the driver sits in the middle (`seatX` 0) with no console beside them, and the two
   * passengers either side of them and set back, at `x` out from the middle and `z`, so their shoulders clear the
   * driver's. None, and the front pair sit either side of the middle at `seatX`.
   */
  passengers?: readonly [x: number, z: number];
  /** How wide its floor and bulkheads are, where a narrow body doesn't reach the wheels: the track's width otherwise. */
  wideM?: number;
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
  /** How far the roof's edge sits below the centre line: below zero, the edge stands above it, as fenders do beside a hood that dips between them. */
  crown: readonly Key[];
  /**
   * How far in from the flank's top the side glass starts, along the car: a shelf of paint between the two, so a
   * narrow cabin sits inboard of wide hips as a mid-engined car's does. None, and the glass starts at the flank.
   */
  shelf?: readonly Key[];
  /** How far the lower flank is scooped in, along the car: a sculpted side that leads the eye, and the air, into an intake. */
  scoop?: readonly Key[];
  /**
   * Where the silhouette drops below the flank, as at a nose or a tail, the rows above it run across the end in one
   * direction, so no strip of the end folds back over another in one plane. Every new car sets it; the older cars
   * keep their ends as their measured swaps and known overlaps have them, until they're redrawn.
   */
  cleanEnds?: boolean;
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
  /**
   * How tall the sill's strip stands round each wheel's arch: a lip of the sill's surface round the opening, as a rally
   * car's arch extensions are. None, and the strip is a hairline there.
   */
  archLipM?: number;
  /** What the belt strip under the side glass is. */
  beltSurface: Surface;

  mirror: { z: number; h: number; x: number };
  decals: readonly Decal[];
  /** `stayM` is how far its two feet reach down to the deck, 0.2 m when not given. */
  wing?: { z: number; h: number; halfWidth: number; chord: number; rise: number; endplates?: boolean; stayM?: number };
  /** Tailpipes; `open` ones stand out of the body, rolled at the end round a dark bore, rather than capped where the body hides the end. */
  exhausts?: { x: readonly number[]; h: number; z: number; radius: number; open?: boolean };
  roofBars?: { from: number; to: number; x: number; rise: number };
  bedFloorH?: number;
  bedSurface?: Surface;
  blocks?: readonly Block[];
  cabin?: Cabin;
  /** Where the hood's shut lines run, from and to. */
  hoodSeamZ?: readonly [from: number, to: number];
  /**
   * The wheels stand outside a narrow body, as a track car's do: the body has no arches cut in it and no wells, and
   * what covers the wheels is its `fenders`.
   */
  openWheels?: boolean;
  fenders?: readonly Fender[];
  struts?: readonly Strut[];
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
  /** Blocks' faces wound outward: a drivable car's, at either detail. */
  outwardBlocks: boolean;
}

interface Station extends SilhouettePoint {
  gap?: boolean;
}

interface Curves {
  shelf: (z: number) => number;
  scoop: (z: number) => number;
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
/** How near a hero's arch station may come to another station it must have before it gives way. */
const SLIVER_M = 0.025;

function archTop(spec: BodySpec, z: number): number {
  if (spec.openWheels) return 0;
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
  // A hero with clean ends has its arches' stations laid without slivers; the older cars keep theirs as their known
  // overlaps were counted on, until they're redrawn.
  const clean = detail.fine && spec.cleanEnds === true;
  const arches: number[] = [];
  for (const axle of spec.openWheels ? [] : spec.axleZ) {
    const low = curves.sill(axle);
    const lowest = Math.asin(Math.max(-1, (low - spec.wheelRadiusM) / radius));
    // An arch is drawn over its wheel's top half (`archTop`), so a hero's stations go round that half alone: below the
    // axle a step's z would land a millimetre or two from one above it, a sliver whose normals crumpled the light.
    const startAngle = clean ? Math.max(lowest, 0) : lowest;
    for (let step = 0; step <= detail.archSteps; step++) {
      const angle = startAngle + ((Math.PI - 2 * startAngle) * step) / detail.archSteps;
      arches.push(axle + Math.cos(angle) * radius);
    }
  }
  const marks: { z: number; gapTo?: number }[] = [];
  if (detail.seams) for (const seam of spec.seams) marks.push({ z: seam - SEAM_HALF_M, gapTo: seam + SEAM_HALF_M }, { z: seam + SEAM_HALF_M });
  for (const [from, to] of spec.pillars) marks.push({ z: from }, { z: to });
  const path = spec.silhouette.filter((point) => detail.fine || !point.fine);
  // A hero's arch station that falls by a seam, a pillar or a point of the silhouette gives way to it, rather than leave
  // a sliver between them: its normals crumple the light, and a pane's frit folds across one into the next.
  const fixed = [...marks.map(({ z }) => z), ...path.map(({ z }) => z)];
  const clear = (z: number) => !clean || fixed.every((at) => Math.abs(at - z) >= SLIVER_M);
  wanted.push(...arches.filter(clear).map((z) => ({ z })), ...marks);

  const stations: Station[] = [];
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

/** The larger of two heights, rounded over `round` where they cross, and exactly the larger beyond it. */
function smoothMax(a: number, b: number, round: number) {
  const near = Math.max(round - Math.abs(a - b), 0) / round;
  return Math.max(a, b) + (near * near * round) / 4;
}

/** How far a hero's flank rows round off where the arch's edge lifts them. */
const ARCH_ROUND_M = 0.06;

/**
 * A hero's lower and mid rows: the flank's own lines, as if there were no arch, lifted over the arch's lip only where
 * it reaches them. Spread between the lip and the shoulder instead, they'd follow the arch's circle, which stands
 * straight up at the arch's ends, and squeeze the panel over it into a few centimetres, so the light crumpled there.
 */
function heroFlank(lowest: number, sill: number, sillTop: number, shoulder: number, lip: number) {
  const flankTop = Math.max(lowest + 0.08, lowest + lip);
  const lower = Math.max(flankTop + (shoulder - flankTop) * 0.3, lowest + 0.024);
  const mid = Math.max(flankTop + (shoulder - flankTop) * 0.68, lowest + 0.036);
  if (sill <= lowest) return { lower, mid };
  const gap = shoulder - sillTop;
  return {
    lower: smoothMax(lower, sillTop + Math.min(0.015, gap * 0.3), ARCH_ROUND_M),
    mid: smoothMax(mid, sillTop + Math.min(0.03, gap * 0.68), ARCH_ROUND_M),
  };
}

function ribOf(spec: BodySpec, curves: Curves, station: Station, sideWall: boolean, fine: boolean): [x: number, h: number][] {
  const { z, h: top } = station;
  const lowest = curves.sill(z);
  const sill = Math.max(lowest, archTop(spec, z));
  const width = curves.halfWidth(z);
  const flare = flareAt(spec, z);
  const shoulder = Math.max(curves.shoulder(z), sill + 0.05);
  const lip = spec.archLipM ?? 0.012;
  const sillTop = Math.max(lowest + 0.08, sill + lip);
  // Only a car with clean ends: the older cars keep their flanks as their known overlaps were counted on.
  const { lower, mid } = fine && spec.cleanEnds === true
    ? heroFlank(lowest, sill, sillTop, shoulder, lip)
    : { lower: Math.max(sillTop + (shoulder - sillTop) * 0.3, sill + 0.024), mid: Math.max(sillTop + (shoulder - sillTop) * 0.68, sill + 0.036) };
  const belt = Math.max(curves.belt(z), shoulder + 0.01);

  const beltX = width - 0.018 + flare * 0.35;
  const railX = curves.railWidth(z);
  const shelf = curves.shelf(z);
  const baseX = Math.max(beltX - 0.014 - shelf, railX + 0.02);
  const railH = top - curves.crown(z);
  // A shelf rises a little as it runs in, so it sheds the light as a surface and not a step.
  const baseH = Math.min(belt + 0.012 + shelf * 0.18, railH);
  const hasWindow = z > spec.windowZ[0] && z < spec.windowZ[1];
  const windowH = hasWindow ? Math.min(Math.max(curves.windowTop(z), baseH), railH) : baseH;
  const windowShare = railH > baseH ? (windowH - baseH) / (railH - baseH) : 0;

  const scoop = curves.scoop(z);
  const roofOuter: [number, number] = [railX * 0.64, top - curves.crown(z) * 0.42];
  const roofInner: [number, number] = [railX * 0.3, top - curves.crown(z) * 0.1];
  const rib: [number, number][] = [
    [width - 0.04 + flare * 0.7, sill],
    [width - 0.014 + flare, sillTop],
    [width - 0.004 + flare - scoop * 0.55, lower],
    [width + flare - scoop, mid],
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
  const cap = top + Math.max(0, -curves.crown(z));
  const capped = rib.map(([x, h]): [number, number] => [x, Math.min(h, cap)]);
  if (spec.cleanEnds) {
    for (let row = 1; row < capped.length; row++) {
      if (capped[row][1] >= cap) capped[row][0] = Math.min(capped[row][0], capped[row - 1][0]);
    }
  }
  return capped;
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

/**
 * A hero's mirror: a housing that swells out of a slim arm and tapers to its tip, round in front and flat behind, in
 * the body's colour, with its dark glass on the flat back.
 */
/** How far in from the housing's edge a hero mirror's glass stops. */
const MIRROR_RIM_M = 0.009;

function addHeroMirrors(builder: SoupBuilder, spec: BodySpec, ground: number) {
  const { z, h, x } = spec.mirror;
  const y = h + ground;
  const back = 0.035;
  for (const side of [1, -1]) {
    const ordered = (rings: Point[][]) => (side > 0 ? [...rings].reverse() : rings);
    // A section from the top of its flat back, round the front, to the bottom of its back.
    const section = (out: number, tall: number, deep: number, lift: number): Point[] =>
      Array.from({ length: 9 }, (_, step) => {
        const angle = Math.PI / 2 - (Math.PI * step) / 8;
        return [side * out, y + lift + tall * Math.sin(angle), z + back - (back + deep) * Math.cos(angle)];
      });
    builder.rings(
      ordered([section(x + 0.02, 0.022, 0.02, -0.004), section(x + 0.05, 0.04, 0.045, 0), section(x + 0.1, 0.048, 0.055, 0.004), section(x + 0.145, 0.044, 0.05, 0.006), section(x + 0.172, 0.03, 0.034, 0.006), section(x + 0.184, 0.012, 0.014, 0.005)]),
      "paint",
    );
    // The arm, from the door's top to the housing, thin and swept back.
    const arm = (out: number, up: number, along: number): Point[] => [
      [side * out, y + up - 0.007, z + along - 0.018],
      [side * out, y + up + 0.007, z + along - 0.018],
      [side * out, y + up + 0.007, z + along + 0.018],
      [side * out, y + up - 0.007, z + along + 0.018],
    ];
    builder.rings(ordered([arm(x - 0.02, -0.06, 0.02), arm(x + 0.01, -0.038, 0.01), arm(x + 0.04, -0.012, 0)]), "paint");
    // The glass on its flat back, standing off it: the housing's own outline drawn in by a rim of paint, silvered as a
    // mirror is, so from behind or from the driver's seat it reads as a mirror and not as a dark box.
    const glassZ = z + back + 0.006;
    const edge = (out: number, tall: number, lift: number): [Point, Point] => [
      [side * out, y + lift - tall + MIRROR_RIM_M, glassZ],
      [side * out, y + lift + tall - MIRROR_RIM_M, glassZ],
    ];
    const outline = [edge(x + 0.05, 0.04, 0), edge(x + 0.1, 0.048, 0.004), edge(x + 0.145, 0.044, 0.006), edge(x + 0.168, 0.033, 0.006)];
    const group = builder.newGroup();
    outline.slice(1).forEach(([low, high], at) => {
      const [lowBefore, highBefore] = outline[at];
      if (side > 0) builder.quad(low, high, highBefore, lowBefore, "rim", group);
      else builder.quad(lowBefore, highBefore, high, low, "rim", group);
    });
  }
}

function addMirrors(builder: SoupBuilder, spec: BodySpec, ground: number, fine: boolean) {
  if (fine) {
    addHeroMirrors(builder, spec, ground);
    return;
  }
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
    const stations = [shell(x, 0.03, 0.035, 0.03), shell(x + 0.05, 0.055, 0.055, 0.035), shell(x + 0.16, 0.035, 0.05, 0.03)];
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
  if (spec.wing.endplates) {
    // A plate at each tip, standing past the blade's ends so no face of one lies on the other's.
    for (const side of [1, -1]) {
      const x = side * (halfWidth - 0.006);
      // Swept: low and short at its leading edge, rising to a raked trailing edge above the blade.
      const plate = (at: number): Point[] => [
        [at, y - 0.06, z - chord - 0.03],
        [at, y - 0.11, z - chord * 0.2],
        [at, y - 0.09, z + chord * 0.5 + 0.03],
        [at, y + rise + 0.035, z + chord * 0.5 + 0.06],
        [at, y + rise + 0.045, z + chord * 0.5 + 0.02],
        [at, y + 0.03, z - chord - 0.03],
      ];
      const [inner, outer] = side > 0 ? [x, x + 0.012] : [x - 0.012, x];
      builder.rings([plate(outer), plate(inner)], "paint");
    }
  }
  const stay = spec.wing.stayM ?? 0.2;
  for (const side of [1, -1]) {
    const x = side * halfWidth * 0.72;
    const foot: Point[] = [
      [x - 0.012, y - stay, z - 0.1],
      [x - 0.012, y - stay, z + 0.02],
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
    if (spec.exhausts.open) {
      // The pipe's wall, its rolled end and its bore, closed a few centimetres in by a dark disc standing clear of the bore's floor.
      builder.rings([round(at, z - 0.12, radius), round(at, z, radius), round(at, z, radius * 0.8), round(at, z - 0.04, radius * 0.8)], "rim");
      builder.rings([round(at, z - 0.03, radius * 0.78)], "gap");
      continue;
    }
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

/** How far up a block's ring at this height stands: its middle, raised where the taper keeps its foot level. */
const blockMiddle = ({ at, size, footLevel }: Block, tall: number) => at[1] + (footLevel ? (tall - size[1]) / 2 : 0);

/** A block's faces wound to face out of it when `outward`; a world car's still face in, as its measured swaps have them. */
function addBlock(builder: SoupBuilder, block: Block, ground: number, outward: boolean) {
  const { at, size, surface, mirror, taper = [1, 1] } = block;
  const ring = (z: number, wide: number, tall: number, side: number): Point[] => [
    [side * at[0] - wide / 2, blockMiddle(block, tall) + ground - tall / 2, z],
    [side * at[0] - wide / 2, blockMiddle(block, tall) + ground + tall / 2, z],
    [side * at[0] + wide / 2, blockMiddle(block, tall) + ground + tall / 2, z],
    [side * at[0] + wide / 2, blockMiddle(block, tall) + ground - tall / 2, z],
  ];
  for (const side of mirror ? [1, -1] : [1]) {
    const ends = [ring(at[2] - size[2] / 2, size[0], size[1], side), ring(at[2] + size[2] / 2, size[0] * taper[0], size[1] * taper[1], side)];
    builder.rings(outward ? ends.reverse() : ends, surface);
  }
}

/** Rings joined into a tube, each turned so its faces point out of the tube, whichever way its path runs. */
function addTube(builder: SoupBuilder, rings: Point[][], surface: Surface) {
  const middle = (ring: readonly Point[]): Point => [0, 1, 2].map((axis) => ring.reduce((sum, point) => sum + point[axis], 0) / ring.length) as Point;
  const [here, next] = [middle(rings[0]), middle(rings[1])];
  const [a, b] = [rings[0][0], rings[0][1]];
  const edge: Point = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const travel: Point = [next[0] - here[0], next[1] - here[1], next[2] - here[2]];
  const normal: Point = [edge[1] * travel[2] - edge[2] * travel[1], edge[2] * travel[0] - edge[0] * travel[2], edge[0] * travel[1] - edge[1] * travel[0]];
  const out: Point = [(a[0] + b[0]) / 2 - here[0], (a[1] + b[1]) / 2 - here[1], (a[2] + b[2]) / 2 - here[2]];
  const outward = normal[0] * out[0] + normal[1] * out[1] + normal[2] * out[2] > 0;
  builder.rings(outward ? rings : rings.map((ring) => [...ring].reverse()), surface);
}

function addFender(builder: SoupBuilder, spec: BodySpec, { axle, x, wide, clearM, from, to, thick, crown, surface }: Fender, ground: number, fine: boolean) {
  const centreY = spec.wheelRadiusM + ground;
  const radius = spec.wheelRadiusM + clearM;
  const steps = fine ? 16 : 4;
  // Across the wing, inside edge to outside edge: its underside flat, its top crowned, its edges rounded.
  const section: (readonly [across: number, out: number])[] = fine
    ? [
        [-wide / 2, 0],
        [-wide / 2 - 0.004, thick * 0.6],
        [-wide / 4, thick + crown * 0.8],
        [wide / 4, thick + crown * 0.8],
        [wide / 2 + 0.004, thick * 0.6],
        [wide / 2, 0],
      ]
    : [
        [-wide / 2, 0],
        [-wide / 2, thick + crown * 0.5],
        [wide / 2, thick + crown * 0.5],
        [wide / 2, 0],
      ];
  for (const side of [1, -1]) {
    const rings = Array.from({ length: steps + 1 }, (_, step): Point[] => {
      const angle = ((from + ((to - from) * step) / steps) * Math.PI) / 180;
      const [along, up] = [-Math.cos(angle), Math.sin(angle)];
      return section.map(([across, out]): Point => [side * (x + across), centreY + up * (radius + out), axle + along * (radius + out)]);
    });
    addTube(builder, rings, surface);
  }
}

function addStrut(builder: SoupBuilder, { path, radius, surface, mirror }: Strut, ground: number, fine: boolean) {
  const sides = fine ? 6 : 4;
  for (const side of mirror ? [1, -1] : [1]) {
    const points = path.map(([x, h, z]): Point => [side * x, h + ground, z]);
    const rings = points.map((point, at): Point[] => {
      const [before, after] = [points[Math.max(at - 1, 0)], points[Math.min(at + 1, points.length - 1)]];
      const raw: Point = [after[0] - before[0], after[1] - before[1], after[2] - before[2]];
      const length = Math.hypot(...raw);
      const along: Point = [raw[0] / length, raw[1] / length, raw[2] / length];
      const reference: Point = Math.abs(along[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const across: Point = [along[1] * reference[2] - along[2] * reference[1], along[2] * reference[0] - along[0] * reference[2], along[0] * reference[1] - along[1] * reference[0]];
      const acrossLength = Math.hypot(...across);
      const u: Point = [across[0] / acrossLength, across[1] / acrossLength, across[2] / acrossLength];
      const v: Point = [along[1] * u[2] - along[2] * u[1], along[2] * u[0] - along[0] * u[2], along[0] * u[1] - along[1] * u[0]];
      return Array.from({ length: sides }, (_, step): Point => {
        const angle = (step / sides) * Math.PI * 2 + Math.PI / sides;
        const [c, s] = [Math.cos(angle) * radius, Math.sin(angle) * radius];
        return [point[0] + u[0] * c + v[0] * s, point[1] + u[1] * c + v[1] * s, point[2] + u[2] * c + v[2] * s];
      });
    });
    addTube(builder, rings, surface);
  }
}

/** Enough of an inside for a window to look into: floor, dash, seats and a wheel, on the driver's side as in Finland. */
function addCabin(builder: SoupBuilder, spec: BodySpec, cabin: Cabin, ground: number) {
  const { dashZ, dashH, floorH, seatZ, rearSeatZ, endZ, seatX, seatSurface } = cabin;
  const block = (at: Block["at"], size: Block["size"], surface: Surface, mirror = false, taper?: Block["taper"]) => {
    addBlock(builder, { at, size, surface, mirror, taper }, ground, true);
  };
  const wide = cabin.wideM ?? spec.trackM * 0.92;
  const length = endZ - dashZ;
  block([0, floorH - 0.02, dashZ + length / 2], [wide, 0.04, length], "interior");
  block([0, (floorH + dashH) / 2, dashZ], [wide, dashH - floorH, 0.05], "interior");
  block([0, (floorH + dashH) / 2 + 0.05, endZ], [wide, dashH - floorH + 0.1, 0.04], "interior");
  block([0, dashH - 0.1, dashZ + 0.2], [wide * 0.96, 0.16, 0.42], "interior", false, [0.98, 0.6]);
  const { passengers } = cabin;
  if (!passengers) block([0, floorH + 0.12, dashZ + 0.68], [0.2, 0.2, 0.8], "interior");
  const seat = (x: number, z: number, seatWide: number, mirror = true) => {
    const seatH = Math.min(floorH + 0.28, dashH - 0.25);
    const backTall = dashH + 0.2 - seatH;
    block([x, seatH - 0.05, z - 0.13], [seatWide, 0.1, 0.42], seatSurface, mirror);
    block([x, seatH + backTall / 2, z + 0.1], [seatWide * 0.92, backTall, 0.1], seatSurface, mirror, [0.92, 0.95]);
    block([x, seatH + backTall + 0.05, z + 0.1], [seatWide * 0.5, 0.1, 0.08], seatSurface, mirror);
  };
  if (passengers) {
    seat(seatX, seatZ, 0.44, false);
    seat(passengers[0], passengers[1], 0.38);
  } else seat(seatX, seatZ, 0.46);
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

/** Two segments of a row or a station turning by more than this meet at a crease, which a normal doesn't smooth across. */
const CREASE_COS = Math.cos((32 * Math.PI) / 180);

/**
 * The hero's normals, from the loft itself: at each point of the grid, the way the surface runs along its row and
 * along its station, so a reflection runs smooth along a door however its quads were cut. Where a row or a station
 * turns sharply (a crease, the edge of a band) each face takes the tangent on its own side. `stationSide` and
 * `rowSide` say which way the face lies from the point: +1 towards the next station or row, -1 the one before.
 */
function loftNormals(grid: readonly Point[][]) {
  const unit = (v: Point): Point | null => {
    const length = Math.hypot(...v);
    return length < 1e-6 ? null : [v[0] / length, v[1] / length, v[2] / length];
  };
  const between = (from: Point | undefined, to: Point | undefined) => (from && to ? unit([to[0] - from[0], to[1] - from[1], to[2] - from[2]]) : null);
  const tangent = (before: Point | null, after: Point | null, side: number): Point | null => {
    if (!before) return after;
    if (!after) return before;
    const smooth = before[0] * after[0] + before[1] * after[1] + before[2] * after[2] >= CREASE_COS;
    if (!smooth) return side > 0 ? after : before;
    return unit([before[0] + after[0], before[1] + after[1], before[2] + after[2]]);
  };
  return (station: number, row: number, stationSide: number, rowSide: number): Point | null => {
    const here = grid[station][row];
    const along = tangent(between(grid[station - 1]?.[row], here), between(here, grid[station + 1]?.[row]), stationSide);
    const up = tangent(between(grid[station][row - 1], here), between(here, grid[station][row + 1]), rowSide);
    if (!along || !up) return null;
    return unit([along[1] * up[2] - along[2] * up[1], along[2] * up[0] - along[0] * up[2], along[0] * up[1] - along[1] * up[0]]);
  };
}

/** `ground` is the height of the car's own origin above the road, negated: y in the car is height + ground. */
export function buildBody(spec: BodySpec, ground: number, detail: BodyDetail): Soup {
  const curves: Curves = {
    shelf: spec.shelf ? curve(spec.shelf) : () => 0,
    scoop: spec.scoop ? curve(spec.scoop) : () => 0,
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
  const ribs = stations.map((station) => ribOf(spec, curves, station, false, detail.fine));
  const grid: Point[][] = ribs.map((rib, index) => {
    const station = stations[index];
    const width = curves.halfWidth(station.z);
    return rows.map((row): Point => {
      const [x, h] = rowAt(rib, row);
      return [x, h + ground, pulledZ(spec, station.z, x, width, Math.min(zFront, zNose), zRear)];
    });
  });
  const railAt = rows.indexOf(ROWS.rail);
  // The lowest of a rib's top rows: a hood that dips between raised fenders is lower in the middle than at its rail.
  const topOf = (index: number) => (stations[index].bed ? grid[index][railAt][1] : Math.min(...grid[index].slice(railAt).map(([, y]) => y)));
  // The floor follows the arches up, but never through a hood lower than them: there it runs under the hood.
  const floorAt = (index: number, [x, y, z]: Point): Point => [x, Math.min(y, Math.max(curves.sill(stations[index].z) + ground, topOf(index) - 0.04)), z];

  const normalAt = detail.fine ? loftNormals(grid) : null;

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
        if (row === ROWS.belt && open) return spec.shelf ? "paint" : spec.beltSurface;
        if (row === ROWS.windowBase && open) return inPillar(midZ) ? "trim" : "glass";
        if (row === ROWS.windowTop && open) return spec.pillarSurface;
        if (station.bed && row >= ROWS.rail) return spec.bedSurface ?? "trim";
        return "paint";
      };
      const corners: [Point, Point, Point, Point] = [grid[index][at], grid[index][at + 1], grid[index + 1][at + 1], grid[index + 1][at]];
      if (normalAt) builder.mirroredSmoothQuad(corners, [normalAt(index, at, 1, 1), normalAt(index, at + 1, 1, -1), normalAt(index + 1, at + 1, -1, -1), normalAt(index + 1, at, -1, 1)], surfaceOf());
      else builder.mirroredQuad(...corners, surfaceOf());
    }
    const [a, b] = [floorAt(index, grid[index][0]), floorAt(index + 1, grid[index + 1][0])];
    builder.quad(a, b, [-b[0], b[1], b[2]], [-a[0], a[1], a[2]], "under", under);
  }

  // Each well's inner wall, kept under the hood: a low nose would have it through the paint.
  const wellX = spec.trackM / 2 - spec.tyreWidthM / 2 - 0.03;
  const radius = spec.wheelRadiusM + spec.archClearM;
  const wall = builder.newGroup();
  for (const axle of spec.openWheels ? [] : spec.axleZ) {
    const low = spec.sill[0][1] + ground;
    const high = spec.wheelRadiusM + radius + ground + 0.03;
    const inWell = stations.map((station, index) => ({ z: station.z, top: Math.min(high, topOf(index) - 0.04) })).filter(({ z }) => Math.abs(z - axle) <= radius);
    inWell.slice(1).forEach(({ z, top }, index) => {
      const before = inWell[index];
      if (z > before.z) builder.mirroredQuad([wellX, low, before.z], [wellX, before.top, before.z], [wellX, top, z], [wellX, low, z], "under", wall);
    });
  }

  // Fenders before the decals, so a lamp can sit on one.
  for (const fender of spec.fenders ?? []) addFender(builder, spec, fender, ground, detail.fine);
  for (const decal of spec.decals) if (detail.fine || !decal.fine) addDecal(builder, ground, decal);
  if (detail.fine) addExhausts(builder, spec, ground);
  addMirrors(builder, spec, ground, detail.fine);
  addWing(builder, spec, ground);
  addRoofBars(builder, spec, curves, ground);
  for (const block of spec.blocks ?? []) if (detail.fine || !block.fine) addBlock(builder, block, ground, detail.outwardBlocks);
  for (const strut of spec.struts ?? []) if (detail.fine || !strut.fine) addStrut(builder, strut, ground, detail.fine);
  if (detail.cabin && spec.cabin) addCabin(builder, spec, spec.cabin, ground);
  return builder.finish(detail.creaseDeg);
}

/** How far the stand-in's outline may stray from its near version's silhouette, between the places its surfaces change. */
const DISTANT_OUTLINE_M = 0.1;
/** How far each of the stand-in's stuck-on faces stands off what it's stuck on, so no two share a plane. */
const DISTANT_LIFT_M = 0.012;

/** The faces of `soup` of one surface at one end of the car, right side only: their box across and up. */
function lensBox(soup: Soup, surface: Surface, end: "front" | "rear") {
  const id = SURFACES.indexOf(surface);
  const box = { x: [Infinity, -Infinity], y: [Infinity, -Infinity] };
  for (let vertex = 0; vertex < soup.surfaces.length; vertex++) {
    const [x, y, z] = soup.positions.subarray(vertex * 3, vertex * 3 + 3);
    if (soup.surfaces[vertex] !== id || x < 0 || (end === "front") !== z < 0) continue;
    box.x = [Math.min(box.x[0], x), Math.max(box.x[1], x)];
    box.y = [Math.min(box.y[0], y), Math.max(box.y[1], y)];
  }
  return box.x[0] === Infinity ? null : (box as { x: [number, number]; y: [number, number] });
}

/** The points of a polyline in (z, h) that keep it within `tolerance`, by Douglas–Peucker. */
function simplified(points: readonly SilhouettePoint[], tolerance: number): SilhouettePoint[] {
  if (points.length < 3) return [...points];
  const [first, last] = [points[0], points[points.length - 1]];
  const length = Math.hypot(last.z - first.z, last.h - first.h);
  let [far, farthest] = [0, -1];
  points.slice(1, -1).forEach((point, index) => {
    const off = length === 0 ? Math.hypot(point.z - first.z, point.h - first.h) : Math.abs((last.z - first.z) * (first.h - point.h) - (first.z - point.z) * (last.h - first.h)) / length;
    if (off > far) [far, farthest] = [off, index + 1];
  });
  if (far <= tolerance) return [first, last];
  return [...simplified(points.slice(0, farthest + 1), tolerance).slice(0, -1), ...simplified(points.slice(farthest), tolerance)];
}

/** A quad turned to face `outward`. */
function facingQuad(builder: SoupBuilder, corners: readonly [Point, Point, Point, Point], outward: Point, surface: Surface, group = 0) {
  const [a, b, c, d] = corners;
  const normal = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
  if (normal[0] * outward[0] + normal[1] * outward[1] + normal[2] * outward[2] >= 0) builder.quad(a, b, c, d, surface, group);
  else builder.quad(d, c, b, a, surface, group);
}

const flipped = ([x, y, z]: Point): Point => [-x, y, z];

/** A stretch of the near silhouette shorter than this takes its neighbour's surfaces on the stand-in. */
const DISTANT_STRETCH_M = 0.2;
/** An end of the silhouette this close over the sill is a bumper's foot, which the stand-in leaves off. */
const DISTANT_FOOT_M = 0.12;
/** A block's face smaller than this is left off the stand-in. */
const DISTANT_FACE_M2 = 0.04;

/** What a stretch of the silhouette is across its top, and down its sides above the belt, if not paint or the side glass. */
interface Stretch {
  top: Surface;
  upper: Surface | null;
}

interface Run {
  from: number;
  to: number;
  length: number;
}

/**
 * A car at a distance: its near version simplified, read at the size its swap leaves it. Its outline is the
 * silhouette's own firm points, thinned between the places where the near version's surfaces change, so its
 * glass (screen, side windows and rear window) and its lamps lie where the near version's do; a dark wheel with its
 * tread stands where each wheel is, the head and tail lamps are faces on the shell where `near` has its lenses,
 * and what stands on the body (a rack, a sign) is a box.
 */
export function buildDistant(spec: BodySpec, ground: number, near: Soup): Soup {
  const curves = { sill: curve(spec.sill), belt: curve(spec.belt), halfWidth: curve(spec.halfWidth), railWidth: curve(spec.railWidth), crown: curve(spec.crown) };
  const firm = spec.silhouette.filter((point) => !point.fine);
  const across = (point: SilhouettePoint, row: number) => (point.band === undefined ? undefined : spec.bands[point.band].find(({ from, to }) => row >= from && row < to)?.surface);
  const stretchOf = (point: SilhouettePoint): Stretch => (point.bed ? { top: spec.bedSurface ?? "trim", upper: "paint" } : { top: across(point, ROWS.roofInner) ?? "paint", upper: across(point, ROWS.windowBase) ?? null });
  const same = (a: Stretch, b: Stretch) => a.top === b.top && a.upper === b.upper;

  // The near silhouette's stretches of one look, the shortest taking its longer neighbour's until none is too short.
  const segments = firm.slice(1).map((point, index) => ({ look: stretchOf(firm[index]), length: Math.hypot(point.z - firm[index].z, point.h - firm[index].h) }));
  const runsOf = () => {
    const runs: Run[] = [];
    segments.forEach(({ look, length }, index) => {
      const last = runs.at(-1);
      if (last && same(segments[last.from].look, look)) Object.assign(last, { to: index + 1, length: last.length + length });
      else runs.push({ from: index, to: index + 1, length });
    });
    return runs;
  };
  for (let runs = runsOf(); runs.length > 1; runs = runsOf()) {
    const shortest = runs.reduce((best, run) => (run.length < best.length ? run : best));
    if (shortest.length >= DISTANT_STRETCH_M) break;
    const at = runs.indexOf(shortest);
    const neighbours = [runs.at(at - 1), runs.at(at + 1)].filter((run, side): run is Run => run !== undefined && (side === 0 ? at > 0 : true));
    const taken = neighbours.reduce((best, run) => (run.length > best.length ? run : best));
    for (let index = shortest.from; index < shortest.to; index++) segments[index].look = segments[taken.from].look;
  }
  const path: SilhouettePoint[] = [];
  const looks: Stretch[] = [];
  for (const run of runsOf()) {
    const points = simplified(firm.slice(run.from, run.to + 1), DISTANT_OUTLINE_M);
    path.push(...(path.length === 0 ? points : points.slice(1)));
    looks.push(...points.slice(1).map(() => segments[run.from].look));
  }
  // A bumper's foot tucked under it is left off: each end is shut by a face of the foot's own surface instead.
  const footOf = (at: number) => path[at].h - curves.sill(path[at].z) < DISTANT_FOOT_M;
  const caps: [Surface | null, Surface | null] = [null, null];
  while (path.length > 3 && footOf(0)) {
    path.shift();
    caps[0] = looks.shift()?.top ?? null;
  }
  while (path.length > 3 && footOf(path.length - 1)) {
    path.pop();
    caps[1] = looks.pop()?.top ?? null;
  }

  const ends = spec.silhouette.map((point) => point.z);
  const [front, rear] = [Math.min(...ends), Math.max(...ends)];
  const ribs = path.map(({ z, h: centre }): Point[] => {
    // Fenders that stand above a hood between them are the outline from the side, so the stand-in's edge is theirs.
    const h = centre + Math.max(0, -curves.crown(z));
    const width = curves.halfWidth(z) + 0.01;
    const bottom = Math.min(curves.sill(z), h);
    const belt = Math.min(Math.max(curves.belt(z), bottom), h);
    const rail = Math.min(curves.railWidth(z), width);
    // The nose's and the tail's corners pulled back as the near version's are.
    const pulled = (x: number) => pulledZ(spec, z, x, curves.halfWidth(z), front, rear);
    return [
      [width, bottom + ground, pulled(width)],
      [width, belt + ground, pulled(width)],
      [rail, h + ground, pulled(rail)],
    ];
  });
  const builder = new SoupBuilder();
  // The paint shades smooth across its gentle bends, as the near version's does, but glass keeps its own flat faces: a
  // pane's normal bent towards the paint beside it catches the sky where the near version's doesn't.
  const glass = builder.newGroup();
  const groupOf = (surface: Surface) => (surface === "glass" ? glass : 0);
  const both = (corners: readonly [Point, Point, Point, Point], outward: Point, surface: Surface) => {
    facingQuad(builder, corners, outward, surface, groupOf(surface));
    facingQuad(builder, [flipped(corners[3]), flipped(corners[2]), flipped(corners[1]), flipped(corners[0])], flipped(outward), surface, groupOf(surface));
  };
  const inWindow = (z: number) => z > spec.windowZ[0] && z < spec.windowZ[1];
  ribs.slice(1).forEach((rib, at) => {
    const before = ribs[at];
    const [from, to, look] = [path[at], path[at + 1], looks[at]];
    // Out from the silhouette, the way the path goes round the car from the nose's foot over the roof to the tail's.
    const out: Point = [0, to.z - from.z, -(to.h - from.h)];
    both([before[0], before[1], rib[1], rib[0]], [1, 0, 0], "paint");
    const glassy = inWindow((from.z + to.z) / 2) && before[2][1] - before[1][1] > 0.05 && rib[2][1] - rib[1][1] > 0.05;
    both([before[1], before[2], rib[2], rib[1]], [1, out[1], out[2]], look.upper ?? (glassy ? "glass" : "paint"));
    facingQuad(builder, [before[2], flipped(before[2]), flipped(rib[2]), rib[2]], out, look.top, groupOf(look.top));
  });
  for (const [rib, outward, surface] of [[ribs[0], -1, caps[0]], [ribs[ribs.length - 1], 1, caps[1]]] as const) {
    if (surface === null) continue;
    facingQuad(builder, [rib[0], rib[1], flipped(rib[1]), flipped(rib[0])], [0, 0, outward], surface);
    facingQuad(builder, [rib[1], rib[2], flipped(rib[2]), flipped(rib[1])], [0, 0, outward], surface);
  }

  // The near version's lamps, as faces on the shell where its lenses are: in two across where the shell's end bends at
  // its roof's edge, so the shell can't stand through a lamp.
  const lamps = (["lensHead", "lensTail"] as const).flatMap((surface) => {
    const end = surface === "lensHead" ? "front" : "rear";
    const box = lensBox(near, surface, end);
    if (box === null) return [];
    const bend = curves.railWidth(end === "front" ? front : rear);
    const pieces: [number, number][] = bend > box.x[0] && bend < box.x[1] ? [[box.x[0], bend], [bend, box.x[1]]] : [box.x];
    return pieces.flatMap((across) => {
      const corners = onEnd(builder, end, across, box.y);
      return corners ? [{ surface, corners, out: end === "front" ? -1 : 1 }] : [];
    });
  });
  for (const { surface, corners, out } of lamps) both(corners, [0, 0, out], surface);

  for (const block of spec.blocks ?? []) if (!block.fine) addDistantBlock(builder, block, ground);

  // Each wheel as the near version shows it in its arch: a dark face as big as its tyre.
  const archR = spec.wheelRadiusM + spec.archClearM;
  // A hexagon this many times the tyre's radius across its corners covers what the tyre does.
  const evenArea = Math.sqrt((2 * Math.PI) / (3 * Math.sqrt(3)));
  for (const axle of spec.axleZ) {
    let side = spec.trackM / 2 + spec.tyreWidthM / 2;
    for (let step = 0; step <= 8; step++) side = Math.max(side, curves.halfWidth(axle - archR + (archR * step) / 4) + 0.01);
    const x = side + DISTANT_LIFT_M;
    const hexagon: Point[] = [0, 1, 2, 3, 4, 5].map((corner) => {
      const angle = (corner * Math.PI) / 3;
      return [x, spec.wheelRadiusM + ground + Math.sin(angle) * spec.wheelRadiusM * evenArea, axle + Math.cos(angle) * spec.wheelRadiusM * evenArea];
    });
    both([hexagon[0], hexagon[1], hexagon[2], hexagon[3]], [1, 0, 0], "tyre");
    both([hexagon[3], hexagon[4], hexagon[5], hexagon[0]], [1, 0, 0], "tyre");
    // Its tread below the body, where the tyre shows from in front and behind.
    const inner = spec.trackM / 2 - spec.tyreWidthM / 2;
    for (const [top, bottom] of [[hexagon[3], hexagon[4]], [hexagon[0], hexagon[5]]]) {
      const outward: Point = [0, -Math.abs(top[2] - axle) / 2, top[2] - axle];
      both([top, bottom, [inner, bottom[1], bottom[2]], [inner, top[1], top[2]]], outward, "tyre");
    }
  }
  return builder.finish(25);
}

/** A block on the stand-in: a box with no floor, and none of its faces too small to see from where it stands in. */
function addDistantBlock(builder: SoupBuilder, block: Block, ground: number) {
  const { at, size, surface, mirror, taper = [1, 1] } = block;
  for (const side of mirror ? [1, -1] : [1]) {
    const x = side * at[0];
    const ring = (z: number, wide: number, tall: number): Point[] => {
      const y = blockMiddle(block, tall) + ground;
      return [
        [x - wide / 2, y - tall / 2, z],
        [x + wide / 2, y - tall / 2, z],
        [x + wide / 2, y + tall / 2, z],
        [x - wide / 2, y + tall / 2, z],
      ];
    };
    const [front, back] = [ring(at[2] - size[2] / 2, size[0], size[1]), ring(at[2] + size[2] / 2, size[0] * taper[0], size[1] * taper[1])];
    const faces: [readonly [Point, Point, Point, Point], Point][] = [
      [[front[0], front[1], front[2], front[3]], [0, 0, -1]],
      [[back[0], back[1], back[2], back[3]], [0, 0, 1]],
      [[front[3], front[2], back[2], back[3]], [0, 1, 0]],
      [[front[1], back[1], back[2], front[2]], [1, 0, 0]],
      [[front[0], back[0], back[3], front[3]], [-1, 0, 0]],
    ];
    for (const [corners, outward] of faces) {
      const [a, b, , d] = corners;
      if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]) >= DISTANT_FACE_M2) facingQuad(builder, corners, outward, surface);
    }
  }
}

/** How far a face on a stand-in's end may move in from where it's wanted, where the end narrows. */
const END_FIT_STEPS = 6;

/** A rectangle across `x` and up `y` laid on the shell's end, each corner a little proud of the face behind it, or null where it can't be fitted. */
function onEnd(shell: SoupBuilder, end: "front" | "rear", x: readonly [number, number], y: readonly [number, number]): [Point, Point, Point, Point] | null {
  const out = end === "front" ? -1 : 1;
  // Each corner comes in towards the middle of the rectangle's width until there is a face behind it.
  const middle = (x[0] + x[1]) / 2;
  const fitted = ([[x[0], y[0]], [x[1], y[0]], [x[1], y[1]], [x[0], y[1]]] as const).map(([across, up]) => {
    for (let step = 0; step <= END_FIT_STEPS; step++) {
      const at = across + ((middle - across) * step) / END_FIT_STEPS;
      const hit = shell.raycast([at, up, out * 10], [0, 0, -out]);
      if (hit) return [at, up, hit[2] + out * DISTANT_LIFT_M] as Point;
    }
    return null;
  });
  return fitted.every((corner) => corner !== null) ? (fitted as [Point, Point, Point, Point]) : null;
}
