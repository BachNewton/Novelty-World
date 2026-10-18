import { BoxGeometry, BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, MeshLambertMaterial, OctahedronGeometry, SphereGeometry, TorusGeometry } from "three";
import { createRng, uniform, type Rng } from "@/shared/lib/seeded-random";
import type { PlaceKind } from "../engine/regions";
import type { AtmosphereUniforms } from "./atmosphere";
import { shadeLambert } from "./shading";
import { lumpy, paint, type Piece } from "./painted";
import type { Palette } from "./palette";
import { regionAbsorption } from "./water/absorption";

/*
 * The places worth walking to, each one merged, vertex-coloured mesh set on
 * the ground it is given: a ring of old standing stones, mossy on top, one
 * fallen; a cairn with a log bench beside it; a tor of weathered slabs; a
 * little wayside shrine with a candle, an offering and ribbons; a fallen
 * giant tree with its root plate in the air; a ring of mushrooms; a seter,
 * the turf-roofed huts of a summer farm in a mountain valley, with its fence
 * and woodpile; boulders round a tarn's lip; and wet boulders round the foot
 * of a waterfall or down a cascade, whose falling water is a ribbon of its own.
 */

export interface PlaceLook {
  kind: PlaceKind;
  x: number;
  z: number;
  /** Its turn about the vertical, in radians: a waterfall faces the way its river flows. */
  turn: number;
  seed: string;
  /** A tarn's water. */
  pool?: { level: number; radius: number };
  /** A cascade's way down: x, y, z for each point. */
  fall?: Float32Array;
}

/** The ground's height at a point, for setting each stone and log on it. */
export type GroundAt = (x: number, z: number) => number;

function slab(rng: Rng, width: number, height: number, depth: number): BufferGeometry {
  const g = new BoxGeometry(width, height, depth, 2, 3, 1).toNonIndexed();
  const p = g.getAttribute("position");
  const jitter = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let j = jitter.get(key);
    if (!j) {
      const top = p.getY(i) > height * 0.3 ? 0.7 : 1;
      j = [1 + (rng.next() - 0.5) * 0.25 * top, 1 + (rng.next() - 0.5) * 0.08, 1 + (rng.next() - 0.5) * 0.25 * top];
      jitter.set(key, j);
    }
    p.setXYZ(i, p.getX(i) * j[0], p.getY(i) * j[1], p.getZ(i) * j[2]);
  }
  g.computeVertexNormals();
  g.translate(0, height / 2, 0);
  return g;
}

function boulder(rng: Rng, radius: number): BufferGeometry {
  const g = lumpy(new IcosahedronGeometry(radius, 0), () => rng.next(), 0.8, 1.15);
  g.scale(1, 0.7, 1);
  g.computeVertexNormals();
  return g;
}

/** Sets a piece on the ground at a point, sunk a little into it. */
function setAt(ground: GroundAt, g: BufferGeometry, x: number, z: number, sink = 0.1): BufferGeometry {
  g.translate(x, ground(x, z) - sink, z);
  return g;
}

function stoneCircle(look: PlaceLook, ground: GroundAt, palette: Palette, rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  const stones = 9;
  const fallen = Math.floor(rng.next() * stones);
  for (let s = 0; s < stones; s++) {
    const angle = (s / stones) * Math.PI * 2 + rng.next() * 0.15 + look.turn;
    const x = look.x + Math.cos(angle) * 6.5;
    const z = look.z + Math.sin(angle) * 6.5;
    const height = uniform(rng, 2.1, 3.1);
    const stone = slab(rng, uniform(rng, 0.9, 1.3), height, uniform(rng, 0.45, 0.65));
    if (s === fallen) {
      stone.rotateX(Math.PI / 2 - 0.08);
      stone.translate(0, 0.3, 0);
    }
    stone.rotateZ((rng.next() - 0.5) * 0.12);
    stone.rotateY(-angle + Math.PI / 2);
    pieces.push({ geometry: setAt(ground, stone, x, z, 0.25), colour: palette.things.stone, shading: 0.5 });
    if (s !== fallen) {
      const moss = boulder(rng, 0.42);
      moss.scale(1.3, 0.35, 0.9);
      moss.rotateY(-angle + Math.PI / 2);
      moss.translate(0, height - 0.08, 0);
      pieces.push({ geometry: setAt(ground, moss, x, z, 0.25), colour: palette.things.moss });
    }
  }
  const altar = slab(rng, 1.6, 0.55, 1.1);
  altar.rotateY(look.turn);
  pieces.push({ geometry: setAt(ground, altar, look.x, look.z), colour: palette.things.stone, shading: 0.4 });
  return pieces;
}

