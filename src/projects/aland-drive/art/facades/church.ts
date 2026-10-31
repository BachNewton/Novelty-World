import { createBuilder, seeded, type MeshBuilder, type Paint, type Vec2, type Vec3 } from "../landmarks/kit";
import type { Landmark } from "../landmarks/landmark";
import YARDS from "./church-yards.json";
import IDS from "./facade-ids.json";
import { merged, onBearing, painter, type Inks, type Painter } from "./paint";
import type { ChurchSpec, TowerRoof } from "./churches";

/*
 * An Åland medieval stone church from a record of its sizes: a tall nave of pink-grey rapakivi under a steep shingled
 * roof, whitewashed window reveals and blind niches in its gables, a lower chancel or a plastered apse, a sacristy and a
 * porch, a massive tower of the same stone with one of a few roofs, and a low wall round the yard, which follows the
 * ground. The model's +x runs east along the nave, +z south, from the middle of the ridge.
 */

const FAR_FROM_M = 700;
const ROOF_ROWS = 7;
const ROOF_COLUMNS = 6;
const SINK_M = 1;
const WALL_M = 1.15;
const WALL_THICK_M = 0.9;
const WALL_STEP_M = 14;
const GATE_M = 3;

type Height = (east: number, north: number) => number;

/**
 * Stone faces, kept apart from the rest of the model because each is a wall to the facade shader, which lays the courses:
 * its vertices carry where they are on the wall, and the tint says granite. A whitewashed church stays flat paint.
 */
function stoneMason(frame: ReturnType<typeof onBearing>, tint: Paint, flat: Paint) {
  const mesh = createBuilder(frame);
  const faces: { width: number; height: number; apex: boolean }[] = [];
  return {
    wall(a: Vec2, b: Vec2, bottom: number, top: number) {
      mesh.wall(a, b, bottom, top, flat);
      faces.push({ width: Math.hypot(b[0] - a[0], b[1] - a[1]), height: top - bottom, apex: false });
    },
    /** A quad whose foot and head follow the ground. */
    run(a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
      mesh.quad(a, b, c, d, flat);
      faces.push({ width: Math.hypot(b[0] - a[0], b[2] - a[2]), height: d[1] - a[1], apex: false });
    },
    gable(a: Vec3, b: Vec3, apex: Vec3) {
      mesh.tri(a, b, apex, flat);
      faces.push({ width: Math.hypot(b[0] - a[0], b[2] - a[2]), height: apex[1] - a[1], apex: true });
    },
    done() {
      const built = mesh.done();
      let at = 0;
      for (const { width, height, apex } of faces) {
        if (tint[3] !== 0) {
          const corners = apex
            ? [
                [0, 0],
                [width, 0],
                [width / 2, height],
              ]
            : [
                [0, 0],
                [width, 0],
                [width, height],
                [0, height],
              ];
          corners.forEach(([along, up]) => {
            built.facades.set([along, up, width, height], at * 4);
            built.tints.set(tint, at * 4);
            at++;
          });
        }
      }
      return built;
    },
  };
}

type Mason = ReturnType<typeof stoneMason>;

/** A shingled roof plane, in rows, so a big roof isn't one flat colour. */
function shingled(mesh: MeshBuilder, paint: Painter, eavesA: Vec3, eavesB: Vec3, ridgeB: Vec3, ridgeA: Vec3, base: string, seed: number, rows = ROOF_ROWS, columns = ROOF_COLUMNS) {
  const random = seeded(seed);
  const at = (u: number, v: number): Vec3 => {
    const low = [0, 1, 2].map((part) => eavesA[part] + (eavesB[part] - eavesA[part]) * u);
    const high = [0, 1, 2].map((part) => ridgeA[part] + (ridgeB[part] - ridgeA[part]) * u);
    return [low[0] + (high[0] - low[0]) * v, low[1] + (high[1] - low[1]) * v, low[2] + (high[2] - low[2]) * v];
  };
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const [u0, u1, v0, v1] = [column / columns, (column + 1) / columns, row / rows, (row + 1) / rows];
      mesh.quad(at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1), paint(base, 0.86 + random() * 0.32));
    }
  }
}

