import * as THREE from "three";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { cask, coil, crate, lantern, strand } from "../kit";
import { causticSides, waterCaustics, waterRectangle, waterSurface, type CausticFace, type WaterContact, type WaterLamp } from "../kit/water";
import type { PaletteKey } from "../palette";
import { CUT_HEIGHT, INNER, onWall, WAINSCOT_DEPTH, type PropPlacement, type RoomDefinition } from "../room";
import { RAIL, SKIRTING } from "../stage";
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
 * The water's surface, in one of several treatments for the owner to compare,
 * picked by the page's URL (`?water=<style>`) on the bench and in the house:
 * - `current`, the default: the whole surface's wavelets and glints pan a
 *   texel at a time;
 * - `glints`: the same wavelets, dimmed and still, with a few sparse glints
 *   that flare, run a few texels and go out, each on its own clock;
 * - `still`: a dark, still surface shading from the shallows to black, the
 *   walls' cold light reflected along their feet, and a few long highlight
 *   lines swelling and drifting slowly across it;
 * - `shallows`: the same shading, still in the deep, moving only where
 *   something touches it: lapping at the shore, rings round the jetty's
 *   posts, along the boat's side and in the wake of the thing below;
 * - `shader`: the kit's water shader (`kit/water.ts`), drawn smoothly: a
 *   surface moving under slow drifting noise, the lantern and the water's
 *   own cold glows reflected in it, shading to black away from the shore,
 *   with lapping and rings round what stands in it, and their light thrown
 *   off the moving surface up the walls and the jetty's posts as caustics,
 *   in place of the other styles' pixel-art band;
 * - `shader-palette`: the same, drawn a texel at a time in the art's
 *   palette, as the floors' textures are.
 */
export const WATER_STYLES = ["current", "glints", "still", "shallows", "shader", "shader-palette"] as const;
export type WaterStyle = (typeof WATER_STYLES)[number];

function isWaterStyle(value: string): value is WaterStyle {
  return (WATER_STYLES as readonly string[]).includes(value);
}

/** The water a page's query string asks for; a value the page doesn't know throws, so a typo never passes for a choice. */
export function waterFromSearch(search: string): WaterStyle {
  const style = new URLSearchParams(search).get("water") ?? "current";
  if (!isWaterStyle(style)) throw new Error(`water=${style}: it is one of ${WATER_STYLES.join(", ")}`);
  return style;
}

