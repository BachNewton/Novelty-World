import * as THREE from "three";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { cask, coil, crate, lantern, strand } from "../kit";
import type { PaletteKey } from "../palette";
import { INNER, onWall, type RoomDefinition } from "../room";
import { batch, box, flat, group, lightMaterial, pixelPlane, projectUvs, textured } from "../shapes";
import { flagstones, pixelTexture, TEXELS_PER_METRE, woodPlanks } from "../textures";

/** The hole in the floor the lake fills, along the left and bottom walls; the
 *  dry stone left over is a ledge under the two doors. */
const LAKE = { x: [-INNER, 0.9] as [number, number], z: [-0.6, INNER] as [number, number] };
const LAKE_W = LAKE.x[1] - LAKE.x[0];
const LAKE_D = LAKE.z[1] - LAKE.z[0];
const LAKE_X = (LAKE.x[0] + LAKE.x[1]) / 2;
const LAKE_Z = (LAKE.z[0] + LAKE.z[1]) / 2;
/** The water's surface, a little below the floor. */
const WATER = -0.12;
/** The jetty's middle line, and where it ends out on the water. */
const JETTY_X = -1.5;
const JETTY_END = 1.7;
/** Where the boat lies, and the jetty's end post its rope is tied to, in the boat's frame. */
const BOAT: [number, number] = [JETTY_X + 0.98, 0.95];
const MOORING: [number, number, number] = [JETTY_X + 0.42 - BOAT[0] + 0.06, 0.32, JETTY_END - 0.06 - BOAT[1]];

/** Whole texel steps: pixel art moves a pixel at a time, never smoothly. */
function steps(seconds: number, perSecond: number): number {
  return Math.floor(seconds * perSecond) / TEXELS_PER_METRE;
}

function between(rng: Rng, low: number, high: number): number {
  return low + Math.floor(rng.next() * (high - low + 1));
}

/** A grid of `.` the given size, drawn into by `put`, wrapping round its edges. */
function canvasRows(width: number, height: number) {
  const grid = Array.from({ length: height }, () => Array<string>(width).fill("."));
  return {
    put: (x: number, y: number, c: string) => {
      grid[((y % height) + height) % height][((x % width) + width) % width] = c;
    },
    rows: () => grid.map((row) => row.join("")),
  };
}

/** One metre of dark water: troughs and wavelets in short dashes, the odd glint. */
function waterRows(): string[] {
  const rng = createRng("underground-lake:water");
  const size = TEXELS_PER_METRE;
  const { put, rows } = canvasRows(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, "d");
  for (let i = 0; i < 46; i++) {
    const x = between(rng, 0, size - 1);
    const y = between(rng, 0, size - 1);
    for (let k = between(rng, 3, 8); k > 0; k--) put(x + k, y, "s");
  }
  for (let i = 0; i < 15; i++) {
    const x = between(rng, 0, size - 1);
    const y = between(rng, 0, size - 1);
    const length = between(rng, 2, 5);
    for (let k = 0; k < length; k++) put(x + k, y, "c");
    put(x + 1, y + 1, "s");
  }
  return rows();
}

/** Sparse glints that ride over the water, drawn as light. */
function glintRows(): string[] {
  const rng = createRng("underground-lake:glints");
  const size = TEXELS_PER_METRE;
  const { put, rows } = canvasRows(size, size);
  for (let i = 0; i < 9; i++) {
    const x = between(rng, 0, size - 1);
    const y = between(rng, 0, size - 1);
    put(x, y, "g");
    put(x + 1, y, "c");
    if (rng.next() < 0.5) put(x - 1, y, "c");
  }
  return rows();
}

/** The dark thing just under the surface, seen from above: a long body,
 *  rounded at its head (+x), trailing four thin wisps. 48 × 16 texels. */