function cairn(look: PlaceLook, ground: GroundAt, palette: Palette, rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  let height = 0;
  for (let s = 0; s < 6; s++) {
    const radius = 0.46 - s * 0.06;
    const stone = boulder(rng, radius);
    stone.translate((rng.next() - 0.5) * 0.12, height + radius * 0.5, (rng.next() - 0.5) * 0.12);
    height += radius * 0.85;
    pieces.push({ geometry: setAt(ground, stone, look.x, look.z), colour: palette.things.rock, shading: 0.3 });
  }
  const bx = look.x + Math.cos(look.turn) * 2.6;
  const bz = look.z + Math.sin(look.turn) * 2.6;
  const bench = new CylinderGeometry(0.2, 0.22, 2, 9);
  bench.rotateZ(Math.PI / 2);
  bench.rotateY(-look.turn + Math.PI / 2);
  bench.translate(0, 0.2, 0);
  pieces.push({ geometry: setAt(ground, bench, bx, bz, 0.05), colour: palette.things.log, shading: 0.4 });
  return pieces;
}

/** Weathered granite: two or three stacks of rounded slabs on a rise, moss in their cracks. */
function tor(look: PlaceLook, ground: GroundAt, palette: Palette, rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  const stacks = 2 + Math.floor(rng.next() * 2);
  for (let k = 0; k < stacks; k++) {
    const angle = look.turn + (k / stacks) * Math.PI * 2 + rng.next() * 0.6;
    const out = k === 0 ? 0 : uniform(rng, 2.6, 4);
    const x = look.x + Math.cos(angle) * out;
    const z = look.z + Math.sin(angle) * out;
    let height = 0;
    const layers = k === 0 ? 4 + Math.floor(rng.next() * 2) : 2 + Math.floor(rng.next() * 2);
    let width = uniform(rng, 2.4, 3.2) * (k === 0 ? 1 : 0.75);
    for (let l = 0; l < layers; l++) {
      const thick = uniform(rng, 0.55, 0.9);
      const layer = lumpy(new BoxGeometry(width, thick, width * uniform(rng, 0.6, 0.85), 2, 1, 2).toNonIndexed(), () => rng.next(), 0.9, 1.08);
      layer.rotateY(rng.next() * 0.5);
      layer.translate((rng.next() - 0.5) * 0.3, height + thick / 2, (rng.next() - 0.5) * 0.3);
      pieces.push({ geometry: setAt(ground, layer, x, z, 0.3), colour: palette.things.stone.clone().lerp(palette.things.rock, rng.next()), shading: 0.45 });
      if (rng.next() < 0.5) {
        const moss = boulder(rng, width * 0.18);
        moss.scale(1.4, 0.3, 1);
        moss.translate((rng.next() - 0.5) * width * 0.5, height + thick, (rng.next() - 0.5) * width * 0.3);
        pieces.push({ geometry: setAt(ground, moss, x, z, 0.3), colour: palette.things.moss });
      }
      height += thick * 0.96;
      width *= uniform(rng, 0.72, 0.9);
    }
  }
  for (let b = 0; b < 6; b++) {
    const angle = rng.next() * Math.PI * 2;
    const out = uniform(rng, 3, 6.5);
    pieces.push({ geometry: setAt(ground, boulder(rng, uniform(rng, 0.3, 0.7)), look.x + Math.cos(angle) * out, look.z + Math.sin(angle) * out, 0.15), colour: palette.things.rock, shading: 0.4 });
  }
  return pieces;
}

