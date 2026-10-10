import * as THREE from "three";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { cask, coil, crate, lantern, strand } from "../kit";
import { causticSides, waterCaustics, waterRectangle, waterSurface, type CausticFace, type WaterContact, type WaterLamp } from "../kit/water";
import type { PaletteKey } from "../palette";
import { CUT_HEIGHT, INNER, WAINSCOT_DEPTH, type PropPlacement, type RoomDefinition } from "../room";
import { RAIL, SKIRTING } from "../stage";
import { batch, box, flat, group, pixelPlane, projectUvs, textured } from "../shapes";
import { flagstones, pixelTexture, TEXELS_PER_METRE, woodPlanks } from "../textures";

/** The hole in the floor the lake fills, along the left and bottom walls; the
 *  dry stone left over is a ledge under the two doors. */
const LAKE = { x: [-INNER, 0.9] as [number, number], z: [-0.6, INNER] as [number, number] };
/** The water's surface, a little below the floor. */
const WATER = -0.12;
/** The jetty's middle line, and where it ends out on the water. */
const JETTY_X = -1.5;
const JETTY_END = 1.7;
/** Where the boat lies, and the jetty's end post its rope is tied to, in the boat's frame. */
const BOAT: [number, number] = [JETTY_X + 0.98, 0.95];
const MOORING: [number, number, number] = [JETTY_X + 0.42 - BOAT[0] + 0.06, 0.32, JETTY_END - 0.06 - BOAT[1]];

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

/**
 * The water's surface, in one of two treatments of the kit's water shader
 * (`kit/water.ts`) for the owner to choose between, picked by the page's URL
 * (`?water=<style>`) on the bench and in the house. Both move under slow
 * drifting noise, reflect the lantern and the water's own cold glows, shade
 * to black away from the shore, lap and ring round what stands in it, and
 * throw their light up the walls and the jetty's posts as caustics:
 * - `shader`, the default, draws it smoothly;
 * - `shader-palette` draws it a texel at a time in the art's palette, as the
 *   floors' textures are.
 */
const WATER_STYLES = ["shader", "shader-palette"] as const;
type WaterStyle = (typeof WATER_STYLES)[number];

function isWaterStyle(value: string): value is WaterStyle {
  return (WATER_STYLES as readonly string[]).includes(value);
}

/** The water this page asks for; a value it doesn't know throws, so a typo never passes for a choice. Rooms are also
 *  built in tests, which have no page. */
function waterStyle(): WaterStyle {
  const search = typeof window === "undefined" ? "" : window.location.search;
  const style = new URLSearchParams(search).get("water") ?? "shader";
  if (!isWaterStyle(style)) throw new Error(`water=${style}: it is one of ${WATER_STYLES.join(", ")}`);
  return style;
}

/** The thing's slow loop under the surface: where it is, and which way it heads. */
const LOOP = { x: -1.0, z: 2.1, rx: 1.3, rz: 0.4, period: 40, phase: 1.26 };
function thingAt(seconds: number): { x: number; z: number; heading: number } {
  const a = (seconds / LOOP.period) * Math.PI * 2 + LOOP.phase;
  return {
    x: LOOP.x + LOOP.rx * Math.cos(a),
    z: LOOP.z + LOOP.rz * Math.sin(a),
    heading: Math.atan2(-LOOP.rz * Math.cos(a), -LOOP.rx * Math.sin(a)),
  };
}

/** The thing just under the surface, circling. */
function thing(): THREE.Mesh {
  const map = pixelTexture(shapeRows(), { p: "tideDark", l: "soot" });
  const geometry = new THREE.PlaneGeometry(48 / TEXELS_PER_METRE, 16 / TEXELS_PER_METRE).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map, alphaTest: 0.5 }));
  mesh.userData.noShadow = true;
  mesh.position.y = WATER + 0.01;
  return animated(mesh, (seconds) => {
    const at = thingAt(seconds);
    mesh.position.set(at.x, WATER + 0.01, at.z);
    mesh.rotation.y = at.heading;
  });
}

/** Where the bow lantern's flame hangs, in room metres, the boat at rest. */
const LANTERN_FLAME: [number, number, number] = [BOAT[0], 0.57, BOAT[1] + 0.91];

/** What stands in the lake at a moment: the jetty's posts, the rocking boat's
 *  hull at the waterline, and the thing's wake, trailing behind it. */
function lakeContacts(seconds: number): WaterContact[] {
  const posts = [LAKE.z[0] + 0.1, 0.55, JETTY_END - 0.06].flatMap((z) => [-0.42, 0.42].map((x) => ({ x: JETTY_X + x, z, radius: 0.07, strength: 0.7 })));
  // It slaps hardest as it rocks down (its bob is a sine on 1.3 rad/s).
  const slap = 0.35 + 0.45 * Math.max(0, -Math.cos(seconds * 1.3));
  const hullAt = [-0.7, -0.25, 0.2, 0.6].map((z) => ({ x: BOAT[0], z: BOAT[1] + z, radius: hullHalf(z, WATER), strength: slap }));
  const wake = [0.5, 1.2, 2].map((behind, i) => {
    const at = thingAt(seconds - behind);
    return { x: at.x, z: at.z, radius: 0.08, strength: 0.7 - i * 0.2 };
  });
  return [...posts, ...hullAt, ...wake];
}

/** How high above the water its thrown light reaches, fading out. */
const CAUSTIC_REACH = 2;

type LakeWall = "left" | "bottom";

/** The faces of a wall the lake laps at, as the water's caustics light them,
 *  from the water up to `top`: the floor slab's cut edge down to the water,
 *  then the skirting, the wainscot, its rail and the bare wall above. */
