import * as THREE from "three";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { oilLamp, pitShell, rug, table } from "../kit";
import { solidLathe } from "../kit/vessel";
import { lightAnchor } from "../light-anchor";
import { paletteHex, RAMPS, type PaletteKey } from "../palette";
import { clearOfMarks, onWall, type RoomDefinition } from "../room";
import { batch, flat, glow, group, type Batch } from "../shapes";
import { shiny, SHINES } from "../shine";
import { panelling, wallpaper, woodPlanks } from "../textures";

const SEED = "collapsed-room";

type Flat = [x: number, z: number];

/** Where the floor has fallen in: a ragged hole round the middle of the room,
 *  its left edge nearly straight, where the rug went over. */
const RAGGED: Flat[] = [
  [-0.95, -0.6],
  [-0.72, -0.84],
  [-0.38, -0.92],
  [-0.16, -1.14],
  [0.04, -0.9],
  [0.44, -1.0],
  [0.8, -0.76],
  [1.04, -0.46],
  [1.2, -0.12],
  [1.0, 0.18],
  [1.12, 0.54],
  [0.86, 0.84],
  [0.5, 0.94],
  [0.2, 1.14],
  [-0.1, 0.9],
  [-0.5, 0.96],
  [-0.8, 0.72],
  [-0.96, 0.48],
  [-0.98, 0.0],
];
const MIDDLE: Flat = [0.1, 0];
/** Drawn out a little from the sketch above, so the hole holds the room at house distance. */
const SPREAD = 1.25;
const HOLE: Flat[] = RAGGED.map(([x, z]) => [MIDDLE[0] + (x - MIDDLE[0]) * SPREAD, MIDDLE[1] + (z - MIDDLE[1]) * SPREAD]);

/** The hole's edge drawn in or out about its middle by `k`. */
const scaled = (k: number): Flat[] => HOLE.map(([x, z]) => [MIDDLE[0] + (x - MIDDLE[0]) * k, MIDDLE[1] + (z - MIDDLE[1]) * k]);

/** The floor's layers, from its boards down: the boards, the joists under them, and the lath and plaster ceiling of the room below. */
const BOARDS = 0.028;
const JOIST = { width: 0.07, top: -0.035, depth: 0.2 };
const CEILING = { top: -0.27, thick: 0.03 };
/** The ceiling below has broken through in a smaller hole than the floor's, and runs on under the floor. */
const CEILING_EDGE = scaled(0.78);
const CEILING_UNDER = scaled(1.25);
/** The lining's thickness, standing inside the edge of the floor it lines. */
const LINING = 0.035;
/** The joist that broke in the middle and fell in a V. */
const JOIST_V = 0.2;

/** The lamp on the table at the brink, where its red light falls. */
const TABLE_AT: Flat = [-1.0, 1.17];

/** Where a vertical line at `x` crosses a polygon's edges: its first and last crossing along z. */
function spanAt(polygon: Flat[], x: number): [number, number] {
  const crossings: number[] = [];
  polygon.forEach(([x0, z0], i) => {
    const [x1, z1] = polygon[(i + 1) % polygon.length];
    if ((x0 - x) * (x1 - x) > 0 || x0 === x1) return;
    crossings.push(z0 + ((x - x0) / (x1 - x0)) * (z1 - z0));
  });
  return [Math.min(...crossings), Math.max(...crossings)];
}

/** How brightly the inside of the hole shows by depth: the room's dim light at the lip, fading to nothing below the ceiling. */
function depthShade(y: number): number {
  if (y > -BOARDS) return 0.3;
  if (y > CEILING.top - CEILING.thick) return 0.3 - (0.2 * (-BOARDS - y)) / (-BOARDS - CEILING.top);
  return Math.max(0, 0.1 * (1 + (y - CEILING.top) / 0.4));
}

/** The lamp's red, thrown on the near side of the hole: strongest just under its brink. */
const RED = new THREE.Color(paletteHex("scarlet"));
const LAMP_FLOOR = new THREE.Vector3(TABLE_AT[0] + 0.15, 0, TABLE_AT[1] - 0.15);
function redShade(point: THREE.Vector3): number {
  const near = Math.max(0, 1 - point.distanceTo(LAMP_FLOOR) / 1.7);
  return 0.35 * near * near * Math.max(0, 1 + point.y / 0.6);
}