/** The water this page asks for. Rooms are also built in tests, which have no page. */
function waterStyle(): WaterStyle {
  return waterFromSearch(typeof window === "undefined" ? "" : window.location.search);
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
function thing(legend: { p: PaletteKey; l: PaletteKey }): THREE.Mesh {
  const shapeMap = pixelTexture(shapeRows(), legend);
  const mesh = sheet(48 / TEXELS_PER_METRE, 16 / TEXELS_PER_METRE, new THREE.MeshBasicMaterial({ map: shapeMap, alphaTest: 0.5 }), WATER + 0.01);
  return animated(mesh, (seconds) => {
    const at = thingAt(seconds);
    mesh.position.set(at.x, WATER + 0.01, at.z);
    mesh.rotation.y = at.heading;
  });
}

/**
 * The lake, filling the hole in the floor: black-teal water whose wavelets
 * creep a pixel at a time, glints drifting across it the other way, and a
 * pale shape circling slowly just under the surface. Built in room metres.
 */
function lake(): THREE.Group {
  const style = waterStyle();
  if (style === "glints") return glintingLake();
  if (style === "still") return stillLake();
  if (style === "shallows") return shallowLake();
  if (style === "shader" || style === "shader-palette") return shaderLake(style === "shader-palette");

  const waterMap = own(pixelTexture(waterRows(), { d: "tideDark", s: "soot", c: "tide" }, true));
  const water = sheet(LAKE_W, LAKE_D, new THREE.MeshBasicMaterial({ map: waterMap }), WATER);
  projectUvs(water.geometry, waterMap);
  water.position.set(LAKE_X, WATER, LAKE_Z);

  const glintMap = own(pixelTexture(glintRows(), { g: "tideLight", c: "tide" }, true));
  const glints = sheet(LAKE_W, LAKE_D, lightMaterial(0.7, { map: glintMap }), WATER + 0.02);
  projectUvs(glints.geometry, glintMap);
  glints.position.set(LAKE_X, WATER + 0.02, LAKE_Z);

  return group(
    animated(water, (seconds) => {
      waterMap.offset.set(steps(seconds, 1.6), steps(seconds, 0.5));
    }),
    animated(glints, (seconds) => {
      glintMap.offset.set(-steps(seconds, 2.2), steps(seconds, 1.3));
    }),
    thing({ p: "tideDark", l: "void" }),
  );
}

/** A number in [0, 1) from two integers, the same every time: where and when a sprite shows, as a pure function of the clock. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Snaps metres to the pixel grid, so sprites move a whole texel at a time. */
function snap(metres: number): number {
  return Math.round(metres * TEXELS_PER_METRE) / TEXELS_PER_METRE;
}

/** A sprite's run of frames, each a grid of rows the same size; rows run towards +z, columns towards +x. */
type Frames = string[][];
/** Which frame of which kind a sprite shows, centred where, or null while it is hidden. */
type SpritePose = { kind: number; frame: number; x: number; z: number } | null;

/**
 * Pixel sprites lying flat on the water, all in one draw: each shows one
 * frame of its kind, from one atlas, wherever and whenever `pose` says. So
 * the water moves only where a sprite is, each on a clock of its own,
 * rather than the whole surface stepping at once.
 */
function spriteLayer(kinds: Frames[], legend: Record<string, PaletteKey>, count: number, pose: (i: number, seconds: number) => SpritePose, opacity: number): THREE.Mesh {
  const cells = kinds.map((frames) => ({ w: frames[0][0].length, h: frames[0].length, n: frames.length }));
  const width = Math.max(...cells.map((c) => c.n * (c.w + 1)));
  const tops = cells.map((_, k) => cells.slice(0, k).reduce((sum, c) => sum + c.h + 1, 0));
  const height = tops[tops.length - 1] + cells[cells.length - 1].h + 1;
  const { put, rows } = canvasRows(width, height);
  kinds.forEach((frames, k) =>
    frames.forEach((frame, f) => frame.forEach((row, y) => [...row].forEach((c, x) => c !== "." && put(f * (cells[k].w + 1) + x, tops[k] + y, c)))),
  );
  const map = pixelTexture(rows(), legend);

  const position = new THREE.BufferAttribute(new Float32Array(count * 12), 3);
  const uv = new THREE.BufferAttribute(new Float32Array(count * 8), 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", position);
  geometry.setAttribute("uv", uv);
  geometry.setIndex(Array.from({ length: count }, (_, i) => [0, 2, 1, 0, 3, 2].map((v) => i * 4 + v)).flat());
  const mesh = new THREE.Mesh(geometry, lightMaterial(opacity, { map }));
  mesh.position.y = WATER + 0.02;
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;

  const place = (seconds: number) => {
    for (let i = 0; i < count; i++) {
      const at = pose(i, seconds);
      if (!at) {
        for (let v = 0; v < 4; v++) position.setXYZ(i * 4 + v, 0, 0, 0);
        continue;
      }
      const { w, h } = cells[at.kind];
      const x0 = snap(at.x - w / TEXELS_PER_METRE / 2);
      const z0 = snap(at.z - h / TEXELS_PER_METRE / 2);
      const x1 = x0 + w / TEXELS_PER_METRE;
      const z1 = z0 + h / TEXELS_PER_METRE;
      const u0 = (at.frame * (w + 1)) / width;
      const u1 = (at.frame * (w + 1) + w) / width;
      const v0 = 1 - tops[at.kind] / height;
      const v1 = 1 - (tops[at.kind] + h) / height;
      position.setXYZ(i * 4, x0, 0, z0);
      position.setXYZ(i * 4 + 1, x1, 0, z0);
      position.setXYZ(i * 4 + 2, x1, 0, z1);
      position.setXYZ(i * 4 + 3, x0, 0, z1);
      uv.setXY(i * 4, u0, v0);
      uv.setXY(i * 4 + 1, u1, v0);
      uv.setXY(i * 4 + 2, u1, v1);
      uv.setXY(i * 4 + 3, u0, v1);
    }
    position.needsUpdate = true;
    uv.needsUpdate = true;
  };
  place(0);
  return animated(mesh, place);
}

/** Where a sprite's life is at a time: which life it is on (counting from 0)
 *  and how many frames into it, on a period and phase of its own. */
function lifeAt(seconds: number, period: number, phase: number, frameSeconds: number): { life: number; frame: number } {
  const t = seconds + phase;
  const life = Math.floor(t / period);
  return { life, frame: Math.floor((t - life * period) / frameSeconds) };
}

/** A point on open water, from two numbers in [0, 1). */
function onWater(u: number, v: number, margin = 0.2): [number, number] {
  return [LAKE.x[0] + margin + u * (LAKE_W - margin * 2), LAKE.z[0] + margin + v * (LAKE_D - margin * 2)];
}

/** The lake's size in whole texels, for a texture laid once across it. */
const LAKE_TEXELS = { w: Math.round(LAKE_W * TEXELS_PER_METRE), h: Math.round(LAKE_D * TEXELS_PER_METRE) };

/** A 4×4 ordered dither: shades a gradient in pixel steps, from one palette. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((n) => (n + 0.5) / 16);

/**
 * The whole lake as one still texture, laid once across it: shading from the
 * shallows at the shore down to black over a metre and a half, the cold light
 * on the walls reflected in broken dashes along their feet, and a scatter of
 * faint still wavelets on the dark. Columns run from the left wall (+x),
 * rows from the shore at the top (+z).
 */
function depthRows(): string[] {
  const { w, h } = LAKE_TEXELS;
  const rng = createRng("underground-lake:depth");
  const { put, rows } = canvasRows(w, h);
  const ramp = ["t", "d", "s", "v"];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const shore = Math.min(y, w - 1 - x);
      const level = Math.min(ramp.length - 1, 0.6 + shore / 16);
      const step = Math.floor(level) + (level % 1 > BAYER[(y % 4) * 4 + (x % 4)] ? 1 : 0);
      put(x, y, ramp[Math.min(ramp.length - 1, step)]);
    }
  }
  // The walls' cold light, reflected: broken dashes along each wall's foot, thinning away from it.
  for (let i = 0; i < 70; i++) {
    const out = Math.floor(rng.next() ** 2 * 10);
    const length = between(rng, 2, 7);
    const c = out < 2 ? "c" : "d";
    const along = between(rng, 0, Math.max(w, h));
    if (rng.next() < (h / (w + h))) for (let k = 0; k < length; k++) put(out, along + k, c);
    else for (let k = 0; k < length; k++) put(along + k, h - 1 - out, c);
  }
  // Faint still wavelets on the dark water.
  for (let i = 0; i < 40; i++) {
    const x = between(rng, 0, w - 1);
    const y = between(rng, 0, h - 1);
    if (Math.min(y, w - 1 - x) < 20) continue;
    for (let k = between(rng, 2, 5); k > 0; k--) put(x + k, y, "d");
  }
  return rows();
}