/** A long gabled body with stone walls, white niches in its gables, and a shingled roof. */
function hall(mesh: MeshBuilder, paint: Painter, mason: Mason, spec: { from: number; to: number; halfWide: number; eaves: number; ridge: number }, seed: number, closed: { west: boolean; east: boolean }, windows: number) {
  const { from, to, halfWide, eaves, ridge } = spec;
  const [nw, ne, se, sw]: Vec2[] = [
    [from, -halfWide],
    [to, -halfWide],
    [to, halfWide],
    [from, halfWide],
  ];
  const wall = (a: Vec2, b: Vec2) => {
    mason.wall(a, b, -SINK_M, eaves);
  };
  wall(nw, ne);
  wall(se, sw);
  wall(ne, se);
  wall(sw, nw);
  const lime = paint("church-limewash");
  const dark = paint("wall-glass", 1.2);
  // Deep windows on the south wall and a few on the north, each a white reveal round dark glass.
  for (let at = 0; at < windows; at++) {
    const x = from + ((at + 0.5) / windows) * (to - from);
    for (const [z, count] of [
      [halfWide + 0.03, 2],
      [-halfWide - 0.03, 1],
    ] as const) {
      if (z < 0 && at % 2 === count) continue;
      const tall = Math.min(eaves * 0.46, 3.2);
      mesh.wall([x - 0.72, z], [x + 0.72, z], eaves * 0.3 - 0.2, eaves * 0.3 + tall + 0.25, lime);
      const inner = z + Math.sign(z) * 0.02;
      mesh.wall([x - 0.48, inner], [x + 0.48, inner], eaves * 0.3, eaves * 0.3 + tall, dark);
    }
  }
  const overhang = 0.35;
  const low = eaves - 0.2;
  shingled(mesh, paint, [from - overhang, low, -halfWide - overhang], [to + overhang, low, -halfWide - overhang], [to + overhang, ridge, 0], [from - overhang, ridge, 0], "church-shingle", seed);
  shingled(mesh, paint, [from - overhang, low, halfWide + overhang], [to + overhang, low, halfWide + overhang], [to + overhang, ridge, 0], [from - overhang, ridge, 0], "church-shingle", seed + 7);
  // Gables of the same stone in a single sweep, with a row of white blind niches stepping to the peak.
  const gable = (x: number, push: number) => {
    mason.gable([x, eaves, -halfWide], [x, eaves, halfWide], [x, ridge, 0]);
    const niches = 3;
    const mid = eaves + (ridge - eaves) * 0.34;
    for (let niche = 0; niche < niches; niche++) {
      const z = (niche - (niches - 1) / 2) * halfWide * 0.46;
      const height = (ridge - eaves) * (niche === 1 ? 0.5 : 0.28);
      const bottom = mid - (ridge - eaves) * 0.1;
      mesh.quad([x + push, bottom, z - 0.42], [x + push, bottom, z + 0.42], [x + push, bottom + height, z + 0.42], [x + push, bottom + height, z - 0.42], lime);
      mesh.tri([x + push, bottom + height, z - 0.42], [x + push, bottom + height, z + 0.42], [x + push, bottom + height + 0.5, z], lime);
    }
  };
  if (closed.west) gable(from, -0.05);
  if (closed.east) gable(to, 0.05);
}