/** Recolours a geometry's vertex colours as its own light: each palette tint
 *  dimmed by depth, with the lamp's red over it. */
function selfShaded(geometry: THREE.BufferGeometry): THREE.Mesh {
  const position = geometry.getAttribute("position");
  const colour = geometry.getAttribute("color");
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    const shade = depthShade(point.y);
    const red = redShade(point);
    colour.setXYZ(i, colour.getX(i) * shade + RED.r * red, colour.getY(i) * shade + RED.g * red, colour.getZ(i) * shade + RED.b * red);
  }
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  mesh.userData.noShadow = true;
  return mesh;
}

/** A box from `a` to `b` in room metres, `size` across ([width, height]), its width kept level. */
function beam(b: Batch, a: THREE.Vector3, to: THREE.Vector3, [width, height]: [number, number], tint: PaletteKey) {
  const along = to.clone().sub(a);
  const length = along.length();
  const matrix = new THREE.Matrix4().lookAt(a, to, new THREE.Vector3(0, 1, 0));
  matrix.setPosition(a.clone().add(to).multiplyScalar(0.5));
  b.add([width, height, length], tint, matrix);
}

/** The ragged edge's lining, all round: the splintered ends of the boards over the dark of the joists' bay. */
function lining(b: Batch) {
  HOLE.forEach(([x0, z0], i) => {
    const [x1, z1] = HOLE[(i + 1) % HOLE.length];
    const length = Math.hypot(x1 - x0, z1 - z0);
    const [mx, mz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    let [nx, nz] = [-(z1 - z0) / length, (x1 - x0) / length];
    if (nx * (MIDDLE[0] - mx) + nz * (MIDDLE[1] - mz) < 0) [nx, nz] = [-nx, -nz];
    const turn = new THREE.Matrix4().makeRotationY(-Math.atan2(z1 - z0, x1 - x0));
    const at = (y: number) => new THREE.Matrix4().makeTranslation(mx + (nx * LINING) / 2, y, mz + (nz * LINING) / 2).multiply(turn);
    // Each run a little shorter or taller than the next, so where two overlap at a corner their faces never share a plane.
    const lift = (i === HOLE.length - 1 && HOLE.length % 2 === 1 ? 2 : i % 2) * 0.002;
    b.add([length + 0.03, BOARDS - lift, LINING - lift], pick(createRng(`${SEED}:end:${i}`), ["woodLight", "woodMid", "boneDark"]), at(-(BOARDS + lift) / 2 - 0.002));
    const bay = -CEILING.top - BOARDS + 0.01;
    b.add([length + 0.036 + lift, bay - lift, LINING - 0.004 - lift], "sootLight", at(-BOARDS - (bay + lift) / 2 + 0.006));
  });
}

/**
 * The joists under the floor, running across the hole along z: most snapped
 * where the floor went, their ends sagging into the hole; one broken in the
 * middle and fallen in a V; the floor's boards gone from over them all.
 */
function joists(b: Batch) {
  const rng = createRng(`${SEED}:joists`);
  const size: [number, number] = [JOIST.width, JOIST.depth];
  const y = JOIST.top - JOIST.depth / 2;
  for (const x of [-0.7, -0.25, JOIST_V, 0.65, 1.1]) {
    const [z0, z1] = spanAt(HOLE, x);
    if (x === JOIST_V) {
      const middle = (z0 + z1) / 2 + 0.06;
      beam(b, new THREE.Vector3(x, y, z0), new THREE.Vector3(x - 0.02, y - 0.34, middle), size, "woodMid");
      beam(b, new THREE.Vector3(x, y, z1), new THREE.Vector3(x + 0.03, y - 0.3, middle - 0.02), size, "wood");
      continue;
    }
    for (const [from, toward] of [[z0, 1], [z1, -1]] as const) {
      const reach = 0.12 + rng.next() * 0.26;
      const sag = 0.04 + rng.next() * 0.12;
      beam(b, new THREE.Vector3(x, y, from), new THREE.Vector3(x + (rng.next() - 0.5) * 0.04, y - sag, from + toward * reach), size, pick(rng, ["wood", "woodMid", "woodDark"]));
    }
  }
}

/** Floorboards broken at the hole's right edge, hanging down into it from where they snapped. */
function hangingBoards(b: Batch) {
  const rng = createRng(`${SEED}:hanging`);
  for (const [z, length, angle] of [[-0.3, 0.55, 0.75], [-0.05, 0.4, 1.15], [0.38, 0.6, 0.6], [0.66, 0.35, 1.0]] as const) {
    const [, x] = spanAtZ(z);
    const matrix = new THREE.Matrix4()
      .makeTranslation(x, -0.014, z)
      .multiply(new THREE.Matrix4().makeRotationZ(angle))
      .multiply(new THREE.Matrix4().makeTranslation(-length / 2, 0, 0));
    b.add([length, 0.026, 0.21], pick(rng, ["wood", "woodMid", "woodLight"]), matrix);
  }
}

/** Where a line along x at `z` crosses the hole's edge: its first and last crossing. */
function spanAtZ(z: number): [number, number] {
  const [z0, z1] = spanAt(
    HOLE.map(([x, zz]) => [zz, x]),
    z,
  );
  return [z0, z1];
}

/** The ceiling of the room below, seen through the hole: its plaster broken
 *  back in a smaller ragged hole, the bare lath sticking out of its edge. */
function ceilingBelow(): THREE.Mesh[] {
  const shape = new THREE.Shape(CEILING_UNDER.map(([x, z]) => new THREE.Vector2(x, z)));
  shape.holes.push(new THREE.Path(CEILING_EDGE.map(([x, z]) => new THREE.Vector2(x, z))));
  const plaster = new THREE.ExtrudeGeometry(shape, { depth: CEILING.thick, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, CEILING.top, 0);
  const tint = new THREE.Color(paletteHex("boneDark"));
  const position = plaster.getAttribute("position");
  plaster.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: position.count }, () => tint.toArray()).flat(), 3));
  const lath = batch();
  const rng = createRng(`${SEED}:lath`);
  CEILING_EDGE.forEach(([x0, z0], i) => {
    const [x1, z1] = CEILING_EDGE[(i + 1) % CEILING_EDGE.length];
    const length = Math.hypot(x1 - x0, z1 - z0);
    for (let t = 0.1; t < length - 0.05; t += 0.08 + rng.next() * 0.06) {
      const at = new THREE.Vector3(x0 + ((x1 - x0) * t) / length, CEILING.top - 0.006, z0 + ((z1 - z0) * t) / length);
      // Not where the rug lies over the edge.
      if (at.x < -0.4 && Math.abs(at.z - RUG_Z) < 0.6) continue;
      const inward = new THREE.Vector3(MIDDLE[0] - at.x, 0, MIDDLE[1] - at.z).normalize();
      const reach = 0.06 + rng.next() * 0.16;
      const tip = at.clone().addScaledVector(inward, reach);
      tip.y -= rng.next() * 0.08;
      beam(lath, at.clone().addScaledVector(inward, -0.05), tip, [0.025, 0.008], pick(rng, ["woodLight", "woodMid", "boneDark"]));
    }
  });
  return [selfShaded(plaster), selfShaded(lath.mesh().geometry)];
}

