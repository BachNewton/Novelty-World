import IDS from "../facades/facade-ids.json";
import { merged } from "../facades/paint";
import {
  blend,
  createBuilder,
  flat,
  seeded,
  type LandmarkMesh,
  type MeshBuilder,
  type Paint,
  type Vec2,
  type Vec3,
} from "./kit";
import type { Landmark } from "./landmark";

/*
 * Bomarsund, the Russian fortress the British and French took and blew up in 1854, in two pieces. The main fort was a
 * 290 m horseshoe of two-storey casemated barracks, brick behind a face of big granite blocks; what stands is broken
 * stretches of that wall on the great arc either side of the road, each here where the 2025 aerial photo has it, with
 * its embrasures, the stubs of the casemates' walls behind it and its fallen stone at its foot. Notvik tower, on the
 * height to the north, was one of its round gun towers: two storeys of casemates round a court, granite outside and
 * brick inside, its arcaded side over the northern approach still standing to its full height, the rest of the ring
 * broken down to its lower storey.
 */

/** Each stretch of the main fort's wall: its ends, east and north of the origin, and the ground there, above the base. */
const STRETCHES: readonly (readonly [
  number,
  number,
  number,
  number,
  number,
])[] = [
  [-60, 68.8, -46, 70, 1],
  [-84, 42, -81.2, 26, 1.5],
  [-68.8, 7.2, -63.2, -1.2, 0.8],
  [104.8, 88.8, 117.2, 66, 0.9],
  [116.8, 44.8, 116, 22, 1.9],
  [111.2, 0.8, 102, -12.8, 0.2],
  [-128.8, -96, -118.8, -106.8, 0.1],
  [-100, -120, -78, -130, 1.9],
  [-60, -132, -40.8, -131.2, 1.3],
  [-23.2, -126, 16, -104, 1.6],
  [66, -58, 74, -52, 1.3],
];

const FORT_BASE_M = 5;
const WALL_THICK = 3;
const SINK = 1.5;
const COLUMN_M = 2.6;
/** Near columns to a far one. */
const FAR_SPAN = 3;
const EMBRASURE = { half: 0.55, sill: 1.1, head: 2.5, deep: 0.9 };

const GRANITE_PAINT = IDS.paints.indexOf("church-granite");

/**
 * Granite faces, apart from the rest of a model because the facade shader lays their courses: each vertex carries where
 * it lies on its wall, metres along it and above the ground, and the tint says granite. Far off the courses blur to the
 * stone's mean, so a near and a far face drawn this way match.
 */
function masonry(seed: number) {
  const mesh = createBuilder();
  const places: Vec2[] = [];
  const tint: Paint = [GRANITE_PAINT, 0, seed % 251, IDS.styles.granite];
  return {
    /** An upright face from plan point a to b, `from` to `to` metres along its wall, its top at each end given. */
    face(
      a: Vec2,
      b: Vec2,
      from: number,
      to: number,
      bottom: number,
      topA: number,
      topB: number,
      ground: number,
    ) {
      mesh.quad(
        [a[0], bottom, a[1]],
        [b[0], bottom, b[1]],
        [b[0], topB, b[1]],
        [a[0], topA, a[1]],
        tint,
      );
      places.push(
        [from, bottom - ground],
        [to, bottom - ground],
        [to, topB - ground],
        [from, topA - ground],
      );
    },
    done(): LandmarkMesh {
      const built = mesh.done();
      places.forEach(([along, up], at) => {
        built.facades.set([along, up, 0, 0], at * 4);
      });
      return built;
    },
  };
}

type Masonry = ReturnType<typeof masonry>;

const shadow = () => flat("ruin-shadow");
const BRICK_MEAN = () => flat("brick", 0.92);
/** A broken top: grey stone and the brick core behind it, by how much of each shows. */
const rubble = (brick: number) =>
  blend(
    blend(flat("fort-granite"), flat("granite-dark"), 0.5),
    flat("brick-dark"),
    brick,
  );

function graniteColour(random: () => number): Paint {
  const roll = random();
  const stone =
    roll < 0.6
      ? flat("fort-granite")
      : roll < 0.8
        ? flat("granite-red")
        : flat("granite-dark");
  return blend(stone, flat("mortar-white"), random() * 0.12);
}