function towerRoof(mesh: MeshBuilder, paint: Painter, kind: TowerRoof, centre: Vec2, halfX: number, halfZ: number, from: number, top: number, seed: number) {
  const shingle = paint("church-shingle", 1.05);
  const pale = paint("church-shingle-pale");
  const tar = paint("church-tar", 1.2);
  const half = Math.max(halfX, halfZ);
  const [x, z] = centre;
  const corners: Vec3[] = [
    [x - halfX, from, z - halfZ],
    [x + halfX, from, z - halfZ],
    [x + halfX, from, z + halfZ],
    [x - halfX, from, z + halfZ],
  ];
  const random = seeded(seed);
  const panels = (rings: readonly (readonly [number, number])[]) => {
    // A square foot rising into the turned shape: four faces with their corners cut, then the shape.
    for (let band = 0; band + 1 < rings.length; band++) {
      const [lowR, lowY] = rings[band];
      const [highR, highY] = rings[band + 1];
      const ring = (radius: number, y: number, at: number): Vec3 => {
        const angle = Math.PI / 4 + (at * Math.PI) / 2;
        return [x + Math.cos(angle) * radius * Math.SQRT2, y, z + Math.sin(angle) * radius * Math.SQRT2];
      };
      for (let side = 0; side < 4; side++) {
        const shade = side % 2 === 0 ? shingle : paint("church-shingle", 0.92 + random() * 0.1);
        if (highR < 0.02) mesh.tri(ring(lowR, lowY, side), ring(lowR, lowY, side + 1), [x, highY, z], shade);
        else mesh.quad(ring(lowR, lowY, side), ring(lowR, lowY, side + 1), ring(highR, highY, side + 1), ring(highR, highY, side), shade);
      }
    }
  };
  const rise = top - from;
  if (kind === "pyramid" || kind === "hood") {
    const flare = kind === "hood" ? 0.28 : 0.08;
    const waist = kind === "hood" ? 0.22 : 0.5;
    panels([
      [half * 1.08, from - 0.3],
      [half * (1 - flare) * 0.86, from + rise * waist * 0.6],
      [0, top],
    ]);
  } else if (kind === "spire") {
    panels([
      [half * 1.06, from - 0.3],
      [half * 0.62, from + rise * 0.16],
      [half * 0.2, from + rise * 0.58],
      [0, top],
    ]);
  } else if (kind === "crown") {
    panels([
      [half * 1.04, from - 0.2],
      [half * 0.5, from + rise * 0.22],
      [half * 0.14, from + rise * 0.62],
      [0, top],
    ]);
    for (const [cornerX, , cornerZ] of corners) {
      const place: Vec2 = [cornerX * 0.9 + x * 0.1, cornerZ * 0.9 + z * 0.1];
      mesh.lathe(
        place,
        [
          [0.5, from - 0.4],
          [0.5, from + 1.2],
          [0, from + rise * 0.3],
        ],
        4,
        [pale, shingle],
        Math.PI / 4,
      );
    }
  } else {
    // A Baroque spire: a swelling bell, a neck, a small lantern and a needle.
    mesh.lathe(
      [x, z],
      [
        [half * 1.02, from - 0.2],
        [half * 0.8, from + rise * 0.1],
        [half * 0.88, from + rise * 0.2],
        [half * 0.38, from + rise * 0.34],
        [half * 0.3, from + rise * 0.46],
        [half * 0.42, from + rise * 0.5],
        [half * 0.14, from + rise * 0.66],
        [0, top],
      ],
      8,
      [shingle, pale, shingle, tar, pale, shingle, shingle],
      Math.PI / 8,
    );
  }
  // An iron cross at the top.
  mesh.box([x, top + 0.45, z], [0.07, 0.9, 0.07], tar);
  mesh.box([x, top + 0.55, z], [0.07, 0.07, 0.5], tar);
}