function wallFaces(wall: LakeWall, top: number): CausticFace[] {
  const [at, along, inward]: [(out: number, along: number) => [number, number], [number, number], [number, number]] =
    wall === "left"
      ? [(out, z) => [-INNER + out, z], [LAKE.z[0], INNER - SKIRTING.depth], [1, 0]]
      : [(out, x) => [x, INNER - out], [-INNER + SKIRTING.depth, LAKE.x[1]], [0, -1]];
  const profile: [out: number, bottom: number, top: number][] = [
    [0, WATER, 0],
    [SKIRTING.depth, 0, SKIRTING.height],
    [WAINSCOT_DEPTH, SKIRTING.height, RAIL.y],
    [RAIL.depth, RAIL.y, RAIL.y + RAIL.height],
    [0, RAIL.y + RAIL.height, WATER + CAUSTIC_REACH],
  ];
  return profile.flatMap(([out, low, high]) => {
    const from = Math.max(low, top === CUT_HEIGHT ? WATER : CUT_HEIGHT);
    const to = Math.min(high, top);
    return to > from ? [{ from: at(out, along[0]), to: at(out, along[1]), bottom: from, top: to, facing: inward }] : [];
  });
}

/** What the light thrown off the water plays on below the cut height: the
 *  feet of the two walls the lake laps at, and the jetty's posts, up to
 *  under its boards. The walls above are hung on them (see `wallCaustics`). */
function causticFaces(): CausticFace[] {
  const posts = [LAKE.z[0] + 0.1, 0.55, JETTY_END - 0.06].flatMap((z) =>
    [-0.42, 0.42].flatMap((x) => causticSides([JETTY_X + x - 0.06, JETTY_X + x + 0.06], [z - 0.06, z + 0.06], z === JETTY_END - 0.06 ? 0.42 : 0.08)),
  );
  return [...wallFaces("left", CUT_HEIGHT), ...wallFaces("bottom", CUT_HEIGHT), ...posts];
}

/** The lake's water as last built: a wall's caustics above the cut height are
 *  a piece of their own, hung on the wall so they go when it is cut, and are
 *  cast by this water, which the room builds first. */
let builtWater: THREE.Mesh | undefined;

/** The water's light up a wall above the cut height, hung on that wall. Built
 *  in room metres, placed at the cut height. */
function wallCaustics(wall: LakeWall): THREE.Group {
  if (!builtWater) throw new Error("The lake's wall caustics are built after its water");
  const layer = waterCaustics(builtWater, { faces: wallFaces(wall, WATER + CAUSTIC_REACH), reach: CAUSTIC_REACH });
  layer.position.y = -CUT_HEIGHT;
  return group(layer);
}

/** The lake, filling the hole in the floor: the kit's water, reflecting the
 *  bow lantern and three of the water's own cold glows, the boat's lantern
 *  brightest, and throwing their light up the walls and the jetty's posts,
 *  over a dark shape circling slowly just under its surface. Built in room metres. */
function lake(): THREE.Group {
  const glows: WaterLamp[] = (UNDERGROUND_LAKE.lights ?? []).slice(0, 3).map(({ at, colour, flicker, signal }) => ({ at, colour, intensity: 2.5, flicker, signal }));
  const water = waterSurface({
    outline: waterRectangle(LAKE.x, LAKE.z),
    height: WATER,
    // Its top and right edges are the shore; the walls drop straight into the deep.
    shores: [true, true, false, false],
    shelf: 1.1,
    colours: { shallow: "tideDark", deep: "void", sheen: "moonDark" },
    lamps: [{ at: LANTERN_FLAME, colour: "amber", intensity: 5, flicker: 0.15 }, ...glows],
    contacts: lakeContacts,
    palette: waterStyle() === "shader-palette" ? ["void", "soot", "sootLight", "tideDark", "tide", "tideLight", "moonDark", "moon", "ember", "amber", "flame"] : undefined,
    caustics: { faces: causticFaces(), reach: CAUSTIC_REACH },
  });
  builtWater = water;
  return group(water, thing());
}

/** The walls' caustics above the cut height, each hung on its wall. */
function wallCausticPieces(): PropPlacement[] {
  return (["left", "bottom"] as const).map((wall) => ({ build: () => wallCaustics(wall), name: "wallCaustics", at: [0, 0], y: CUT_HEIGHT, walls: [wall] }));
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
  // The beams stop just short of the end posts' faces, so their ends never lie in one plane.
  const beamEnd = JETTY_END - 0.006;
  for (const x of [-0.36, 0.36]) b.block([0.1, 0.08, beamEnd - start], "woodDark", [x, 0, (start + beamEnd) / 2]);
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
    // A short post stops just under the boards' tops, so its top never lies in their plane.
    for (const x of [-0.42, 0.42]) b.block([0.12, (tall ? 0.42 : 0.114) + 0.6, 0.12], "woodDark", [x, -0.6, z]);
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
    ...wallCausticPieces(),
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
  spots: [[0.6, -1.35], [1.65, -0.4], [1.9, 0.9], [-0.75, -1.75], [1.65, 2.2]],
  overflow: [[2.35, -2.35], [-1.5, -1.5], [2.35, -1.05], [2.25, 1.7], [1.4, -2.3]],
  // Along the shore, clear of the water.
  lanes: [
    [[0, -2.2], [0.9, -2.0], [1.6, -1.2], [1.75, 0], [1.65, 1.8]],
    [[2.2, 0], [1.75, 0]],
  ],
};