function shapeRows(): string[] {
  const width = 48;
  const height = 16;
  const { put, rows } = canvasRows(width, height);
  const mid = (height - 1) / 2;
  for (let x = 14; x < width; x++) {
    const t = (x - 14) / (width - 15);
    const half = 5.2 * Math.sqrt(Math.sin(Math.PI * Math.min(1, t * 0.62 + 0.38)));
    for (let y = 0; y < height; y++) {
      const d = Math.abs(y - mid);
      const core = d <= half - 1.5;
      if (d <= half && (core || (x + y) % 2 === 0)) put(x, y, core ? "l" : "p");
    }
  }
  const wisps: [number, number][] = [[2, 0.9], [5, -0.6], [9, 0.4], [12, -1]];
  wisps.forEach(([start, bend], i) => {
    const y0 = mid - 3 + i * 2;
    for (let x = start; x < 16; x++) put(x, Math.round(y0 + Math.sin(x * 0.5 + i) * bend), "p");
  });
  return rows();
}

/** Rings spreading on the water, a frame each, the last empty: 32 texels a frame. */
const RING_FRAMES = 8;
function ringRows(): string[] {
  const size = TEXELS_PER_METRE;
  const { put, rows } = canvasRows(size * RING_FRAMES, size);
  const radii = [1.5, 3, 5, 7, 9.5, 12, 14.5];
  radii.forEach((radius, frame) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - (size - 1) / 2, y - (size - 1) / 2);
        const inner = radius - 3.5;
        if (Math.abs(d - radius) < 0.6) put(frame * size + x, y, frame < 3 ? "g" : "c");
        else if (frame > 1 && inner > 1 && Math.abs(d - inner) < 0.55 && (x + y) % 2 === 0) put(frame * size + x, y, "c");
      }
    }
  });
  return rows();
}

/** The cold light the water throws up a wall: a net of caustic lines,
 *  densest at the waterline, in two frames stacked one over the other. */
const CAUSTIC_H = 17;
function causticRows(): string[] {
  const width = TEXELS_PER_METRE;
  const { put, rows } = canvasRows(width, CAUSTIC_H * 2);
  for (let frame = 0; frame < 2; frame++) {
    const rng = createRng(`underground-lake:caustic:${frame}`);
    const points = Array.from({ length: 14 }, () => [rng.next() * width, rng.next() * CAUSTIC_H * 1.6] as const);
    for (let y = 0; y < CAUSTIC_H; y++) {
      const low = 1 - y / CAUSTIC_H;
      for (let x = 0; x < width; x++) {
        const distances = points
          .map(([px, py]) => {
            const dx = Math.min(Math.abs(x - px), width - Math.abs(x - px));
            return Math.hypot(dx, (y - py) * 1.6);
          })
          .sort((a, b) => a - b);
        const edge = distances[1] - distances[0] < 1.1;
        if (!edge || rng.next() > 0.15 + low * 0.6) continue;
        put(x, CAUSTIC_H * frame + (CAUSTIC_H - 1 - y), low > 0.6 ? "g" : low > 0.25 ? "c" : "d");
      }
    }
  }
  return rows();
}

/** A texture of the room's own, so moving its pixels moves nothing else. */
function own(texture: THREE.Texture): THREE.Texture {
  return texture.clone();
}

/** A flat sheet lying on the water, `w` × `d` metres, its texture at the room's pixel size. */
function sheet(w: number, d: number, material: THREE.Material, y: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  mesh.userData.noShadow = true;
  return mesh;
}

/**
 * The lake, filling the hole in the floor: black-teal water whose wavelets
 * creep a pixel at a time, glints drifting across it the other way, and a
 * pale shape circling slowly just under the surface. Built in room metres.
 */