function tower(mesh: MeshBuilder, paint: Painter, mason: Mason, spec: ChurchSpec["tower"], seed: number) {
  const { x, z, halfX, halfZ, stone: stoneTop, top, roof } = spec;
  const outline: Vec2[] = [
    [x - halfX, z - halfZ],
    [x + halfX, z - halfZ],
    [x + halfX, z + halfZ],
    [x - halfX, z + halfZ],
  ];
  outline.forEach((corner, at) => {
    mason.wall(corner, outline[(at + 1) % 4], -SINK_M, stoneTop);
  });
  const lime = paint("church-limewash");
  const dark = paint("church-tar");
  const belfry = stoneTop - 2.2;
  // A slit on each face high up, a white surround round a dark opening, and a portal in the west face.
  for (const [a, b] of [
    [[x - halfX - 0.04, z - 0.6], [x - halfX - 0.04, z + 0.6]],
    [[x + halfX + 0.04, z - 0.6], [x + halfX + 0.04, z + 0.6]],
    [[x - 0.6, z - halfZ - 0.04], [x + 0.6, z - halfZ - 0.04]],
    [[x - 0.6, z + halfZ + 0.04], [x + 0.6, z + halfZ + 0.04]],
  ] as [Vec2, Vec2][]) {
    mesh.wall(a, b, belfry - 0.3, belfry + 1.6, lime);
    const narrow = (share: number): Vec2 => [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share];
    const out = a[0] === b[0] ? Math.sign(a[0] - x) * 0.02 : 0;
    const outZ = a[1] === b[1] ? Math.sign(a[1] - z) * 0.02 : 0;
    const [left, right] = [narrow(0.28), narrow(0.72)];
    mesh.wall([left[0] + out, left[1] + outZ], [right[0] + out, right[1] + outZ], belfry, belfry + 1.3, dark);
  }
  if (roof !== "belfry") {
    mesh.wall([x - halfX - 0.04, z - 1.05], [x - halfX - 0.04, z + 1.05], 0, 3.1, lime);
    mesh.wall([x - halfX - 0.06, z - 0.72], [x - halfX - 0.06, z + 0.72], 0, 2.5, paint("church-door"));
  }
  towerRoof(mesh, paint, roof === "belfry" ? "hood" : roof, [x, z], halfX, halfZ, stoneTop, top, seed);
}

/** A low room against a wall, with its roof at right angles to it, or running with it. */
function annex(mesh: MeshBuilder, paint: Painter, mason: Mason, room: { x: number; z: number; halfX: number; halfZ: number; eaves: number; ridge: number }, seed: number) {
  const { x, z, halfX, halfZ, eaves, ridge } = room;
  const outline: Vec2[] = [
    [x - halfX, z - halfZ],
    [x + halfX, z - halfZ],
    [x + halfX, z + halfZ],
    [x - halfX, z + halfZ],
  ];
  outline.forEach((corner, at) => {
    mason.wall(corner, outline[(at + 1) % 4], -SINK_M, eaves);
  });
  shingled(mesh, paint, [x - halfX - 0.25, eaves, z - halfZ], [x - halfX - 0.25, eaves, z + halfZ], [x, ridge, z + halfZ], [x, ridge, z - halfZ], "church-shingle-pale", seed, 3, 2);
  shingled(mesh, paint, [x + halfX + 0.25, eaves, z - halfZ], [x + halfX + 0.25, eaves, z + halfZ], [x, ridge, z + halfZ], [x, ridge, z - halfZ], "church-shingle-pale", seed + 3, 3, 2);
  for (const end of [z - halfZ, z + halfZ]) mesh.tri([x - halfX, eaves, end], [x + halfX, eaves, end], [x, ridge, end], paint("church-limewash"));
}

function apse(mesh: MeshBuilder, paint: Painter, from: number, halfWide: number, eaves: number, ridge: number) {
  const lime = paint("church-limewash");
  const sides = 5;
  const points: Vec2[] = Array.from({ length: sides + 1 }, (_, at) => {
    const angle = -Math.PI / 2 + (at / sides) * Math.PI;
    return [from + Math.cos(angle) * halfWide, Math.sin(angle) * halfWide];
  });
  for (let at = 0; at < sides; at++) {
    mesh.wall(points[at], points[at + 1], -SINK_M, eaves, lime);
    mesh.tri([points[at][0], eaves, points[at][1]], [points[at + 1][0], eaves, points[at + 1][1]], [from, ridge, 0], paint("church-shingle", 0.95 + (at % 2) * 0.12));
  }
}