/** The lake's still water, one texture laid once across the hole. */
function stillWater(): THREE.Mesh {
  const map = pixelTexture(depthRows(), { t: "tide", d: "tideDark", s: "soot", v: "void", c: "tide" });
  return sheet(LAKE_W, LAKE_D, new THREE.MeshBasicMaterial({ map }), WATER);
}

/** A placed copy of a mesh: `sheet` lies its meshes at the origin. */
function at(mesh: THREE.Mesh, x: number, z: number): THREE.Mesh {
  mesh.position.x = x;
  mesh.position.z = z;
  return mesh;
}

/** A glint's life, 7 × 3 texels: a point, a flare with a cross, a break into two, gone. */
const GLINT: Frames = [
  [".......", "...c...", "......."],
  [".......", "..cgc..", "......."],
  ["...c...", ".cgggc.", "...c..."],
  [".......", "..cgc..", "......."],
  [".......", ".c...c.", "......."],
];

/** `glints`: the wavelets dimmed and still, under sparse glints that each
 *  flare and run a few texels on a clock of its own, somewhere new each time. */
function glintingLake(): THREE.Group {
  const map = own(pixelTexture(waterRows(), { d: "soot", s: "void", c: "tideDark" }, true));
  const water = sheet(LAKE_W, LAKE_D, new THREE.MeshBasicMaterial({ map }), WATER);
  projectUvs(water.geometry, map);
  const frameSeconds = 0.2;
  const glints = spriteLayer([GLINT], { g: "tideLight", c: "tide" }, 40, (i, seconds) => {
    const period = 3 + hash(i, -1) * 4;
    const { life, frame } = lifeAt(seconds, period, hash(i, -2) * period, frameSeconds);
    if (frame >= GLINT.length) return null;
    const [x, z] = onWater(hash(i, life * 2), hash(i, life * 2 + 1));
    const run = hash(i, life) < 0.5 ? -1 : 1;
    return { kind: 0, frame, x: x + (run * frame) / TEXELS_PER_METRE, z };
  }, 0.85);
  return group(at(water, LAKE_X, LAKE_Z), glints, thing({ p: "tideDark", l: "void" }));
}

/** A highlight line on a slow swell, 22 × 2 texels: it lengthens, brightens at
 *  its middle, and shortens again, kinked a texel where the swell bends it. */