function lake(): THREE.Group {
  const waterMap = own(pixelTexture(waterRows(), { d: "tideDark", s: "soot", c: "tide" }, true));
  const water = sheet(LAKE_W, LAKE_D, new THREE.MeshBasicMaterial({ map: waterMap }), WATER);
  projectUvs(water.geometry, waterMap);
  water.position.set(LAKE_X, WATER, LAKE_Z);

  const glintMap = own(pixelTexture(glintRows(), { g: "tideLight", c: "tide" }, true));
  const glints = sheet(LAKE_W, LAKE_D, lightMaterial(0.7, { map: glintMap }), WATER + 0.02);
  projectUvs(glints.geometry, glintMap);
  glints.position.set(LAKE_X, WATER + 0.02, LAKE_Z);

  const shapeMap = pixelTexture(shapeRows(), { p: "tideDark", l: "void" });
  const thing = sheet(48 / TEXELS_PER_METRE, 16 / TEXELS_PER_METRE, new THREE.MeshBasicMaterial({ map: shapeMap, alphaTest: 0.5 }), WATER + 0.01);

  const loop = { x: -1.0, z: 2.1, rx: 1.3, rz: 0.4, period: 40, phase: 1.26 };
  return group(
    animated(water, (seconds) => {
      waterMap.offset.set(steps(seconds, 1.6), steps(seconds, 0.5));
    }),
    animated(glints, (seconds) => {
      glintMap.offset.set(-steps(seconds, 2.2), steps(seconds, 1.3));
    }),
    animated(thing, (seconds) => {
      const a = (seconds / loop.period) * Math.PI * 2 + loop.phase;
      thing.position.set(loop.x + loop.rx * Math.cos(a), WATER + 0.01, loop.z + loop.rz * Math.sin(a));
      thing.rotation.y = Math.atan2(-loop.rz * Math.cos(a), -loop.rx * Math.sin(a));
    }),
  );
}

/** Rings spreading out over open water from nothing, every few seconds. */
function ripples(period: number, phase: number): THREE.Group {
  const map = own(pixelTexture(ringRows(), { g: "tideLight", c: "tide" }));
  map.repeat.set(1 / RING_FRAMES, 1);
  const ring = sheet(1, 1, lightMaterial(0.8, { map }), WATER + 0.03);
  return group(
    animated(ring, (seconds) => {
      const t = (((seconds + phase) % period) + period) % period;
      map.offset.x = Math.min(RING_FRAMES - 1, Math.floor(t / 0.32)) / RING_FRAMES;
    }),
  );
}

/** The lantern's broken amber streak on the water beside the boat, its dashes
 *  swapped a few times a second. Lies along z, towards +z. */
function reflection(): THREE.Group {
  const frames = 3;
  const w = 8;
  const h = 26;
  const { put, rows } = canvasRows(w * frames, h);
  for (let frame = 0; frame < frames; frame++) {
    const rng = createRng(`underground-lake:reflection:${frame}`);
    for (let y = 0; y < h; y += between(rng, 1, 3)) {
      const spread = 1 + Math.floor((y / h) * 3);
      const length = between(rng, 1, spread + 1);
      const x0 = Math.floor(w / 2 - length / 2) + between(rng, -1, 1);
      for (let k = 0; k < length; k++) put(frame * w + x0 + k, y, y < h * 0.35 ? "f" : y < h * 0.7 ? "a" : "e");
    }
  }
  const map = own(pixelTexture(rows(), { f: "flame", a: "amber", e: "ember" }));
  map.repeat.set(1 / frames, 1);
  const streak = sheet(w / TEXELS_PER_METRE, h / TEXELS_PER_METRE, lightMaterial(0.65, { map }), WATER + 0.025);
  const order = [0, 2, 1, 2, 0, 1, 0];
  return group(
    animated(streak, (seconds) => {
      map.offset.x = order[Math.floor(seconds / 0.3) % order.length] / frames;
    }),
  );
}

/** The water's cold light thrown up the foot of a wall, `length` metres of it,
 *  crawling sideways and shimmering between two frames. It stops under the
 *  cut height, so it never hangs in the air where a wall is cut. Faces +z. */
function causticBand(length: number): THREE.Group {
  const map = own(pixelTexture(causticRows(), { g: "tideLight", c: "tide", d: "tideDark" }, true));
  const height = CAUSTIC_H / TEXELS_PER_METRE;
  map.repeat.set(length, 0.5);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(length, height), lightMaterial(0.55, { map }));
  band.position.y = WATER + 0.03 + height / 2;
  band.userData.noShadow = true;
  return group(
    animated(band, (seconds) => {
      map.offset.set(steps(seconds, 1.4), Math.floor(seconds / 0.55) % 2 === 0 ? 0 : 0.5);
    }),
  );
}

/** Rough coping stones along the lake's two open edges, overhanging the water
 *  a little, with gaps where the jetty and the chain go in and one stone
 *  slipped into the water. Built in room metres. */