function yardWall(mesh: MeshBuilder, mason: Mason, paint: Painter, spec: ChurchSpec, frame: (x: number, z: number) => number, ring: readonly Vec2[]) {
  const random = seeded(spec.east);
  const longest = ring.reduce((best, point, at) => {
    const next = ring[(at + 1) % ring.length];
    return Math.hypot(next[0] - point[0], next[1] - point[1]) > best.length ? { at, length: Math.hypot(next[0] - point[0], next[1] - point[1]) } : best;
  }, { at: 0, length: 0 });
  ring.forEach((point, at) => {
    const next = ring[(at + 1) % ring.length];
    const length = Math.hypot(next[0] - point[0], next[1] - point[1]);
    const steps = Math.max(1, Math.round(length / WALL_STEP_M));
    const [outX, outZ] = [(next[1] - point[1]) / length, -(next[0] - point[0]) / length];
    for (let step = 0; step < steps; step++) {
      const [s0, s1] = [step / steps, (step + 1) / steps];
      const middle = (s0 + s1) / 2;
      // The gate: a gap in the middle of the longest side.
      if (at === longest.at && Math.abs(middle - 0.5) * length < GATE_M) continue;
      const [ax, az, bx, bz] = [point[0] + (next[0] - point[0]) * s0, point[1] + (next[1] - point[1]) * s0, point[0] + (next[0] - point[0]) * s1, point[1] + (next[1] - point[1]) * s1];
      const [groundA, groundB] = [frame(ax, az), frame(bx, bz)];
      const lift = 0.2 * random();
      mason.run([ax, groundA - 0.5, az], [bx, groundB - 0.5, bz], [bx, groundB + WALL_M + lift, bz], [ax, groundA + WALL_M + lift, az]);
      const [ix, iz, jx, jz] = [ax - outX * WALL_THICK_M, az - outZ * WALL_THICK_M, bx - outX * WALL_THICK_M, bz - outZ * WALL_THICK_M];
      mason.run([ix, groundA - 0.5, iz], [jx, groundB - 0.5, jz], [jx, groundB + WALL_M + lift, jz], [ix, groundA + WALL_M + lift, iz]);
      mesh.quad([ax, groundA + WALL_M + lift, az], [bx, groundB + WALL_M + lift, bz], [jx, groundB + WALL_M + lift, jz], [ix, groundA + WALL_M + lift, iz], paint("church-wall", 1.1));
    }
  });
}