/** A fallen dressed block, half sunk, lying any way. */
function block(
  mesh: MeshBuilder,
  x: number,
  ground: number,
  z: number,
  random: () => number,
) {
  const size: Vec3 = [
    0.8 + random() * 0.9,
    0.45 + random() * 0.35,
    0.5 + random() * 0.45,
  ];
  mesh.box(
    [x, ground + size[1] / 2 - 0.2, z],
    size,
    graniteColour(random),
    random() * Math.PI,
    graniteColour(random),
  );
}

/** A circle through the stretches' middles, least squares: the arc the fort's front was built on. */
function arcCentre(): Vec2 {
  const points = STRETCHES.map(([ae, an, be, bn]): Vec2 => [
    (ae + be) / 2,
    -(an + bn) / 2,
  ]);
  const mean = points.reduce<Vec2>(
    (sum, [x, z]) => [sum[0] + x / points.length, sum[1] + z / points.length],
    [0, 0],
  );
  let [uu, uv, vv, uuu, vvv, uvv, vuu] = [0, 0, 0, 0, 0, 0, 0];
  for (const [x, z] of points) {
    const [u, v] = [x - mean[0], z - mean[1]];
    [uu, uv, vv] = [uu + u * u, uv + u * v, vv + v * v];
    [uuu, vvv, uvv, vuu] = [
      uuu + u * u * u,
      vvv + v * v * v,
      uvv + u * v * v,
      vuu + v * u * u,
    ];
  }
  const [r1, r2] = [(uuu + uvv) / 2, (vvv + vuu) / 2];
  const det = uu * vv - uv * uv;
  return [
    mean[0] + (r1 * vv - r2 * uv) / det,
    mean[1] + (r2 * uu - r1 * uv) / det,
  ];
}

interface Ruin {
  /** A point `run` metres along the wall, `side` metres out from its middle line, towards the outside of the arc. */
  at: (run: number, side: number) => Vec2;
  length: number;
  ground: number;
  /** Each near column's height above the ground: the granite face's, and the brick behind it. */
  outer: number[];
  inner: number[];
  embrasure: boolean[];
}

/** The stretches, bowed to the arc, and their broken tops, shared by the near and far versions so they stand alike. */
function ruins(): Ruin[] {
  const centre = arcCentre();
  const random = seeded(1854);
  return STRETCHES.map(([fromEast, fromNorth, toEast, toNorth, ground]) => {
    const a: Vec2 = [fromEast, -fromNorth];
    const b: Vec2 = [toEast, -toNorth];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const along: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const middle: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const outwards =
      (middle[0] - centre[0]) * -along[1] + (middle[1] - centre[1]) * along[0] >
      0
        ? 1
        : -1;
    const out: Vec2 = [-along[1] * outwards, along[0] * outwards];
    const radius = Math.hypot(middle[0] - centre[0], middle[1] - centre[1]);
    const bow = (length * length) / (8 * radius);
    const at = (run: number, side: number): Vec2 => {
      const share = run / length;
      const lift = side + bow * 4 * share * (1 - share);
      return [
        a[0] + along[0] * run + out[0] * lift,
        a[1] + along[1] * run + out[1] * lift,
      ];
    };
    const columns = Math.max(3, Math.round(length / COLUMN_M));
    const peak = 3 + random() * 2.4;
    const outer: number[] = [];
    const inner: number[] = [];
    const embrasure: boolean[] = [];
    for (let column = 0; column < columns; column++) {
      const share = (column + 0.5) / columns;
      const envelope = Math.min(1, 1.7 * Math.sin(share * Math.PI) ** 0.8);
      const breach = random() < 0.12 ? 0.4 + random() * 0.25 : 1;
      const top = Math.max(
        0.7,
        peak * envelope * breach * (0.82 + random() * 0.26),
      );
      outer.push(top);
      inner.push(top * (0.55 + random() * 0.3));
      embrasure.push(
        column % 2 === 1 && column < columns - 1 && top > EMBRASURE.head + 0.9,
      );
    }
    return { at, length, ground, outer, inner, embrasure };
  });
}