/** A wayside shrine: a stone plinth under a little pitched roof, a candle and an offering in it, ribbons on a post beside. */
function shrine(look: PlaceLook, ground: GroundAt, palette: Palette, rng: Rng): Piece[] {
  const t = palette.things;
  const local: Piece[] = [];
  const base = slab(rng, 1.1, 0.45, 0.8);
  local.push({ geometry: base, colour: t.stone, shading: 0.4 });
  for (const side of [-1, 1]) {
    const post = new BoxGeometry(0.12, 1.15, 0.12);
    post.translate(side * 0.38, 0.45 + 0.575, -0.22);
    local.push({ geometry: post, colour: t.log, shading: 0.3 });
    const front = new BoxGeometry(0.12, 1.0, 0.12);
    front.translate(side * 0.38, 0.45 + 0.5, 0.22);
    local.push({ geometry: front, colour: t.log, shading: 0.3 });
  }
  const back = new BoxGeometry(0.76, 0.9, 0.06);
  back.translate(0, 0.45 + 0.45, -0.26);
  local.push({ geometry: back, colour: t.log, shading: 0.5 });
  for (const side of [-1, 1]) {
    const roof = new BoxGeometry(0.62, 0.06, 0.95);
    roof.rotateZ(side * 0.62);
    roof.translate(side * 0.25, 1.82, 0);
    local.push({ geometry: roof, colour: t["shrine-roof"], shading: 0.3 });
  }
  const candle = new CylinderGeometry(0.04, 0.045, 0.2, 8);
  candle.translate(-0.15, 0.45 + 0.1, 0.05);
  local.push({ geometry: candle, colour: t.candle });
  const flame = new ConeGeometry(0.025, 0.07, 6);
  flame.translate(-0.15, 0.45 + 0.24, 0.05);
  local.push({ geometry: flame, colour: t["fire-core"] });
  const bowl = new SphereGeometry(0.1, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bowl.translate(0.14, 0.45 + 0.1, 0.05);
  local.push({ geometry: bowl, colour: t["witch-hat"] });
  for (let b = 0; b < 4; b++) {
    const berry = new OctahedronGeometry(0.035, 0);
    berry.translate(0.14 + (rng.next() - 0.5) * 0.08, 0.45 + 0.11, 0.05 + (rng.next() - 0.5) * 0.08);
    local.push({ geometry: berry, colour: t["maple-red"] });
  }
  const pole = new CylinderGeometry(0.03, 0.035, 1.9, 5);
  pole.translate(1.1, 0.95, 0.3);
  local.push({ geometry: pole, colour: t.bark });
  for (let r = 0; r < 3; r++) {
    const ribbon = new BoxGeometry(0.06, uniform(rng, 0.45, 0.7), 0.01);
    ribbon.translate(0, -0.25, 0);
    ribbon.rotateZ((rng.next() - 0.5) * 0.4);
    ribbon.translate(1.1 + (r - 1) * 0.05, 1.8 - r * 0.05, 0.3 + (r - 1) * 0.04);
    local.push({ geometry: ribbon, colour: r === 1 ? t["flower-yellow"] : t.ribbon });
  }
  const level = ground(look.x, look.z);
  for (const piece of local) {
    piece.geometry.rotateY(look.turn);
    piece.geometry.translate(look.x, level - 0.05, look.z);
  }
  for (let s = 0; s < 4; s++) {
    const angle = rng.next() * Math.PI * 2;
    local.push({ geometry: setAt(ground, boulder(rng, uniform(rng, 0.15, 0.3)), look.x + Math.cos(angle) * 1.4, look.z + Math.sin(angle) * 1.4, 0.05), colour: t.stone, shading: 0.4 });
  }
  return local;
}

/** A fallen giant: a great mossy trunk on the ground, its root plate standing up at one end, stubs where its branches broke. */
function fallenTree(look: PlaceLook, ground: GroundAt, palette: Palette, rng: Rng): Piece[] {
  const t = palette.things;
  const pieces: Piece[] = [];
  const length = uniform(rng, 12, 16);
  const radius = uniform(rng, 0.65, 0.85);
  const dx = Math.cos(look.turn);
  const dz = Math.sin(look.turn);
  const bx = look.x - (dx * length) / 2;
  const bz = look.z - (dz * length) / 2;
  const tx = look.x + (dx * length) / 2;
  const tz = look.z + (dz * length) / 2;
  const by = ground(bx, bz) + radius * 0.75;
  const ty = ground(tx, tz) + radius * 0.5;
  const rise = Math.atan2(ty - by, length);
  /** Puts a piece built along +x from the root end into place along the trunk. */
  const along = (g: BufferGeometry) => {
    g.rotateZ(rise);
    g.rotateY(-look.turn);
    g.translate(bx, by, bz);
    return g;
  };
  const trunk = new CylinderGeometry(radius * 0.7, radius, length, 12, 4, true);
  trunk.rotateZ(-Math.PI / 2);
  trunk.translate(length / 2, 0, 0);
  pieces.push({ geometry: along(trunk), colour: t.bark, shading: 0.5 });
  const end = new CylinderGeometry(radius * 0.7, radius * 0.7, 0.05, 12);
  end.rotateZ(Math.PI / 2);
  end.translate(length, 0, 0);
  pieces.push({ geometry: along(end), colour: t["birch-bark"].clone().lerp(t.log, 0.5) });
  const plate = lumpy(new CylinderGeometry(radius * 2.4, radius * 2.6, 0.6, 12, 1).toNonIndexed(), () => rng.next(), 0.8, 1.15);
  plate.rotateZ(Math.PI / 2);
  plate.translate(-0.2, radius * 0.6, 0);
  pieces.push({ geometry: along(plate), colour: t["ground-path"].clone().lerp(t.bark, 0.4), shading: 0.4 });
  for (let r = 0; r < 9; r++) {
    const angle = (r / 9) * Math.PI * 2;
    const root = new ConeGeometry(0.16, uniform(rng, 1.2, 2.2), 5);
    root.rotateX(Math.PI / 2);
    root.rotateY(Math.PI / 2);
    root.rotateX(angle);
    root.translate(-0.3, radius * 0.6 + Math.sin(angle) * radius * 2.3, Math.cos(angle) * radius * 2.3);
    pieces.push({ geometry: along(root), colour: t.bark });
  }
  for (let b = 0; b < 5; b++) {
    const at = uniform(rng, 0.3, 0.9) * length;
    const stub = new CylinderGeometry(0.12, 0.2, uniform(rng, 0.6, 1.3), 6);
    const angle = uniform(rng, -1.3, 1.3);
    stub.translate(0, 0.4, 0);
    stub.rotateX(angle);
    stub.translate(at, radius * 0.8, 0);
    pieces.push({ geometry: along(stub), colour: t.bark, shading: 0.3 });
  }
  for (let m = 0; m < 7; m++) {
    const moss = boulder(rng, uniform(rng, 0.45, 0.8));
    moss.scale(1.6, 0.35, 0.9);
    moss.translate(uniform(rng, 0.1, 0.85) * length, radius * 0.85, (rng.next() - 0.5) * radius * 0.6);
    pieces.push({ geometry: along(moss), colour: t.moss });
  }
  for (let f = 0; f < 6; f++) {
    const fungus = new SphereGeometry(0.16, 8, 3, 0, Math.PI, 0, Math.PI / 2);
    fungus.scale(1, 0.35, 1);
    fungus.translate(uniform(rng, 0.2, 0.8) * length, uniform(rng, -0.2, 0.3), radius * 0.92);
    pieces.push({ geometry: along(fungus), colour: t["mushroom-gold"] });
  }
  return pieces;
}

function fairyRing(look: PlaceLook, ground: GroundAt, palette: Palette, rng: Rng): Piece[] {
  const t = palette.things;
  const pieces: Piece[] = [];
  const count = 22;
  for (let m = 0; m < count; m++) {
    const angle = (m / count) * Math.PI * 2 + rng.next() * 0.1;
    const r = 3.6 + (rng.next() - 0.5) * 0.4;
    const x = look.x + Math.cos(angle) * r;
    const z = look.z + Math.sin(angle) * r;
    const height = uniform(rng, 0.1, 0.2);
    const width = height * uniform(rng, 0.7, 0.9);
    const stem = new CylinderGeometry(width * 0.22, width * 0.28, height, 6);
    stem.translate(0, height / 2, 0);
    pieces.push({ geometry: setAt(ground, stem, x, z, 0.02), colour: t["mushroom-stem"] });
    const cap = new SphereGeometry(width, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.7, 1);
    cap.translate(0, height - width * 0.12, 0);
    pieces.push({ geometry: setAt(ground, cap, x, z, 0.02), colour: t["mushroom-spot"].clone().lerp(t["mushroom-brown"], 0.35), shading: 0.3 });
  }
  const stone = boulder(rng, 0.35);
  pieces.push({ geometry: setAt(ground, stone, look.x, look.z, 0.1), colour: t.moss.clone().lerp(t.stone, 0.5), shading: 0.3 });
  const wreath = new TorusGeometry(0.22, 0.04, 5, 12);
  wreath.rotateX(Math.PI / 2);
  wreath.translate(0, 0.2, 0);
  pieces.push({ geometry: setAt(ground, wreath, look.x, look.z, 0), colour: t["flower-white"] });
  return pieces;
}

/** Wet boulders round the foot of the falls and along their sides, clear of the water's way. */
function waterfall(look: PlaceLook, ground: GroundAt, palette: Palette, rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  const fx = Math.sin(look.turn);
  const fz = Math.cos(look.turn);
  for (let b = 0; b < 14; b++) {
    const down = uniform(rng, -3, 12);
    const side = (rng.next() < 0.5 ? -1 : 1) * uniform(rng, 4.5, 9);
    const x = look.x + fx * down - fz * side;
    const z = look.z + fz * down + fx * side;
    pieces.push({ geometry: setAt(ground, boulder(rng, uniform(rng, 0.5, 1.3)), x, z, 0.25), colour: palette.things.rock.clone().multiplyScalar(0.85), shading: 0.4 });
  }
  return pieces;
}

/** A log hut under a turf roof, its door on +z, standing on a low stone footing. */
function hut(rng: Rng, palette: Palette, width: number, depth: number): Piece[] {
  const t = palette.things;
  const wall = 2.1;
  const pitch = width * 0.42;
  const pieces: Piece[] = [];
  const footing = new BoxGeometry(width + 0.3, 0.35, depth + 0.3);
  footing.translate(0, 0.1, 0);
  pieces.push({ geometry: footing, colour: t.stone, shading: 0.3 });
  const courses = 7;
  for (let c = 0; c < courses; c++) {
    const y = 0.3 + ((c + 0.5) / courses) * wall;
    for (const side of [-1, 1]) {
      const long = new CylinderGeometry(0.17, 0.17, width + 0.35, 7);
      long.rotateZ(Math.PI / 2);
      long.translate(0, y, (side * depth) / 2);
      pieces.push({ geometry: long, colour: t.log.clone().multiplyScalar(uniform(rng, 0.85, 1.05)), shading: 0.2 });
      const short = new CylinderGeometry(0.17, 0.17, depth + 0.35, 7);
      short.rotateX(Math.PI / 2);
      short.translate((side * width) / 2, y + wall / courses / 2, 0);
      pieces.push({ geometry: short, colour: t.log.clone().multiplyScalar(uniform(rng, 0.85, 1.05)), shading: 0.2 });
    }
  }
  const core = new BoxGeometry(width - 0.1, wall, depth - 0.1);
  core.translate(0, 0.3 + wall / 2, 0);
  pieces.push({ geometry: core, colour: t.log.clone().multiplyScalar(0.75) });
  const gable = new CylinderGeometry(width / Math.sqrt(3), width / Math.sqrt(3), depth - 0.1, 3);
  gable.rotateX(Math.PI / 2);
  gable.rotateZ(Math.PI);
  gable.scale(1, pitch / ((width / Math.sqrt(3)) * 1.5), 1);
  gable.translate(0, 0.3 + wall + pitch / 3, 0);
  pieces.push({ geometry: gable, colour: t.log.clone().multiplyScalar(0.8), shading: 0.3 });
  const slope = Math.atan2(pitch, width / 2);
  const length = Math.hypot(pitch, width / 2) + 0.45;
  for (const side of [-1, 1]) {
    const roof = lumpy(new BoxGeometry(length, 0.4, depth + 0.8, 3, 1, 3).toNonIndexed(), () => rng.next(), 0.97, 1.03);
    roof.rotateZ(side * slope);
    roof.translate(-side * (length / 2 - 0.25) * Math.cos(slope), 0.3 + wall + pitch - (length / 2 - 0.25) * Math.sin(slope) + 0.12, 0);
    pieces.push({ geometry: roof, colour: t.moss.clone().lerp(palette.regions.highlands["meadow-lush"], 0.5), shading: 0.35 });
  }
  const door = new BoxGeometry(0.8, 1.6, 0.1);
  door.translate(width * 0.18, 0.3 + 0.8, depth / 2 + 0.2);
  pieces.push({ geometry: door, colour: t.bark });
  const pane = new BoxGeometry(0.5, 0.45, 0.1);
  pane.translate(-width * 0.22, 0.3 + 1.3, depth / 2 + 0.2);
  pieces.push({ geometry: pane, colour: t.candle.clone().multiplyScalar(0.8) });
  return pieces;
}

/** A seter: a summer farm in a mountain valley, two or three turf-roofed huts round a yard, a fence along its meadow, and a woodpile. */
function seter(look: PlaceLook, ground: GroundAt, palette: Palette, rng: Rng): Piece[] {
  const t = palette.things;
  const pieces: Piece[] = [];
  const huts = 2 + Math.floor(rng.next() * 2);
  for (let h = 0; h < huts; h++) {
    const angle = look.turn + (h / huts) * Math.PI * 1.4;
    const out = h === 0 ? 0 : uniform(rng, 7, 9);
    const x = look.x + Math.cos(angle) * out;
    const z = look.z + Math.sin(angle) * out;
    const width = h === 0 ? uniform(rng, 5, 6) : uniform(rng, 3.4, 4.4);
    const level = ground(x, z);
    for (const piece of hut(rng, palette, width, width * uniform(rng, 0.7, 0.85))) {
      piece.geometry.rotateY(-angle - Math.PI / 2 + (h === 0 ? 0 : Math.PI));
      piece.geometry.translate(x, level - 0.1, z);
      pieces.push(piece);
    }
  }
  const posts = 14;
  const postAt = (p: number) => {
    const angle = look.turn + Math.PI * 1.2 + (p / (posts - 1)) * Math.PI * 0.9;
    return { x: look.x + Math.cos(angle) * 15, z: look.z + Math.sin(angle) * 15 };
  };
  for (let p = 0; p < posts; p++) {
    const { x, z } = postAt(p);
    const post = new CylinderGeometry(0.06, 0.07, 1.2, 5);
    post.translate(0, 0.6, 0);
    pieces.push({ geometry: setAt(ground, post, x, z, 0.05), colour: t.log });
    if (p === posts - 1) continue;
    const next = postAt(p + 1);
    const run = Math.hypot(next.x - x, next.z - z);
    const mx = (x + next.x) / 2;
    const mz = (z + next.z) / 2;
    for (const height of [0.55, 1.0]) {
      const rail = new CylinderGeometry(0.04, 0.04, run, 4);
      rail.rotateZ(Math.PI / 2);
      rail.rotateY(-Math.atan2(next.z - z, next.x - x));
      rail.translate(mx, ground(mx, mz) + height, mz);
      pieces.push({ geometry: rail, colour: t.log.clone().multiplyScalar(0.9) });
    }
  }
  const wx = look.x + Math.cos(look.turn - 0.6) * 4.5;
  const wz = look.z + Math.sin(look.turn - 0.6) * 4.5;
  for (let l = 0; l < 9; l++) {
    const log = new CylinderGeometry(0.16, 0.16, 1.1, 7);
    log.rotateX(Math.PI / 2);
    log.translate((l % 3) * 0.34 - 0.34 + (Math.floor(l / 3) % 2) * 0.17, 0.17 + Math.floor(l / 3) * 0.3, 0);
    log.rotateY(-look.turn);
    pieces.push({ geometry: setAt(ground, log, wx, wz, 0), colour: t.log.clone().lerp(t["birch-bark"], 0.25), shading: 0.2 });
  }
  return pieces;
}

/** Boulders round a tarn's lip, and one flat stone at its edge to sit on. */
function tarnStones(look: PlaceLook, ground: GroundAt, palette: Palette, rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  const radius = look.pool?.radius ?? 20;
  for (let b = 0; b < 16; b++) {
    const angle = rng.next() * Math.PI * 2;
    const out = radius + uniform(rng, 2, 6);
    pieces.push({ geometry: setAt(ground, boulder(rng, uniform(rng, 0.4, 1.4)), look.x + Math.cos(angle) * out, look.z + Math.sin(angle) * out, 0.25), colour: palette.things.rock, shading: 0.4 });
  }
  const seat = slab(rng, 1.8, 0.4, 1.2);
  seat.rotateY(look.turn);
  pieces.push({ geometry: setAt(ground, seat, look.x + Math.cos(look.turn) * (radius + 1.8), look.z + Math.sin(look.turn) * (radius + 1.8), 0.1), colour: palette.things.stone, shading: 0.3 });
  return pieces;
}

/** Wet boulders down the sides of a cascade and at its foot. */
function cascadeStones(look: PlaceLook, ground: GroundAt, palette: Palette, rng: Rng): Piece[] {
  const pieces: Piece[] = [];
  const fall = look.fall;
  if (!fall || fall.length < 6) return pieces;
  const steps = fall.length / 3;
  for (let b = 0; b < 18; b++) {
    const k = Math.min(steps - 2, Math.floor(rng.next() * steps));
    const dx = fall[k * 3 + 3] - fall[k * 3];
    const dz = fall[k * 3 + 5] - fall[k * 3 + 2];
    const length = Math.hypot(dx, dz) || 1;
    const side = (rng.next() < 0.5 ? -1 : 1) * uniform(rng, 3, 6);
    const x = fall[k * 3] - (dz / length) * side;
    const z = fall[k * 3 + 2] + (dx / length) * side;
    pieces.push({ geometry: setAt(ground, boulder(rng, uniform(rng, 0.4, 1.1)), x, z, 0.2), colour: palette.things.rock.clone().multiplyScalar(0.85), shading: 0.4 });
  }
  return pieces;
}

/** A cascade's falling water, or null for any other place. */
export function placeWater(look: PlaceLook): BufferGeometry | null {
  const fall = look.fall;
  if (look.kind !== "cascade" || !fall || fall.length < 6) return null;
  return fallRibbon(fall);
}

/** Falling water laid along a way down (x, y, z for each point), a little above the rock, widening as it falls. */
export function fallRibbon(fall: Float32Array): BufferGeometry {
  const steps = fall.length / 3;
  const positions: number[] = [];
  const depths: number[] = [];
  const flows: number[] = [];
  const falls: number[] = [];
  for (let k = 0; k < steps; k++) {
    const a = Math.max(0, k - 1);
    const b = Math.min(steps - 1, k + 1);
    const dx = fall[b * 3] - fall[a * 3];
    const dy = fall[b * 3 + 1] - fall[a * 3 + 1];
    const dz = fall[b * 3 + 2] - fall[a * 3 + 2];
    const run = Math.hypot(dx, dz) || 1;
    const half = 1.1 + 1.6 * (k / steps);
    const nx = (-dz / run) * half;
    const nz = (dx / run) * half;
    const x = fall[k * 3];
    const y = fall[k * 3 + 1] + 0.35;
    const z = fall[k * 3 + 2];
    positions.push(x + nx, y, z + nz, x - nx, y, z - nz);
    depths.push(0.6, 0.6);
    flows.push(dx / run, dz / run, dx / run, dz / run);
    const steep = Math.abs(dy) / run;
    falls.push(steep, steep);
  }
  const indices: number[] = [];
  for (let k = 0; k < steps - 1; k++) {
    const a = k * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("depth", new BufferAttribute(new Float32Array(depths), 1));
  geometry.setAttribute("flow", new BufferAttribute(new Float32Array(flows), 2));
  geometry.setAttribute("fall", new BufferAttribute(new Float32Array(falls), 1));
  geometry.setAttribute("absorb", regionAbsorption("highlands", steps * 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function placePieces(look: PlaceLook, ground: GroundAt, palette: Palette): Piece[] {
  const rng = createRng(look.seed);
  switch (look.kind) {
    case "stone-circle":
      return stoneCircle(look, ground, palette, rng);
    case "cairn":
      return cairn(look, ground, palette, rng);
    case "tor":
      return tor(look, ground, palette, rng);
    case "shrine":
      return shrine(look, ground, palette, rng);
    case "fallen-tree":
      return fallenTree(look, ground, palette, rng);
    case "fairy-ring":
      return fairyRing(look, ground, palette, rng);
    case "seter":
      return seter(look, ground, palette, rng);
    case "tarn":
      return tarnStones(look, ground, palette, rng);
    case "cascade":
      return cascadeStones(look, ground, palette, rng);
    case "waterfall":
      return waterfall(look, ground, palette, rng);
  }
}

export function placeGeometry(look: PlaceLook, ground: GroundAt, palette: Palette): BufferGeometry {
  return paint(placePieces(look, ground, palette));
}

export function placeMaterial(atmosphere: AtmosphereUniforms): MeshLambertMaterial {
  return shadeLambert(new MeshLambertMaterial({ vertexColors: true }), "solid", atmosphere);
}