function nearModel(spec: ChurchSpec, paint: Painter, heightAt: Height) {
  const mesh = createBuilder(onBearing(spec.bearing));
  const seed = spec.east;
  const lime = spec.stone === "white";
  const paintAt = IDS.paints.indexOf(spec.stone === "grey" ? "church-granite-grey" : "church-granite");
  const mason = stoneMason(onBearing(spec.bearing), lime ? [0, 0, 0, 0] : [paintAt, 0, Math.round(seed) % 251, IDS.styles.granite], lime ? paint("church-limewash") : paint("church-granite"));
  const { nave, chancel, tower: towerSpec, annexes, transept, plasteredApse } = spec;
  const towerAbuts = towerSpec.z === 0;
  hall(mesh, paint, mason, nave, seed + 1, { west: !towerAbuts, east: !chancel && !plasteredApse }, Math.max(2, Math.round((nave.to - nave.from) / 6)));
  if (chancel) hall(mesh, paint, mason, chancel, seed + 2, { west: true, east: true }, 1);
  if (plasteredApse) apse(mesh, paint, nave.to, nave.halfWide - 0.4, nave.eaves * 0.8, nave.ridge * 0.72);
  if (transept) {
    const { x, halfX, halfZ, eaves, ridge } = transept;
    const ends: Vec2[] = [
      [x - halfX, -halfZ],
      [x + halfX, -halfZ],
      [x + halfX, halfZ],
      [x - halfX, halfZ],
    ];
    ends.forEach((corner, at) => {
      mason.wall(corner, ends[(at + 1) % 4], -SINK_M, eaves);
    });
    shingled(mesh, paint, [x - halfX - 0.3, eaves, -halfZ - 0.3], [x - halfX - 0.3, eaves, halfZ + 0.3], [x, ridge, halfZ + 0.3], [x, ridge, -halfZ - 0.3], "church-shingle", seed + 5);
    shingled(mesh, paint, [x + halfX + 0.3, eaves, -halfZ - 0.3], [x + halfX + 0.3, eaves, halfZ + 0.3], [x, ridge, halfZ + 0.3], [x, ridge, -halfZ - 0.3], "church-shingle", seed + 6);
    for (const end of [-halfZ, halfZ]) mason.gable([x - halfX, eaves, end], [x + halfX, eaves, end], [x, ridge, end]);
  }
  tower(mesh, paint, mason, towerSpec, seed + 3);
  annexes.forEach((room, at) => {
    annex(mesh, paint, mason, room, seed + 20 + at);
  });
  const ring = (YARDS as Record<string, number[][] | null>)[spec.id];
  if (ring) {
    // The ring is east and north from the origin; the wall is built in the model's own frame, so it's turned back.
    const bearing = (spec.bearing * Math.PI) / 180;
    const [sin, cos] = [Math.sin(bearing), Math.cos(bearing)];
    const local = ring.map(([east, north]): Vec2 => [east * sin + north * cos, east * cos - north * sin]);
    const groundAt = (x: number, z: number) => {
      const east = x * sin + z * cos;
      const north = x * cos - z * sin;
      return heightAt(spec.east + east, spec.north + north) - heightAt(spec.east, spec.north);
    };
    yardWall(mesh, mason, paint, spec, groundAt, local);
  }
  return merged(mesh.done(), mason.done());
}

function farModel(spec: ChurchSpec, paint: Painter) {
  const mesh = createBuilder(onBearing(spec.bearing));
  const wall = paint(spec.stone === "white" ? "church-limewash" : "church-granite");
  const roof = paint("church-shingle");
  const { nave, chancel, tower: towerSpec, transept } = spec;
  const body = (from: number, to: number, halfWide: number, eaves: number, ridge: number) => {
    mesh.extrude(
      [
        [from, -halfWide],
        [to, -halfWide],
        [to, halfWide],
        [from, halfWide],
      ],
      -SINK_M,
      eaves,
      wall,
    );
    mesh.gableRoof([from, -halfWide], [to, -halfWide], [to, halfWide], [from, halfWide], eaves, ridge, roof, wall);
  };
  body(nave.from, nave.to, nave.halfWide, nave.eaves, nave.ridge);
  if (chancel) body(chancel.from, chancel.to, chancel.halfWide, chancel.eaves, chancel.ridge);
  if (transept) {
    mesh.box([transept.x, (transept.eaves - SINK_M) / 2, 0], [transept.halfX * 2, transept.eaves + SINK_M, transept.halfZ * 2], wall, 0, roof);
  }
  const { x, z, halfX, halfZ, stone: stoneTop, top } = towerSpec;
  mesh.box([x, (stoneTop - SINK_M) / 2, z], [halfX * 2, stoneTop + SINK_M, halfZ * 2], wall, 0, roof);
  mesh.lathe(
    [x, z],
    [
      [Math.max(halfX, halfZ) * Math.SQRT2, stoneTop],
      [0, top],
    ],
    4,
    roof,
    Math.PI / 4,
  );
  return mesh.done();
}

export function buildChurch(spec: ChurchSpec, inks: Inks, heightAt: Height): Landmark {
  const paint = painter(inks);
  return { id: spec.id, name: spec.name, east: spec.east, north: spec.north, baseM: heightAt(spec.east, spec.north), near: nearModel(spec, paint, heightAt), far: farModel(spec, paint), farFromM: FAR_FROM_M };
}
