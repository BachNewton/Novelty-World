import { BufferAttribute, BufferGeometry } from "three/webgpu";
import { INTERIOR_PARTS, paintOf, SURFACES, type InteriorPart } from "./paint";

/*
 * A room as flat faces, and its light baked into their corners when it's built: no
 * shadow maps and no lights at draw time, so a room is one draw call and costs a
 * frame nothing. A corner keeps three numbers, how much it sees of the room's
 * general light, of the windows and of the lamps, and the material colours them, so
 * a room can be dimmed for the evening with no rebake.
 *
 * Inside `place` everything is drawn in the furniture's own frame: on its origin, its
 * back along -z, its front towards +z. What should cast a shadow is a `solid`.
 */

export type V3 = readonly [x: number, y: number, z: number];

interface Frame {
  x: number;
  y: number;
  z: number;
  turn: number;
}

interface Blocker {
  low: V3;
  high: V3;
}

interface WindowLight {
  samples: V3[];
  /** Into the room. */
  normal: V3;
  sharePerSample: number;
}

const SHADE_UNIT = 128;
const BAKE_LIFT_M = 0.03;
/** How far a surface looks for what's shading it. */
const AO_REACH_M = 0.9;
const WINDOW_GAIN = 2.2;
const NEAREST_WINDOW_M2 = 0.35;
const LAMP_SOFTEN_M2 = 0.6;
const WRAP = 0.3;
const SPREAD_RAYS = 32;
const WINDOW_SAMPLES_ACROSS = 3;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const size = Math.hypot(...a) || 1;
  return [a[0] / size, a[1] / size, a[2] / size];
};

/** A spread of directions, near enough even, that a corner looks along to see what shades it. */
const SPREAD: V3[] = Array.from({ length: SPREAD_RAYS }, (_, index) => {
  const y = 1 - ((index + 0.5) / SPREAD_RAYS) * 2;
  const around = index * 2.399963;
  const ring = Math.sqrt(1 - y * y);
  return [Math.cos(around) * ring, y, Math.sin(around) * ring];
});