/**
 * The hole itself, built in room metres: the broken edge of the floor, the
 * joists snapped across it, the ceiling of the room below with its own hole,
 * and the dark under it all. Everything inside
 * the hole carries its own light, dimming with depth and reddened under the
 * lamp, rather than taking the house's fill, which would light it as
 * brightly as the floor and make it read as a shallow tray.
 */
function hole(): THREE.Group {
  const b = batch();
  lining(b);
  joists(b);
  hangingBoards(b);
  const xs = CEILING_EDGE.map(([x]) => x);
  const zs = CEILING_EDGE.map(([, z]) => z);
  const bounds = { x: [Math.min(...xs) - 0.06, Math.max(...xs) + 0.06] as [number, number], z: [Math.min(...zs) - 0.06, Math.max(...zs) + 0.06] as [number, number] };
  return group(
    selfShaded(b.mesh().geometry),
    ...ceilingBelow(),
    pitShell({ ...bounds, top: CEILING.top - CEILING.thick - 0.01, bottom: -5 }),
  );
}

/** How the rug lies, along its length: flat on the floor to the brink, over
 *  it and down the broken edge, across the ceiling below, and over its edge
 *  into the dark. Points [x, y] in room metres. */
const BRINK = -1.23;
const RUG_PATH: [x: number, y: number][] = [
  [-2.5, 0.006],
  [BRINK - 0.008, 0.006],
  [BRINK + 0.06, -0.03],
  [BRINK + 0.07, -0.24],
  [BRINK + 0.1, CEILING.top + 0.006],
  [-0.96, CEILING.top + 0.006],
  [-0.915, CEILING.top - 0.05],
  [-0.905, -0.95],
];
const RUG_WIDTH = 0.96;
const RUG_Z = -0.04;