/** The granite face of one column, from `from` to `to` along the wall, an embrasure through it if it has one. */
function outerFace(
  mason: Masonry,
  mesh: MeshBuilder,
  ruin: Ruin,
  from: number,
  to: number,
  top: number,
  open: boolean,
  random: () => number,
) {
  const { at, ground } = ruin;
  const half = WALL_THICK / 2;
  const bottom = ground - SINK;
  const high = ground + top;
  const piece = (start: number, end: number, low: number, up: number) => {
    mason.face(at(start, half), at(end, half), start, end, low, up, up, ground);
  };
  if (!open) {
    piece(from, to, bottom, high);
    return;
  }
  const middle = (from + to) / 2;
  const [left, right] = [middle - EMBRASURE.half, middle + EMBRASURE.half];
  const [sill, head] = [ground + EMBRASURE.sill, ground + EMBRASURE.head];
  piece(from, left, bottom, high);
  piece(right, to, bottom, high);
  piece(left, right, bottom, sill);
  piece(left, right, head, high);
  const back = half - EMBRASURE.deep;
  mesh.wall(at(left, back), at(right, back), sill, head, shadow());
  const reveal = blend(
    flat("fort-granite", 0.7),
    flat("granite-dark"),
    random() * 0.5,
  );
  mesh.wall(at(left, half), at(left, back), sill, head, reveal);
  mesh.wall(at(right, half), at(right, back), sill, head, reveal);
  const [sillA, sillB, sillC, sillD] = [
    at(left, half),
    at(right, half),
    at(right, back),
    at(left, back),
  ];
  mesh.quad(
    [sillA[0], sill, sillA[1]],
    [sillB[0], sill, sillB[1]],
    [sillC[0], sill, sillC[1]],
    [sillD[0], sill, sillD[1]],
    reveal,
  );
  mesh.quad(
    [sillA[0], head, sillA[1]],
    [sillB[0], head, sillB[1]],
    [sillC[0], head, sillC[1]],
    [sillD[0], head, sillD[1]],
    flat("ruin-shadow", 1.6),
  );
}

/** Where a column's top meets its neighbour's, the broken section between them: the brick core behind the granite. */
function section(
  mesh: MeshBuilder,
  ruin: Ruin,
  run: number,
  outerA: number,
  innerA: number,
  outerB: number,
  innerB: number,
  paint: Paint,
) {
  const { at, ground } = ruin;
  const half = WALL_THICK / 2;
  const [o, i] = [at(run, half), at(run, -half)];
  mesh.quad(
    [o[0], ground + Math.min(outerA, outerB), o[1]],
    [i[0], ground + Math.min(innerA, innerB), i[1]],
    [i[0], ground + Math.max(innerA, innerB), i[1]],
    [o[0], ground + Math.max(outerA, outerB), o[1]],
    paint,
  );
}

/** A column's sloping broken top, from the granite face's height down to the brick behind. */
function brokenTop(
  mesh: MeshBuilder,
  ruin: Ruin,
  from: number,
  to: number,
  outer: number,
  inner: number,
  paint: Paint,
) {
  const { at, ground } = ruin;
  const half = WALL_THICK / 2;
  const [a, b, c, d] = [
    at(from, half),
    at(to, half),
    at(to, -half),
    at(from, -half),
  ];
  mesh.quad(
    [a[0], ground + outer, a[1]],
    [b[0], ground + outer, b[1]],
    [c[0], ground + inner, c[1]],
    [d[0], ground + inner, d[1]],
    paint,
  );
}