function shore(): THREE.Group {
  const rng = createRng("underground-lake:shore");
  const b = batch();
  const colours: PaletteKey[] = ["stoneDark", "stone", "stoneDark", "ash"];
  const overhang = 0.08;
  const depth = 0.3;
  const gaps: [number, number][] = [[-2.0, -1.0], [-0.78, -0.42]];
  // Along the top edge of the lake, running in x.
  const last = LAKE.x[1] + depth - overhang;
  for (let x = LAKE.x[0] + 0.01; x < last - 0.05; ) {
    const length = 0.34 + rng.next() * 0.26;
    const end = Math.min(x + length, last);
    const clear = !gaps.some(([a, c]) => x < c && end > a);
    if (clear) b.block([end - x - 0.006, 0.06 + rng.next() * 0.04, depth], colours[between(rng, 0, 3)], [(x + end) / 2, 0, LAKE.z[0] - depth / 2 + overhang]);
    x = clear ? end : Math.max(end, ...gaps.filter(([a, c]) => x < c && end > a).map(([, c]) => c));
  }
  // Down the right edge, running in z.
  for (let z = LAKE.z[0] + overhang + 0.004; z < LAKE.z[1] - 0.02; ) {
    const length = 0.34 + rng.next() * 0.3;
    const end = Math.min(z + length, LAKE.z[1] - 0.01);
    if (z > 1.2 && z < 1.6) {
      z = end;
      continue;
    }
    b.block([depth, 0.06 + rng.next() * 0.04, end - z - 0.006], colours[between(rng, 0, 3)], [LAKE.x[1] + depth / 2 - overhang, 0, (z + end) / 2]);
    z = end;
  }
  const slipped = new THREE.Matrix4().compose(
    new THREE.Vector3(LAKE.x[1] - 0.25, WATER - 0.02, 1.42),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0.3, -0.25)),
    new THREE.Vector3(1, 1, 1),
  );
  b.add([0.3, 0.09, 0.4], "stoneDark", slipped);
  return group(b.mesh());
}

/** A landing stage of tarred posts and grey boards running out over the
 *  water from the ledge, a plank missing near its end. Runs along +z. */