const SWELL: Frames = [3, 8, 13, 17, 20, 22, 20, 17, 13, 8, 3].map((length) => {
  const start = Math.floor((22 - length) / 2);
  const look = (x: number) => (x < start || x >= start + length ? "." : length >= 17 && Math.abs(x - 10.5) < length / 6 ? "g" : length >= 8 ? "c" : "d");
  const bent = (x: number) => x < 6 || x > 15;
  return [0, 1].map((row) => Array.from({ length: 22 }, (_, x) => (bent(x) === (row === 1) ? look(x) : ".")).join(""));
});

/** `still`: dark still water, shading to black away from the shore, the walls'
 *  light reflected along their feet, and a few long highlight lines swelling
 *  and drifting slowly across it. */
function stillLake(): THREE.Group {
  const frameSeconds = 0.38;
  const lines = spriteLayer([SWELL], { g: "tideLight", c: "tide", d: "tideDark" }, 9, (i, seconds) => {
    const period = 7 + hash(i, -1) * 6;
    const { life, frame } = lifeAt(seconds, period, hash(i, -2) * period, frameSeconds);
    if (frame >= SWELL.length) return null;
    const [x, z] = onWater(hash(i, life * 2), hash(i, life * 2 + 1), 0.4);
    return { kind: 0, frame, x: x + frame / TEXELS_PER_METRE, z };
  }, 0.7);
  return group(at(stillWater(), LAKE_X, LAKE_Z), lines, thing({ p: "tideDark", l: "soot" }));
}

/** Lapping water, `length` texels along a shore and 6 out: a line leaves the
 *  shore (row 0) bright and whole, and fades and breaks as it moves out. */
function lapFrames(length: number, seed: string): Frames {
  const rng = createRng(seed);
  const looks = [["g", 0.75], ["c", 0.85], ["c", 0.7], ["d", 0.6], ["d", 0.35]] as const;
  return looks.map(([c, whole], out) =>
    Array.from({ length: 6 }, (_, row) =>
      Array.from({ length }, (_, x) => {
        if (row !== out || rng.next() >= whole) return ".";
        return c === "g" && (x < 4 || x >= length - 4 || rng.next() < 0.5) ? "c" : c;
      }).join(""),
    ),
  );
}

/** Turns a sprite's frames so its rows run along x instead: `back` mirrors them, so it moves towards −x. */
function sideways(frames: Frames, back: boolean): Frames {
  return frames.map((rows) =>
    Array.from({ length: rows[0].length }, (_, x) =>
      Array.from({ length: rows.length }, (_, y) => rows[back ? rows.length - 1 - y : y][x]).join(""),
    ),
  );
}

/** Rings spreading round a post or a disturbance, 15 × 15 texels, out from radius 3. */
const RING: Frames = [3, 4, 5, 6, 7].map((radius, f) =>
  Array.from({ length: 15 }, (_, y) =>
    Array.from({ length: 15 }, (_, x) => {
      const d = Math.hypot(x - 7, (y - 7) * 1.15);
      if (Math.abs(d - radius) >= 0.55) return ".";
      if (f > 2 && (x + y) % 2 === 1) return ".";
      return f === 0 ? "g" : f < 3 ? "c" : "d";
    }).join(""),
  ),
);

/** `shallows`: the still, dark water of `still`, moving only where something
 *  touches it: lapping along the shore in a wave that runs along it, rings
 *  round the jetty's posts, lapping off the boat's side as it rocks, and
 *  rings in the wake of the thing circling below. */