function nearStretch(
  mason: Masonry,
  mesh: MeshBuilder,
  ruin: Ruin,
  random: () => number,
) {
  const { at, length, ground, outer, inner, embrasure } = ruin;
  const columns = outer.length;
  const width = length / columns;
  const half = WALL_THICK / 2;
  for (let column = 0; column < columns; column++) {
    const [from, to] = [column * width, (column + 1) * width];
    outerFace(
      mason,
      mesh,
      ruin,
      from,
      to,
      outer[column],
      embrasure[column],
      random,
    );
    mason.face(
      at(from, -half),
      at(to, -half),
      from,
      to,
      ground - SINK,
      ground + inner[column],
      ground + inner[column],
      ground,
    );
    brokenTop(
      mesh,
      ruin,
      from,
      to,
      outer[column],
      inner[column],
      rubble(0.1 + random() * 0.3),
    );
    const next = column + 1 < columns;
    if (next)
      section(
        mesh,
        ruin,
        to,
        outer[column],
        inner[column],
        outer[column + 1],
        inner[column + 1],
        rubble(0.1 + random() * 0.3),
      );

    // The stub of a casemate's wall, running in from the face, and the brick fallen from it.
    if (column % 2 === 0 && next && column > 0 && inner[column] > 1.6) {
      const reach = 3.5 + random() * 2.5;
      const [footA, footB] = [at(to - 0.45, -half), at(to + 0.45, -half)];
      const [endA, endB] = [
        at(to - 0.45, -half - reach),
        at(to + 0.45, -half - reach),
      ];
      const [high, low] = [
        ground + inner[column] * 0.7,
        ground + 0.5 + random() * 0.6,
      ];
      const paint = blend(
        flat("brick-dark"),
        flat("granite-dark"),
        0.25 + random() * 0.3,
      );
      for (const [p, q] of [
        [footA, endA],
        [footB, endB],
      ] as const)
        mesh.quad(
          [p[0], ground - SINK, p[1]],
          [q[0], ground - SINK, q[1]],
          [q[0], low, q[1]],
          [p[0], high, p[1]],
          paint,
        );
      mesh.wall(endA, endB, ground - SINK, low, paint);
      mesh.quad(
        [footA[0], high, footA[1]],
        [endA[0], low, endA[1]],
        [endB[0], low, endB[1]],
        [footB[0], high, footB[1]],
        rubble(0.25),
      );
    }

    // Scree: the fill and facing that came down, banked against both faces.
    for (const [side, rise, spread] of [
      [-half, inner[column] * 0.35, 2.6 + random()],
      [half, outer[column] * 0.18, 1.4 + random() * 0.6],
    ] as const) {
      const away = side < 0 ? -spread : spread;
      const [p, q, r, s] = [
        at(from, side),
        at(to, side),
        at(to, side + away),
        at(from, side + away),
      ];
      mesh.quad(
        [p[0], ground + rise, p[1]],
        [q[0], ground + rise, q[1]],
        [r[0], ground - 0.9, r[1]],
        [s[0], ground - 0.9, s[1]],
        blend(flat("granite-dark"), flat("fort-granite", 0.85), random() * 0.6),
      );
    }
  }
  const ends = [
    [0, outer[0], inner[0]],
    [length, outer[columns - 1], inner[columns - 1]],
  ] as const;
  for (const [run, high, low] of ends) {
    const [o, i] = [at(run, half), at(run, -half)];
    mesh.quad(
      [o[0], ground - SINK, o[1]],
      [i[0], ground - SINK, i[1]],
      [i[0], ground + low, i[1]],
      [o[0], ground + high, o[1]],
      rubble(0.1 + random() * 0.3),
    );
  }
  const fallen = Math.round(length * 0.55);
  for (let count = 0; count < fallen; count++) {
    const run = -2 + random() * (length + 4);
    const side =
      random() > 0.35 ? -half - 0.8 - random() * 5 : half + 0.6 + random() * 3;
    const [x, z] = at(run, side);
    block(mesh, x, ground, z, random);
  }
}