function jetty(): THREE.Group {
  const rng = createRng("underground-lake:jetty");
  const start = LAKE.z[0] - 0.45;
  const width = 0.9;
  const b = batch();
  for (const x of [-0.36, 0.36]) b.block([0.1, 0.08, JETTY_END - start], "woodDark", [x, 0, (start + JETTY_END) / 2]);
  const colours: PaletteKey[] = ["woodMid", "wood", "woodMid", "woodLight"];
  let i = 0;
  for (let z = start + 0.02; z < JETTY_END - 0.1; z += 0.165, i++) {
    if (i === 11 || i === 13) continue;
    const skew = i === 12 ? 0.08 : 0;
    const wet = z > JETTY_END - 0.6;
    const plank = new THREE.Matrix4().compose(
      new THREE.Vector3((rng.next() - 0.5) * 0.04, 0.1 + skew * 0.3, z + 0.07),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, skew, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    b.add([width + (rng.next() - 0.5) * 0.06, 0.04, 0.14], wet ? "wood" : colours[between(rng, 0, 3)], plank);
  }
  for (const z of [LAKE.z[0] + 0.1, 0.55, JETTY_END - 0.06]) {
    const tall = z === JETTY_END - 0.06;
    for (const x of [-0.42, 0.42]) b.block([0.12, (tall ? 0.42 : 0.12) + 0.6, 0.12], "woodDark", [x, -0.6, z]);
  }
  return group(b.mesh());
}

/** A rowing boat's hull lofted through stations from the stern (−z) to the
 *  bow (+z): each [z, half-width at the gunwale, gunwale height, half-width at
 *  the bottom, bottom height]. `inset` shrinks it for the inside skin, whose
 *  faces turn inwards. */
const STATIONS: [number, number, number, number, number][] = [
  [-0.92, 0.3, 0.2, 0.2, -0.16],
  [-0.6, 0.38, 0.17, 0.24, -0.2],
  [-0.1, 0.42, 0.16, 0.26, -0.22],
  [0.4, 0.38, 0.18, 0.2, -0.2],
  [0.75, 0.24, 0.23, 0.08, -0.14],
  [0.95, 0.02, 0.3, 0.005, -0.02],
];
function hull(colour: PaletteKey, inset = 0): THREE.Mesh {
  const at = STATIONS.map(([z, top, sheer, bottom, keel]) => ({
    z: z + (z < 0 ? inset : -inset * 2),
    top: Math.max(0.005, top - inset),
    sheer: sheer - inset * 0.3,
    bottom: Math.max(0.004, bottom - inset),
    keel: keel + inset,
  }));
  const positions: number[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    for (const [p, q, r] of [[a, b, c], [a, c, d]]) {
      const normal = q.clone().sub(p).cross(r.clone().sub(p));
      const centre = p.clone().add(q).add(r).divideScalar(3);
      const outward = centre.clone().sub(new THREE.Vector3(0, 0.02, centre.z));
      if (centre.z < at[0].z + 0.01) outward.set(0, 0, -1);
      const flip = normal.dot(outward) < 0 !== inset > 0;
      positions.push(...p.toArray(), ...(flip ? [...r.toArray(), ...q.toArray()] : [...q.toArray(), ...r.toArray()]));
    }
  };
  for (let i = 0; i < at.length - 1; i++) {
    const s = at[i];
    const t = at[i + 1];
    for (const side of [-1, 1]) {
      quad(new THREE.Vector3(side * s.top, s.sheer, s.z), new THREE.Vector3(side * t.top, t.sheer, t.z), new THREE.Vector3(side * t.bottom, t.keel, t.z), new THREE.Vector3(side * s.bottom, s.keel, s.z));
    }
    quad(new THREE.Vector3(-s.bottom, s.keel, s.z), new THREE.Vector3(s.bottom, s.keel, s.z), new THREE.Vector3(t.bottom, t.keel, t.z), new THREE.Vector3(-t.bottom, t.keel, t.z));
  }
  const s = at[0];
  quad(new THREE.Vector3(-s.top, s.sheer, s.z), new THREE.Vector3(s.top, s.sheer, s.z), new THREE.Vector3(s.bottom, s.keel, s.z), new THREE.Vector3(-s.bottom, s.keel, s.z));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, flat(colour));
}

/** The hull's half-width at a height and a point along it, read off the stations. */
function hullHalf(z: number, y: number): number {
  const i = Math.max(0, STATIONS.findIndex(([sz], k) => k + 1 < STATIONS.length && z >= sz && z <= STATIONS[k + 1][0]));
  const [z0, top0, sheer0, bottom0, keel0] = STATIONS[i];
  const [z1, top1, sheer1, bottom1, keel1] = STATIONS[i + 1];
  const t = (z - z0) / (z1 - z0);
  const at = (a: number, b: number) => a + (b - a) * t;
  const u = (y - at(keel0, keel1)) / (at(sheer0, sheer1) - at(keel0, keel1));
  return at(bottom0, bottom1) + (at(top0, top1) - at(bottom0, bottom1)) * u;
}

/** An empty rowing boat, its oars shipped and its bow lantern lit, rocking
 *  gently at its mooring. Bow towards +z. */