function shallowLake(): THREE.Group {
  const shoreTop = LAKE.z[0] + 0.08;
  const shoreRight = LAKE.x[1] - 0.08;
  const lapLength = 20;
  const lap = lapLength / TEXELS_PER_METRE;
  const half = 3 / TEXELS_PER_METRE;
  const down = lapFrames(lapLength, "underground-lake:lap:top");
  const kinds = [down, sideways(lapFrames(lapLength, "underground-lake:lap:right"), true), sideways(lapFrames(lapLength, "underground-lake:lap:boat"), false), RING];
  const [TOP, RIGHT, BOAT_SIDE, RINGS] = [0, 1, 2, 3];

  type Toucher = { kind: number; x: number; z: number; period: number; phase: number; frameSeconds: number; frames: number };
  const touchers: Toucher[] = [];
  // Along the top shore and down the right one, the lapping runs along the shore as a wave.
  for (let x = LAKE.x[0] + lap / 2; x < shoreRight - lap / 2; x += lap) {
    touchers.push({ kind: TOP, x, z: shoreTop + half, period: 2.6, phase: -x * 0.8, frameSeconds: 0.3, frames: down.length });
  }
  for (let z = shoreTop + lap / 2; z < LAKE.z[1] - lap / 2; z += lap) {
    touchers.push({ kind: RIGHT, x: shoreRight - half, z, period: 2.6, phase: (shoreRight - LAKE.x[0]) * 0.8 - z * 0.8, frameSeconds: 0.3, frames: down.length });
  }
  // The jetty's posts standing in the water.
  [[JETTY_X - 0.42, 0.55], [JETTY_X + 0.42, 0.55], [JETTY_X - 0.42, JETTY_END - 0.06], [JETTY_X + 0.42, JETTY_END - 0.06]].forEach(([x, z], i) => {
    touchers.push({ kind: RINGS, x, z, period: 2.9 + i * 0.37, phase: i * 1.3, frameSeconds: 0.32, frames: RING.length });
  });
  // The boat's open side, lapping each time it rocks down (its bob is a sine on 1.3 rad/s).
  const bob = (Math.PI * 2) / 1.3;
  for (const z of [0.7, 1.3]) touchers.push({ kind: BOAT_SIDE, x: BOAT[0] + 0.42 + half, z, period: bob, phase: -bob * 0.75 + z * 0.4, frameSeconds: 0.3, frames: down.length });
  const wakes = 3;

  const layer = spriteLayer(kinds, { g: "tideLight", c: "tide", d: "tideDark" }, touchers.length + wakes, (i, seconds) => {
    if (i < touchers.length) {
      const t = touchers[i];
      const { frame } = lifeAt(seconds, t.period, t.phase, t.frameSeconds);
      return frame < t.frames ? { kind: t.kind, frame, x: t.x, z: t.z } : null;
    }
    // The thing's wake: a ring left where it was when each one started.
    const period = 3.6;
    const k = i - touchers.length;
    const { life, frame } = lifeAt(seconds, period, (k * period) / wakes, 0.4);
    if (frame >= RING.length) return null;
    const from = thingAt(life * period - (k * period) / wakes);
    return { kind: RINGS, frame, x: from.x, z: from.z };
  }, 0.75);
  return group(at(stillWater(), LAKE_X, LAKE_Z), layer, thing({ p: "tideDark", l: "soot" }));
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

/** `shader` and `shader-palette`: the kit's water, reflecting the bow lantern
 *  and three of the water's own cold glows, the boat's lantern brightest, and
 *  throwing their light up the walls and the jetty's posts. */
function shaderLake(palette: boolean): THREE.Group {
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
    palette: palette ? ["void", "soot", "sootLight", "tideDark", "tide", "tideLight", "moonDark", "moon", "ember", "amber", "flame"] : undefined,
    caustics: { faces: causticFaces(), reach: CAUSTIC_REACH },
  });
  builtWater = water;
  return group(water, thing({ p: "tideDark", l: "soot" }));
}

/** The water's sprites a sprite treatment draws over it, which the shader's water draws itself. */
function waterSprites(): PropPlacement[] {
  const style = waterStyle();
  if (style === "shader" || style === "shader-palette") return [];
  return [
    { build: reflection, at: [BOAT[0], 2.3] },
    { build: () => ripples(7, 0), name: "ripples", at: [0.25, 2.15] },
    { build: () => ripples(11, 4.5), name: "ripples", at: [-2.2, 0.0] },
  ];
}

/** The pixel-art caustics the sprite treatments draw up the walls; the shader's water throws its own as light, up
 *  the walls above the cut height as pieces hung on them. */
function causticBands(): PropPlacement[] {
  const style = waterStyle();
  if (style === "shader" || style === "shader-palette") {
    return (["left", "bottom"] as const).map((wall) => ({ build: () => wallCaustics(wall), name: "wallCaustics", at: [0, 0], y: CUT_HEIGHT, walls: [wall] }));
  }
  return [
    { build: () => causticBand(LAKE_D - 0.1), name: "causticBand", ...onWall("left", -LAKE_Z + 0.05, { out: 0.06 }) },
    { build: () => causticBand(LAKE_W - 0.1), name: "causticBand", ...onWall("bottom", -LAKE_X - 0.05, { out: 0.06 }) },
  ];
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
  // The other treatments keep it calm: a slow crawl, without the whole band flicking between its frames.
  const calm = waterStyle() !== "current";
  return group(
    animated(band, (seconds) => {
      map.offset.set(steps(seconds, calm ? 0.8 : 1.4), calm || Math.floor(seconds / 0.55) % 2 === 0 ? 0 : 0.5);
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
    ...waterSprites(),
    ...causticBands(),
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
  // Along the shore, clear of the water.
  lanes: [
    [[0, -2.2], [0.9, -2.0], [1.6, -1.2], [1.75, 0], [1.65, 1.8]],
    [[2.2, 0], [1.75, 0]],
  ],
};