/** The rug the floor took with it: the far end still lying in the room, the
 *  rest dragged over the brink, down onto the ceiling below and over. One
 *  flat strip for each stretch of its way, the pattern running on across them. */
function draggedRug(): THREE.Group {
  const lengths = RUG_PATH.slice(1).map(([x, y], i) => Math.hypot(x - RUG_PATH[i][0], y - RUG_PATH[i][1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const material = rug({ width: total, length: RUG_WIDTH, field: "verdigris", border: "verdigrisDark", motif: "boneDark", fringe: "boneDark" }).material as THREE.MeshLambertMaterial;
  material.side = THREE.DoubleSide;
  const result = group();
  let from = 0;
  RUG_PATH.slice(1).forEach(([bx, by], i) => {
    const [ax, ay] = RUG_PATH[i];
    const geometry = new THREE.PlaneGeometry(1, RUG_WIDTH).rotateX(-Math.PI / 2);
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    for (let v = 0; v < position.count; v++) {
      const t = position.getX(v) + 0.5;
      position.setXYZ(v, ax + (bx - ax) * t, ay + (by - ay) * t, position.getZ(v) + RUG_Z);
      uv.setX(v, (from + lengths[i] * t) / total);
    }
    geometry.computeVertexNormals();
    const strip = new THREE.Mesh(geometry, material);
    strip.receiveShadow = true;
    result.add(strip);
    from += lengths[i];
  });
  return result;
}

/** The lamp's turned brass, from its foot up to the burner. */
const LAMP_BODY: [number, number][] = [[0.07, 0], [0.07, 0.014], [0.04, 0.03], [0.018, 0.05], [0.018, 0.08], [0.05, 0.1], [0.064, 0.13], [0.05, 0.16], [0.024, 0.175]];
/** Its globe of ruby glass, round the hidden flame. */
const GLOBE: [number, number][] = [[0.04, 0], [0.075, 0.03], [0.095, 0.08], [0.09, 0.13], [0.06, 0.17], [0.035, 0.18], [0.035, 0.24]];

/** A parlour oil lamp with a ruby glass globe, whose flame shows only as the
 *  glass's red. Base at y = 0. */
function rubyLamp(): THREE.Group {
  const brass = shiny(flat("brass"), SHINES.brass);
  const globe = solidLathe(GLOBE, glow("bloodLight"), 12);
  globe.position.y = 0.17;
  const heart = solidLathe([[0.05, 0.04], [0.06, 0.08], [0.05, 0.12]], glow("scarlet"), 10);
  heart.position.y = 0.17;
  const result = group(solidLathe(LAMP_BODY, brass, 12), globe, heart);
  result.traverse((child) => (child.userData.noShadow = true));
  result.add(lightAnchor({ colour: "scarlet", intensity: 2.2, range: 4, flicker: 0.06, kind: "lamp" }, [0, 0.27, 0]));
  return result;
}

/**
 * The little lamp table at the brink, one corner leg out over the hole and
 * the whole table tipping towards it, its lamp still burning on it. In its
 * own frame the hole lies towards +x +z.
 */
function teeteringTable(): THREE.Group {
  const stand = table({ length: 0.5, width: 0.5, height: 0.7, wood: RAMPS.wood });
  const lamp = rubyLamp();
  lamp.position.set(-0.04, 0.7, -0.04);
  const tipping = group(stand, lamp);
  tipping.applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, -1).normalize(), 0.13));
  return group(tipping);
}

/** A low armchair in faded green plush, shoved askew. Faces +z. */
function armchair(): THREE.Group {
  const b = batch();
  b.block([0.72, 0.2, 0.68], "verdigris", [0, 0.14, 0]);
  b.block([0.6, 0.08, 0.56], "verdigrisLight", [0, 0.34, 0.04]);
  b.block([0.72, 0.6, 0.16], "verdigris", [0, 0.34, -0.27]);
  for (const sx of [-1, 1]) {
    b.block([0.12, 0.28, 0.66], "verdigrisDark", [sx * 0.31, 0.34, 0.005]);
    for (const z of [-0.28, 0.28]) b.block([0.06, 0.14, 0.06], "woodDark", [sx * 0.3, 0, z]);
  }
  return group(b.mesh());
}