function boat(): THREE.Group {
  const boards = woodPlanks({ plankPx: 4, size: 32, seed: "underground-lake:boat" });
  const floorY = -0.075;
  const floorShape = new THREE.Shape();
  const zs = [-0.86, -0.6, -0.1, 0.4, 0.68];
  zs.forEach((z, i) => (i ? floorShape.lineTo(hullHalf(z, floorY), -z) : floorShape.moveTo(hullHalf(z, floorY), -z)));
  [...zs].reverse().forEach((z) => floorShape.lineTo(-hullHalf(z, floorY), -z));
  const floorGeometry = new THREE.ShapeGeometry(floorShape).rotateX(-Math.PI / 2);
  floorGeometry.translate(0, floorY, 0);
  const floor = new THREE.Mesh(projectUvs(floorGeometry, boards), textured(boards));

  const b = batch();
  for (const [z, y] of [[-0.78, 0.07], [-0.2, 0.06], [0.42, 0.08]]) b.block([hullHalf(z, y) * 2 + 0.01, 0.04, 0.2], "woodLight", [0, y, z]);
  for (const [x, turn, colour] of [[-0.12, 0.05, "woodLight"], [0.1, -0.04, "woodMid"]] as const) {
    const oar = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.12, -0.15), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.03, turn, 0)), new THREE.Vector3(1, 1, 1));
    b.add([0.045, 0.045, 1.7], colour, oar);
    const blade = new THREE.Matrix4().compose(new THREE.Vector3(x - turn * 0.8, 0.105, -0.95), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.03, turn, 0)), new THREE.Vector3(1, 1, 1));
    b.add([0.14, 0.02, 0.42], colour, blade);
  }
  b.block([0.04, 0.82, 0.04], "woodDark", [0, floorY, 0.66]);
  b.block([0.04, 0.04, 0.26], "woodDark", [0, 0.755, 0.76]);
  strand(b, new THREE.Vector3(0, 0.26, 0.9), new THREE.Vector3(...MOORING), 0.03, "boneDark");

  const light = lantern();
  light.position.set(0, 0.72, 0.86);
  const body = group(hull("wood"), hull("woodMid", 0.025), floor, b.mesh(), light);
  return group(
    animated(body, (seconds) => {
      body.position.y = 0.012 * Math.sin(seconds * 1.3);
      body.rotation.z = 0.03 * Math.sin(seconds * 0.9 + 1);
      body.rotation.x = 0.012 * Math.sin(seconds * 1.1 + 0.4);
    }),
  );
}

/** A rusted chain from a ring in the wall, across the ledge and down into
 *  the lake, pulled taut by something below. Built in room metres. */
function chain(): THREE.Group {
  const path: [number, number, number][] = [
    [-0.9, 0.3, -INNER + 0.1],
    [-0.9, 0.0, -INNER + 0.38],
    [-0.61, 0.0, LAKE.z[0] + 0.05],
    [-0.6, WATER - 0.25, LAKE.z[0] + 0.25],
  ];
  const b = batch();
  const link = 0.075;
  path.slice(1).forEach((to, i) => {
    const from = new THREE.Vector3(...path[i]);
    const end = new THREE.Vector3(...to);
    const span = end.clone().sub(from);
    const count = Math.ceil(span.length() / link);
    const yaw = Math.atan2(span.x, span.z);
    const pitch = -Math.atan2(span.y, Math.hypot(span.x, span.z));
    for (let k = 0; k < count; k++) {
      const at = from.clone().addScaledVector(span, (k + 0.5) / count);
      const flatLink = (k + i) % 2 === 0;
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, flatLink ? 0 : Math.PI / 2, "YXZ"));
      const reach = (Math.abs(Math.sin(pitch)) * (link + 0.02) + Math.cos(pitch) * (flatLink ? 0.016 : 0.045)) / 2;
      if (at.z < LAKE.z[0] + 0.05) at.y = Math.max(at.y, reach);
      b.add([0.045, 0.016, link + 0.02], k % 3 === 0 ? "stoneDark" : "ash", new THREE.Matrix4().compose(at, rotation, new THREE.Vector3(1, 1, 1)));
    }
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 4, 8), flat("ash"));
  ring.position.set(-0.9, 0.32, -INNER + 0.075);
  const plate = box([0.12, 0.12, 0.03], flat("soot"), [-0.9, 0.26, -INNER + 0.045]);
  return group(b.mesh(), ring, plate);
}

/** Wet footprints of bare feet coming up out of the lake beside the jetty,
 *  crossing the ledge towards the top door, and drying to nothing. Built in
 *  room metres, a decal on the floor. */