/** The same stretch in a few columns, each as tall as the near ones it stands for: its outline and its colours. */
function farStretch(mason: Masonry, mesh: MeshBuilder, ruin: Ruin) {
  const { at, length, ground, outer, inner } = ruin;
  const width = length / outer.length;
  const half = WALL_THICK / 2;
  const groups: { from: number; to: number; outer: number; inner: number }[] =
    [];
  for (let start = 0; start < outer.length; start += FAR_SPAN) {
    const end = Math.min(outer.length, start + FAR_SPAN);
    const mean = (values: number[]) =>
      values.slice(start, end).reduce((sum, value) => sum + value, 0) /
      (end - start);
    groups.push({
      from: start * width,
      to: end * width,
      outer: mean(outer),
      inner: mean(inner),
    });
  }
  const top = rubble(0.25);
  groups.forEach((group, index) => {
    mason.face(
      at(group.from, half),
      at(group.to, half),
      group.from,
      group.to,
      ground - SINK,
      ground + group.outer,
      ground + group.outer,
      ground,
    );
    mason.face(
      at(group.from, -half),
      at(group.to, -half),
      group.from,
      group.to,
      ground - SINK,
      ground + group.inner,
      ground + group.inner,
      ground,
    );
    brokenTop(mesh, ruin, group.from, group.to, group.outer, group.inner, top);
    const next = groups[index + 1] as (typeof groups)[number] | undefined;
    if (next)
      section(
        mesh,
        ruin,
        group.to,
        group.outer,
        group.inner,
        next.outer,
        next.inner,
        top,
      );
  });
  const [first, last] = [groups[0], groups[groups.length - 1]];
  for (const [run, high, low] of [
    [0, first.outer, first.inner],
    [length, last.outer, last.inner],
  ] as const) {
    const [o, i] = [at(run, half), at(run, -half)];
    mesh.quad(
      [o[0], ground - SINK, o[1]],
      [i[0], ground - SINK, i[1]],
      [i[0], ground + low, i[1]],
      [o[0], ground + high, o[1]],
      top,
    );
  }
}

export function buildBomarsundFort(): Landmark {
  const stretches = ruins();
  const random = seeded(1832);
  const [nearMason, near] = [masonry(54), createBuilder()];
  for (const ruin of stretches) nearStretch(nearMason, near, ruin, random);
  const [farMason, far] = [masonry(54), createBuilder()];
  for (const ruin of stretches) farStretch(farMason, far, ruin);
  return {
    id: "bomarsund-fort",
    name: "Bomarsunds fästning",
    east: 125700,
    north: 6694270,
    baseM: FORT_BASE_M,
    near: merged(near.done(), nearMason.done()),
    far: merged(far.done(), farMason.done()),
    farFromM: 500,
  };
}

/*
 * Notvik tower in plan: a ring round a court, angles as the kit's arcs count them, from +x (east) towards +z (south).
 * Its arcaded side faces the northern approach it was built to close, to the north-west.
 */
const NOTVIK = {
  outer: 20,
  court: 12.5,
  parapet: 0.7,
  roof: 10.4,
  crest: 11.2,
  segments: 40,
  facing: (-3 * Math.PI) / 4,
  standing: 0.9,
  gate: 1.4,
};
const TIERS = [
  { floor: 0, spring: 2.5, sill: 1.6, head: 3 },
  { floor: 5.2, spring: 7.6, sill: 6.6, head: 8 },
];
const ARCH_HALF = 0.62;
const NOTVIK_SINK = 3;

const polar = (radius: number, angle: number): Vec2 => [
  radius * Math.cos(angle),
  radius * Math.sin(angle),
];

function angleFrom(angle: number, to: number) {
  return Math.abs(Math.atan2(Math.sin(angle - to), Math.cos(angle - to)));
}

interface RingSegment {
  from: number;
  to: number;
  /** Heights of the granite face and the brick court side; the standing side is to its roof. */
  outer: number;
  inner: number;
  standing: boolean;
}

/** The ring in equal segments, the gate left open, its broken heights fixed for the near and far versions alike. */
function ring(): RingSegment[] {
  const random = seeded(1845);
  const step = (Math.PI * 2) / NOTVIK.segments;
  const segments: RingSegment[] = [];
  for (let at = 0; at < NOTVIK.segments; at++) {
    const from = NOTVIK.facing + Math.PI + at * step;
    const middle = from + step / 2;
    const off = angleFrom(middle, NOTVIK.facing);
    const gate = angleFrom(middle, NOTVIK.gate) < step * 0.6;
    if (gate) continue;
    const standing = off < NOTVIK.standing;
    const shoulder = off < NOTVIK.standing + step * 2.5;
    const broken = 2.8 + random() * 2.6;
    const outer = standing
      ? NOTVIK.crest
      : shoulder
        ? 5 + random() * 3 + (NOTVIK.standing + step * 2.5 - off) * 4
        : broken;
    segments.push({
      from,
      to: from + step,
      outer,
      inner: standing ? NOTVIK.roof : outer * (0.6 + random() * 0.25),
      standing,
    });
  }
  return segments;
}