/** Plaster fallen from round the hole and from the walls: broken chunks and
 *  splintered lath, lying flat enough to walk over. Spread round its origin. */
function debris(seed: string, radius: number, count: number): () => THREE.Group {
  return () => {
    const b = batch();
    const rng = createRng(`${SEED}:debris:${seed}`);
    let sticks = 0;
    for (let k = 0; k < count; k++) {
      const r = Math.sqrt(rng.next()) * radius;
      const a = rng.next() * Math.PI * 2;
      const at = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.next() * Math.PI, 0));
      if (rng.next() < 0.3) {
        const length = 0.25 + rng.next() * 0.35;
        at.y = 0.006 + sticks++ * 0.003;
        b.add([length, 0.008, 0.025], pick(rng, ["woodLight", "woodMid"]), new THREE.Matrix4().compose(at, turn, new THREE.Vector3(1, 1, 1)));
        continue;
      }
      const s = 0.06 + rng.next() * 0.12 * (1 - (r / radius) * 0.6);
      const h = clearOfMarks(Math.min(0.05, s * 0.45));
      at.y = h / 2;
      b.add([s * 1.3, h, s], pick(rng, ["boneDark", "bone", "boneDark"]), new THREE.Matrix4().compose(at, turn, new THREE.Vector3(1, 1, 1)));
    }
    return group(b.mesh());
  };
}

/** The ring round the hole that walks keep to, with a spoke out to each door. */
const RING = 2.35;
const DIAGONAL = 1.75;
const RING_POINTS: Flat[] = [
  [0, -RING],
  [DIAGONAL, -DIAGONAL],
  [RING, 0],
  [DIAGONAL, DIAGONAL],
  [0, RING],
  [-DIAGONAL, DIAGONAL],
  [-RING, 0],
  [-DIAGONAL, -DIAGONAL],
];

/** The Collapsed Room: an upstairs sitting room whose floor has fallen in
 *  round its middle, through the joists and the ceiling below into the
 *  dark; its rug gone over the brink, and a ruby lamp on a table tipping at
 *  the edge, throwing red down into the hole. */
export const COLLAPSED_ROOM: RoomDefinition = {
  id: "collapsed-room",
  floor: () => woodPlanks({ seed: SEED, glints: false }),
  wall: () => wallpaper({ ground: "woodLight", stripe: "woodMid", motif: "boneDark", seed: SEED }),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: SEED, glints: false }),
  trim: "woodDark",
  floorOpenings: [{ polygon: HOLE }],
  props: [
    { build: hole, at: [0, 0], contacts: [{ with: "floor", because: "the snapped joists run on under the floor they carried" }] },
    { build: draggedRug, at: [0, 0] },
    { build: teeteringTable, at: TABLE_AT, turn: 92, contacts: [{ with: "hole", because: "its corner leg has slipped over the broken edge" }] },
    { build: armchair, at: [-2.28, -2.28], turn: 40 },
    { build: debris("brink", 0.5, 16), name: "debris", at: [0.45, 1.7] },
    { build: debris("top", 0.45, 12), name: "debris", at: [-0.55, -1.55] },
    { build: debris("corner", 0.4, 10), name: "debris", at: [-2.25, 1.95] },
    { build: () => table({ length: 0.5, width: 0.38, height: 0.76, wood: RAMPS.wood }), name: "side table", ...onWall("right", -1.75, { out: 0.21 }) },
    { build: () => oilLamp({ intensity: 3.2, range: 7 }), name: "oil lamp", ...onWall("right", -1.8, { out: 0.2, y: 0.76 }) },
  ],
  focus: [0.1, -0.1, 0.2],
  prime: [1.35, 1.25],
  lanes: [[...RING_POINTS, RING_POINTS[0]], [[0, -2.2], RING_POINTS[0]], [[2.2, 0], RING_POINTS[2]], [[0, 2.2], RING_POINTS[4]], [[-2.2, 0], RING_POINTS[6]]],
};