/** Where a ray first enters a box, or Infinity. A ray that starts inside is stopped at once. */
function hitBox(from: V3, way: V3, { low, high }: Blocker): number {
  let near = -Infinity;
  let far = Infinity;
  for (const axis of [0, 1, 2]) {
    if (Math.abs(way[axis]) < 1e-9) {
      if (from[axis] < low[axis] || from[axis] > high[axis]) return Infinity;
      continue;
    }
    const [a, b] = [(low[axis] - from[axis]) / way[axis], (high[axis] - from[axis]) / way[axis]];
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  if (near > far || far < 0) return Infinity;
  return Math.max(near, 0);
}

export class RoomMesh {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly tints: number[] = [];
  private readonly indices: number[] = [];
  private readonly frames: Frame[] = [];
  private readonly blockers: Blocker[] = [];
  private readonly lamps: { at: V3; power: number }[] = [];
  private readonly windows: WindowLight[] = [];

  /** The inside of the room, the shell's own faces, which a ray can't leave. */
  constructor(private readonly low: V3, private readonly high: V3) {}

  private toRoom(point: V3): V3 {
    let [x, y, z] = point;
    for (let index = this.frames.length - 1; index >= 0; index--) {
      const frame = this.frames[index];
      for (let step = 0; step < frame.turn; step++) [x, z] = [z, -x];
      [x, y, z] = [x + frame.x, y + frame.y, z + frame.z];
    }
    return [x, y, z];
  }

  private turnToRoom(way: V3): V3 {
    let [x, , z] = way;
    for (let index = this.frames.length - 1; index >= 0; index--) {
      for (let step = 0; step < this.frames[index].turn; step++) [x, z] = [z, -x];
    }
    return [x, way[1], z];
  }

  /** Draws in a frame at a place on the floor, with its +z turned by quarters towards +x. */
  place(x: number, z: number, turn: number, draw: (mesh: this) => void, y = 0): this {
    this.frames.push({ x, y, z, turn: ((turn % 4) + 4) % 4 });
    draw(this);
    this.frames.pop();
    return this;
  }

  /** A flat face from its corners in order, seen from the side its corners turn anticlockwise. */
  face(corners: readonly V3[], part: InteriorPart, shade = 1): this {
    const normal = unit(cross(sub(corners[1], corners[0]), sub(corners[corners.length - 1], corners[0])));
    return this.facing(corners, normal, part, shade);
  }

  private facing(corners: readonly V3[], normal: V3, part: InteriorPart, shade: number): this {
    const first = this.positions.length / 3;
    const { surface = "plain", glow = false } = paintOf(part);
    const turned = this.turnToRoom(normal);
    for (const corner of corners) {
      this.positions.push(...this.toRoom(corner));
      this.normals.push(...turned);
      this.tints.push(INTERIOR_PARTS.indexOf(part), Math.min(255, Math.round(shade * SHADE_UNIT)), SURFACES.indexOf(surface), glow ? 255 : 0);
    }
    for (let corner = 1; corner < corners.length - 1; corner++) this.indices.push(first, first + corner, first + corner + 1);
    return this;
  }

  /** A box, each face its own. `open` leaves its underside off, for what stands on the floor. */
  box(low: V3, high: V3, part: InteriorPart, { open = false, shade = 1 }: { open?: boolean; shade?: number } = {}): this {
    const [x0, y0, z0] = low;
    const [x1, y1, z1] = high;
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], part, shade)
      .face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], part, shade)
      .face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], part, shade)
      .face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], part, shade)
      .face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], part, shade);
    if (!open) this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], part, shade);
    return this;
  }

  /** A box that casts shadows. */
  solid(low: V3, high: V3, part: InteriorPart, options: { open?: boolean; shade?: number } = {}): this {
    return this.box(low, high, part, options).block(low, high);
  }

  block(low: V3, high: V3): this {
    const [a, b] = [this.toRoom(low), this.toRoom(high)];
    this.blockers.push({ low: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], high: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])] });
    return this;
  }

  /** A round bar between two points, its sides facing out. */
  tube(from: V3, to: V3, radius: number, sides: number, part: InteriorPart, { radiusTo = radius, cap = false }: { radiusTo?: number; cap?: boolean } = {}): this {
    const along = unit(sub(to, from));
    const side = unit(cross(along, Math.abs(along[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const other = cross(along, side);
    const offset = (angle: number, size: number): V3 => {
      const [c, s] = [Math.cos(angle) * size, Math.sin(angle) * size];
      return [side[0] * c + other[0] * s, side[1] * c + other[1] * s, side[2] * c + other[2] * s];
    };
    const ring = (centre: V3, size: number) =>
      Array.from({ length: sides }, (_, index): V3 => {
        const [x, y, z] = offset((index / sides) * Math.PI * 2, size);
        return [centre[0] + x, centre[1] + y, centre[2] + z];
      });
    const [start, end] = [ring(from, radius), ring(to, radiusTo)];
    for (let index = 0; index < sides; index++) {
      const next = (index + 1) % sides;
      this.facing([start[index], start[next], end[next], end[index]], offset(((index + 0.5) / sides) * Math.PI * 2, 1), part, 1);
    }
    if (cap) this.facing(end, along, part, 1);
    return this;
  }

  /** A lamp, in the frame it's drawn in. */
  lamp(at: V3, power: number): this {
    this.lamps.push({ at: this.toRoom(at), power });
    return this;
  }

  /** A window's light, given in room coordinates: an opening's corners, and the way it faces into the room. */
  windowLight(corners: readonly [V3, V3, V3, V3], normal: V3): this {
    const [a, b, , d] = corners;
    const samples: V3[] = [];
    for (let row = 0; row < WINDOW_SAMPLES_ACROSS; row++) {
      for (let column = 0; column < WINDOW_SAMPLES_ACROSS; column++) {
        const [u, v] = [(column + 0.5) / WINDOW_SAMPLES_ACROSS, (row + 0.5) / WINDOW_SAMPLES_ACROSS];
        samples.push([a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (d[1] - a[1]) * v, a[2] + (b[2] - a[2]) * u + (d[2] - a[2]) * v]);
      }
    }
    const area = Math.hypot(...cross(sub(b, a), sub(d, a)));
    this.windows.push({ samples, normal, sharePerSample: area / samples.length });
    return this;
  }

  private open(from: V3, way: V3, reach: number): number {
    let nearest = reach;
    for (const blocker of this.blockers) nearest = Math.min(nearest, hitBox(from, way, blocker));
    return nearest;
  }

  private toShell(from: V3, way: V3): number {
    let nearest = Infinity;
    for (const axis of [0, 1, 2]) {
      if (way[axis] > 1e-9) nearest = Math.min(nearest, (this.high[axis] - from[axis]) / way[axis]);
      if (way[axis] < -1e-9) nearest = Math.min(nearest, (this.low[axis] - from[axis]) / way[axis]);
    }
    return Math.max(nearest, 0);
  }

  private lightAt(at: V3, normal: V3): [ambient: number, window: number, lamp: number] {
    const from: V3 = [at[0] + normal[0] * BAKE_LIFT_M, at[1] + normal[1] * BAKE_LIFT_M, at[2] + normal[2] * BAKE_LIFT_M];
    let [seen, whole] = [0, 0];
    for (const way of SPREAD) {
      const cosine = dot(way, normal);
      if (cosine <= 0) continue;
      const reach = this.open(from, way, Math.min(AO_REACH_M, this.toShell(from, way)));
      seen += cosine * (reach / AO_REACH_M);
      whole += cosine;
    }

    let window = 0;
    for (const { samples, normal: out, sharePerSample } of this.windows) {
      for (const sample of samples) {
        const to = sub(sample, from);
        const away2 = dot(to, to);
        const way = unit(to);
        const [toWindow, fromWindow] = [dot(way, normal), -dot(way, out)];
        if (toWindow <= 0 || fromWindow <= 0) continue;
        if (this.open(from, way, Math.sqrt(away2)) < Math.sqrt(away2)) continue;
        window += (toWindow * fromWindow * sharePerSample * WINDOW_GAIN) / (Math.PI * Math.max(away2, NEAREST_WINDOW_M2));
      }
    }

    let lamp = 0;
    for (const { at: bulb, power } of this.lamps) {
      const to = sub(bulb, from);
      const away2 = dot(to, to);
      const way = unit(to);
      const facing = (dot(way, normal) + WRAP) / (1 + WRAP);
      if (facing <= 0) continue;
      if (this.open(from, way, Math.sqrt(away2)) < Math.sqrt(away2)) continue;
      lamp += (facing * power) / (away2 + LAMP_SOFTEN_M2);
    }
    return [seen / whole, window, lamp];
  }

  get triangles() {
    return this.indices.length / 3;
  }

  build(): BufferGeometry {
    const count = this.positions.length / 3;
    const light = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      if (this.tints[index * 4 + 3] === 255) continue;
      const at = index * 3;
      light.set(this.lightAt([this.positions[at], this.positions[at + 1], this.positions[at + 2]], [this.normals[at], this.normals[at + 1], this.normals[at + 2]]), at);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(Float32Array.from(this.positions), 3));
    geometry.setAttribute("tint", new BufferAttribute(Uint8Array.from(this.tints), 4, true));
    geometry.setAttribute("light", new BufferAttribute(light, 3));
    geometry.setIndex(this.indices);
    return geometry;
  }
}