/** An upright face along the ring's chord at a radius, its top at each end. */
function chord(
  mesh: MeshBuilder,
  radius: number,
  from: number,
  to: number,
  bottom: number,
  topA: number,
  topB: number,
  paint: Paint,
) {
  const [a, b] = [polar(radius, from), polar(radius, to)];
  mesh.quad(
    [a[0], bottom, a[1]],
    [b[0], bottom, b[1]],
    [b[0], topB, b[1]],
    [a[0], topA, a[1]],
    paint,
  );
}

/** The granite face of a segment, with a row of embrasures for each storey it still has. */
function ringFace(
  mason: Masonry,
  mesh: MeshBuilder,
  segment: RingSegment,
  index: number,
  embrasures: boolean,
) {
  const { outer: radius } = NOTVIK;
  const { from, to } = segment;
  const span = to - from;
  const along = (angle: number) => angle * radius;
  const face = (a: number, b: number, low: number, high: number) => {
    mason.face(
      polar(radius, a),
      polar(radius, b),
      along(a),
      along(b),
      low,
      high,
      high,
      0,
    );
  };
  const tiers =
    embrasures && index % 2 === 0
      ? TIERS.filter((tier) => tier.head + 0.8 < segment.outer)
      : [];
  if (tiers.length === 0) {
    face(from, to, -NOTVIK_SINK, segment.outer);
    return;
  }
  const middle = from + span / 2;
  const open = EMBRASURE.half / radius;
  const [left, right] = [middle - open, middle + open];
  face(from, left, -NOTVIK_SINK, segment.outer);
  face(right, to, -NOTVIK_SINK, segment.outer);
  let low = -NOTVIK_SINK;
  for (const tier of tiers) {
    face(left, right, low, tier.sill);
    const back = radius - EMBRASURE.deep;
    chord(mesh, back, left, right, tier.sill, tier.head, tier.head, shadow());
    for (const side of [left, right]) {
      const [p, q] = [polar(radius, side), polar(back, side)];
      mesh.quad(
        [p[0], tier.sill, p[1]],
        [q[0], tier.sill, q[1]],
        [q[0], tier.head, q[1]],
        [p[0], tier.head, p[1]],
        flat("fort-granite", 0.7),
      );
    }
    low = tier.head;
  }
  face(left, right, low, segment.outer);
}