function footprints(): THREE.Mesh {
  const w = 40;
  const h = 64;
  const { put, rows } = canvasRows(w, h);
  const foot = ["..##.", ".###.", "####.", "####.", ".###.", ".##..", ".###.", ".###.", "..#.."];
  const prints: [number, number, boolean][] = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = Math.round(4 + t * 22 + (i % 2 ? 3 : -3));
    const y = Math.round(h - 12 - t * 46);
    prints.push([x, y, i % 2 === 1]);
  }
  prints.forEach(([x, y, mirror], i) => {
    foot.forEach((row, dy) => {
      [...row].forEach((c, dx) => {
        if (c === "#" && (i < 5 || (dx + dy + i) % (i < 7 ? 2 : 3) === 0)) put(x + (mirror ? 4 - dx : dx), y + dy, "w");
      });
    });
  });
  const mesh = pixelPlane(pixelTexture(rows(), { w: "tide" }), { alpha: true });
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.noShadow = true;
  return mesh;
}

/** A coil of wet rope lying on the stone, a loose end trailing. */
function ropeCoil(): THREE.Group {
  return group(coil(), box([0.5, 0.05, 0.05], flat("boneDark"), [0.42, 0, 0.12]));
}

/** Two stacked crates and a barrel, stores for the boat long left. Faces +z. */
function stores(): THREE.Group {
  const below = crate([0.55, 0.55, 0.55], "woodMid");
  const above = crate([0.42, 0.42, 0.42]);
  above.position.set(0.05, 0.55, 0.02);
  const barrel = cask({ height: 0.7, lid: false });
  barrel.position.set(-0.05, 0, 0.7);
  return group(below, above, barrel);
}

/** The Underground Lake: a black lake filling half the cellar floor, glowing
 *  cold cyan up the stone, with an empty boat at its jetty, its lantern lit. */
export const UNDERGROUND_LAKE: RoomDefinition = {
  id: "underground-lake",
  floor: () => flagstones({ stonePx: 12, seed: "underground-lake" }),
  wall: () => flagstones({ stonePx: 10, seed: "underground-lake:walls", ramp: ["soot", "stoneDark", "ash", "stoneDark", "stone"] }),
  wainscot: () => flagstones({ stonePx: 10, seed: "underground-lake:tide-mark", ramp: ["void", "sootLight", "tideDark", "ash"] }),
  trim: "stoneDark",
  floorOpenings: [LAKE],
  props: [
    { build: lake, at: [0, 0] },
    { build: shore, at: [0, 0] },
    { build: jetty, at: [JETTY_X, 0] },
    { build: boat, at: BOAT, contacts: [{ with: "jetty", because: "its mooring rope is tied to the jetty's end post" }] },
    { build: reflection, at: [BOAT[0], 2.3] },
    { build: () => ripples(7, 0), name: "ripples", at: [0.25, 2.15] },
    { build: () => ripples(11, 4.5), name: "ripples", at: [-2.2, 0.0] },
    { build: () => causticBand(LAKE_D - 0.1), name: "causticBand", ...onWall("left", -LAKE_Z + 0.05, { out: 0.06 }) },
    { build: () => causticBand(LAKE_W - 0.1), name: "causticBand", ...onWall("bottom", -LAKE_X - 0.05, { out: 0.06 }) },
    { build: chain, at: [0, 0] },
    { build: ropeCoil, at: [-0.15, -1.2], turn: 30 },
    { build: stores, at: [-2.35, -2.3], turn: 90 },
    { build: footprints, at: [-0.6, -1.75], y: 0.004 },
  ],
  lights: [
    { at: [-2.35, WATER + 0.3, 0.1], colour: "tideLight", intensity: 6, range: 5.5, flicker: 0.45, signal: "water" },
    { at: [-2.3, WATER + 0.3, 2.3], colour: "tideLight", intensity: 6, range: 5.5, flicker: 0.45, signal: "water" },
    { at: [-0.3, WATER + 0.3, 2.35], colour: "tideLight", intensity: 6, range: 5.5, flicker: 0.45, signal: "water" },
    { at: [0.45, WATER + 0.3, 0.45], colour: "tideLight", intensity: 6, range: 5.5, flicker: 0.45, signal: "water" },
  ],
  focus: [-0.6, 0.3, 1.0],
  pawn: [1.9, -1.7],
  spots: [[1.15, -1.3], [1.85, -0.75], [1.65, 0.1], [1.15, -2.15], [1.65, 1.0]],
};