/** The court side of the standing casemates: brick, an arched door or window to each, two storeys of them. */
function arcade(mesh: MeshBuilder, segment: RingSegment, random: () => number) {
  const radius = NOTVIK.court;
  const { from, to } = segment;
  const [a, b] = [polar(radius, from), polar(radius, to)];
  const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const middle = (from + to) / 2;
  const centre = polar(radius * Math.cos((to - from) / 2), middle);
  const along: Vec2 = [(b[0] - a[0]) / width, (b[1] - a[1]) / width];
  const inwards: Vec2 = [Math.cos(middle), Math.sin(middle)];
  const at = (run: number, y: number, depth = 0): Vec3 => [
    centre[0] + along[0] * run + inwards[0] * depth,
    y,
    centre[1] + along[1] * run + inwards[1] * depth,
  ];
  const brick = flat("brick", 0.82 + random() * 0.16);
  const bricks = () => brick;
  let low = -0.6;
  for (const tier of TIERS) {
    const crown = tier.spring + ARCH_HALF;
    const top = tier === TIERS[0] ? TIERS[1].floor : NOTVIK.roof;
    mesh.quad(
      at(-width / 2, low),
      at(-ARCH_HALF, low),
      at(-ARCH_HALF, top),
      at(-width / 2, top),
      bricks(),
    );
    mesh.quad(
      at(ARCH_HALF, low),
      at(width / 2, low),
      at(width / 2, top),
      at(ARCH_HALF, top),
      bricks(),
    );
    if (tier.floor > low)
      mesh.quad(
        at(-ARCH_HALF, low),
        at(ARCH_HALF, low),
        at(ARCH_HALF, tier.floor),
        at(-ARCH_HALF, tier.floor),
        bricks(),
      );
    const steps = 5;
    const arch = (step: number) => Math.PI - (step * Math.PI) / steps;
    for (let step = 0; step < steps; step++) {
      const [p, q] = [arch(step), arch(step + 1)];
      const rim = (angle: number, depth = 0) =>
        at(
          Math.cos(angle) * ARCH_HALF,
          tier.spring + Math.sin(angle) * ARCH_HALF,
          depth,
        );
      mesh.quad(
        rim(p),
        rim(q),
        at(Math.cos(q) * ARCH_HALF, top),
        at(Math.cos(p) * ARCH_HALF, top),
        bricks(),
      );
      mesh.quad(rim(p), rim(q), rim(q, 0.9), rim(p, 0.9), flat("brick-dark"));
    }
    mesh.quad(
      at(-ARCH_HALF, tier.floor, 0.9),
      at(ARCH_HALF, tier.floor, 0.9),
      at(ARCH_HALF, crown, 0.9),
      at(-ARCH_HALF, crown, 0.9),
      shadow(),
    );
    for (const side of [-ARCH_HALF, ARCH_HALF])
      mesh.quad(
        at(side, tier.floor),
        at(side, tier.floor, 0.9),
        at(side, tier.spring, 0.9),
        at(side, tier.spring),
        flat("brick-dark"),
      );
    low = top;
  }
}

/** A segment's top and the ruin's sections, shared by both versions: the top slopes from the granite to the brick behind. */
function ringTop(
  mesh: MeshBuilder,
  segment: RingSegment,
  next: RingSegment | undefined,
  paint: Paint,
  roof: Paint,
) {
  const { outer, court, parapet } = NOTVIK;
  const { from, to } = segment;
  const at = (radius: number, angle: number, y: number): Vec3 => {
    const [x, z] = polar(radius, angle);
    return [x, y, z];
  };
  if (segment.standing) {
    mesh.quad(
      at(court, from, NOTVIK.roof),
      at(court, to, NOTVIK.roof),
      at(outer - parapet, to, NOTVIK.roof),
      at(outer - parapet, from, NOTVIK.roof),
      roof,
    );
    chord(
      mesh,
      outer - parapet,
      from,
      to,
      NOTVIK.roof,
      NOTVIK.crest,
      NOTVIK.crest,
      paint,
    );
    mesh.quad(
      at(outer - parapet, from, NOTVIK.crest),
      at(outer - parapet, to, NOTVIK.crest),
      at(outer, to, NOTVIK.crest),
      at(outer, from, NOTVIK.crest),
      paint,
    );
  } else {
    mesh.quad(
      at(outer, from, segment.outer),
      at(outer, to, segment.outer),
      at(court, to, segment.inner),
      at(court, from, segment.inner),
      paint,
    );
  }
  const close = (
    angle: number,
    outerA: number,
    innerA: number,
    outerB: number,
    innerB: number,
  ) => {
    mesh.quad(
      at(outer, angle, Math.min(outerA, outerB)),
      at(court, angle, Math.min(innerA, innerB)),
      at(court, angle, Math.max(innerA, innerB)),
      at(outer, angle, Math.max(outerA, outerB)),
      paint,
    );
  };
  const joined = next && Math.abs(next.from - to) < 1e-6;
  if (joined) close(to, segment.outer, segment.inner, next.outer, next.inner);
  else close(to, -NOTVIK_SINK, -0.6, segment.outer, segment.inner);
  return joined;
}

function ringSides(mesh: MeshBuilder, segments: RingSegment[], paint: Paint) {
  const first = segments[0];
  const at = (radius: number, y: number): Vec3 => {
    const [x, z] = polar(radius, first.from);
    return [x, y, z];
  };
  mesh.quad(
    at(NOTVIK.outer, -NOTVIK_SINK),
    at(NOTVIK.court, -0.6),
    at(NOTVIK.court, first.inner),
    at(NOTVIK.outer, first.outer),
    paint,
  );
}

function notvik(mason: Masonry, mesh: MeshBuilder) {
  const random = seeded(1848);
  const segments = ring();
  const roof = rubble(0.3);
  segments.forEach((segment, index) => {
    ringFace(mason, mesh, segment, index, true);
    if (segment.standing) arcade(mesh, segment, random);
    else
      chord(
        mesh,
        NOTVIK.court,
        segment.from,
        segment.to,
        -0.6,
        segment.inner,
        segment.inner,
        flat("brick", 0.75 + random() * 0.35),
      );
    ringTop(
      mesh,
      segment,
      segments[index + 1],
      rubble(0.25 + random() * 0.3),
      roof,
    );
  });
  ringSides(mesh, segments, rubble(0.4));

  // Fallen stone round the broken side of the ring, outside and in the court.
  for (let count = 0; count < 70; count++) {
    const angle =
      NOTVIK.facing +
      NOTVIK.standing +
      0.2 +
      random() * (Math.PI * 2 - 2 * NOTVIK.standing - 0.4);
    const outside = random() > 0.4;
    const radius = outside
      ? NOTVIK.outer + 0.6 + random() * 4
      : NOTVIK.court - 0.6 - random() * 2.5;
    const [x, z] = polar(radius, angle);
    block(mesh, x, outside ? -0.4 : 0, z, random);
  }

  // The gun in the court, on its carriage, run out towards the gate.
  const gun = NOTVIK.gate + 0.15;
  const [gx, gz] = polar(4, gun);
  const [dx, dz] = [Math.cos(gun), Math.sin(gun)];
  const iron = flat("mast-dark");
  mesh.box([gx, 0.55, gz], [2.2, 0.5, 1], flat("ship-teak", 0.7), gun);
  mesh.tube(
    [gx - dx * 1.4, 1, gz - dz * 1.4],
    [gx + dx * 1.6, 1.05, gz + dz * 1.6],
    0.3,
    0.2,
    8,
    iron,
  );
  for (const side of [-0.65, 0.65]) {
    const [wx, wz] = [gx - dz * side + dx * 0.5, gz + dx * side + dz * 0.5];
    mesh.tube(
      [wx - dz * 0.08, 0.5, wz + dx * 0.08],
      [wx + dz * 0.08, 0.5, wz - dx * 0.08],
      0.5,
      0.06,
      10,
      iron,
    );
  }
}

function notvikFar(mason: Masonry, mesh: MeshBuilder) {
  const segments = ring();
  const paint = rubble(0.4);
  const roof = rubble(0.3);
  // Two near segments to a far one, the standing side apart from the broken.
  const pairs: RingSegment[] = [];
  let single = false;
  for (const segment of segments) {
    const last = pairs.at(-1);
    if (
      single &&
      last &&
      Math.abs(last.to - segment.from) < 1e-6 &&
      last.standing === segment.standing
    ) {
      pairs[pairs.length - 1] = {
        ...last,
        to: segment.to,
        outer: Math.max(last.outer, segment.outer),
        inner: Math.max(last.inner, segment.inner),
      };
      single = false;
    } else {
      pairs.push({ ...segment });
      single = true;
    }
  }
  pairs.forEach((segment, index) => {
    ringFace(mason, mesh, segment, index, false);
    chord(
      mesh,
      NOTVIK.court,
      segment.from,
      segment.to,
      -0.6,
      segment.inner,
      segment.inner,
      segment.standing ? flat("brick", 0.62) : BRICK_MEAN(),
    );
    ringTop(mesh, segment, pairs[index + 1], paint, roof);
  });
  ringSides(mesh, pairs, paint);
}

export function buildNotvikstornet(): Landmark {
  const [nearMason, near] = [masonry(48), createBuilder()];
  notvik(nearMason, near);
  const [farMason, far] = [masonry(48), createBuilder()];
  notvikFar(farMason, far);
  return {
    id: "notvikstornet",
    name: "Notvikstornet",
    east: 125757,
    north: 6695281,
    baseM: 28.2,
    near: merged(near.done(), nearMason.done()),
    far: merged(far.done(), farMason.done()),
    farFromM: 400,
  };
}
