import { PARTS, type Part } from "./parts";
import { add, type Frame, inFrame, type V3 } from "./skeleton";

/*
 * Triangles as a figure writes them: every vertex with where it is in the pose, the
 * joints it turns about, how it's driven and its paint. Everything a figure needs
 * travels with its vertices, so a crowd is one buffer and one draw.
 */

export const DRIVES = ["none", "leg-left", "leg-right", "arm-left", "arm-right", "rock-x", "rock-y", "rock-z"] as const;
export type Drive = (typeof DRIVES)[number];

/** The largest turn a rock can carry and its fastest rate, for packing each into a byte. */
export const ROCK_MAX_DEGREES = 60;
export const ROCK_MAX_RATE = 10;

export interface Rig {
  drive: Drive;
  /** The joint nearer the body: a hip, a shoulder, a rock's pivot. */
  inner: V3;
  /** The joint further out: a knee, an elbow. */
  outer: V3;
  /** Past the outer joint, so it turns about both. */
  lower: boolean;
  degrees: number;
  rate: number;
  /** A rock that comes and goes, rather than one that never stops. */
  gated: boolean;
}

export const STILL: Rig = { drive: "none", inner: [0, 0, 0], outer: [0, 0, 0], lower: false, degrees: 0, rate: 0, gated: false };

/** A ring of a loft: a centre and two half-axes. */
export interface Ring {
  at: V3;
  u: V3;
  v: V3;
  /** Baked light for this ring; 1 if left out. */
  shade?: number;
}

export const ringIn = (frame: Frame, y: number, radiusX: number, radiusZ: number, z = 0, shade?: number): Ring => ({
  at: inFrame(frame, 0, y, z),
  u: add([0, 0, 0], frame.x, radiusX),
  v: add([0, 0, 0], frame.z, radiusZ),
  shade,
});

/** How much of a turn a ring starts at: half a side leaves a flat front, none a soft ridge down it. */
export type LoftOptions = {
  sides: number;
  /** A ring's first corner, as a share of a side from the front. */
  turn?: number;
  capStart?: boolean;
  capEnd?: boolean;
};

const SHADE_UNIT = 128;

export class Soup {
  positions: number[] = [];
  inners: number[] = [];
  outers: number[] = [];
  rigs: number[] = [];
  tints: number[] = [];
  indices: number[] = [];
  rig: Rig = STILL;

  get vertexCount() {
    return this.positions.length / 3;
  }

  get triangleCount() {
    return this.indices.length / 3;
  }

  vertex(at: V3, part: Part, shade = 1): number {
    this.positions.push(...at);
    this.inners.push(...this.rig.inner);
    this.outers.push(...this.rig.outer);
    const { drive, lower, degrees, rate, gated } = this.rig;
    const isRock = drive.startsWith("rock");
    this.rigs.push(DRIVES.indexOf(drive), isRock ? Math.round((degrees / ROCK_MAX_DEGREES) * 255) : lower ? 255 : 0, Math.round((rate / ROCK_MAX_RATE) * 255), gated ? 255 : 0);
    this.tints.push(PARTS.indexOf(part), Math.min(255, Math.round(shade * SHADE_UNIT)), 0, 0);
    return this.vertexCount - 1;
  }

  /** Writes what `draw` makes with this rig, then goes back to the one before. */
  rigged(rig: Rig, draw: () => void) {
    const before = this.rig;
    this.rig = rig;
    draw();
    this.rig = before;
  }

  private ringVertices({ at, u, v, shade = 1 }: Ring, part: Part, sides: number, turn: number): number {
    const first = this.vertexCount;
    for (let side = 0; side < sides; side++) {
      const angle = Math.PI / 2 + ((side + turn) / sides) * 2 * Math.PI;
      this.vertex(add(add(at, u, Math.cos(angle)), v, Math.sin(angle)), part, shade);
    }
    return first;
  }

  /** Rings joined into a skin. `parts` gives each band between two rings its paint, or one paint for them all. */
  loft(rings: readonly Ring[], parts: Part | readonly Part[], { sides, turn = 0.5, capStart = false, capEnd = false }: LoftOptions): this {
    const bandPart = (band: number) => (typeof parts === "string" ? parts : parts[band]);
    let first = -1;
    for (let band = 0; band + 1 < rings.length; band++) {
      const part = bandPart(band);
      if (first < 0 || part !== bandPart(band - 1)) first = this.ringVertices(rings[band], part, sides, turn);
      const next = this.ringVertices(rings[band + 1], part, sides, turn);
      for (let side = 0; side < sides; side++) {
        const after = (side + 1) % sides;
        this.indices.push(first + side, first + after, next + side, next + side, first + after, next + after);
      }
      if (band === 0 && capStart) this.cap(first, sides);
      if (band === rings.length - 2 && capEnd) this.cap(next, sides);
      first = next;
    }
    return this;
  }

  private cap(first: number, sides: number) {
    for (let side = 1; side < sides - 1; side++) this.indices.push(first, first + side, first + side + 1);
  }

  /** A closing point for a ring already written, as the tip of a limb. */
  tip(ring: Ring, point: V3, part: Part, sides: number, turn = 0.5): this {
    const first = this.ringVertices(ring, part, sides, turn);
    const apex = this.vertex(point, part, ring.shade);
    for (let side = 0; side < sides; side++) this.indices.push(first + side, first + (side + 1) % sides, apex);
    return this;
  }

  /** Closed rows of points joined into a skin, each row the same length. */
  bands(rows: readonly (readonly V3[])[], part: Part, shade = 1): this {
    const firsts = rows.map((row) => {
      const first = this.vertexCount;
      for (const point of row) this.vertex(point, part, shade);
      return first;
    });
    const size = rows[0].length;
    for (let band = 0; band + 1 < rows.length; band++) {
      for (let side = 0; side < size; side++) {
        const after = (side + 1) % size;
        const [top, bottom] = [firsts[band], firsts[band + 1]];
        this.indices.push(top + side, top + after, bottom + side, bottom + side, top + after, bottom + after);
      }
    }
    return this;
  }

  /** A row of points closed to a single one, as the crown of a head of hair. */
  fan(apex: V3, row: readonly V3[], part: Part): this {
    const centre = this.vertex(apex, part);
    const first = this.vertexCount;
    for (const point of row) this.vertex(point, part);
    for (let side = 0; side < row.length; side++) this.indices.push(centre, first + side, first + (side + 1) % row.length);
    return this;
  }

  /** Rings each on a rig of its own, closed at a point: what's pinned at both ends and stretches between. */
  strand(rings: readonly (Ring & { rig: Rig })[], end: V3, part: Part, sides: number): this {
    const before = this.rig;
    const firsts = rings.map((ring) => {
      this.rig = ring.rig;
      return this.ringVertices(ring, part, sides, 0.5);
    });
    for (let band = 0; band + 1 < firsts.length; band++) {
      for (let side = 0; side < sides; side++) {
        const after = (side + 1) % sides;
        const [top, bottom] = [firsts[band], firsts[band + 1]];
        this.indices.push(top + side, top + after, bottom + side, bottom + side, top + after, bottom + after);
      }
    }
    const last = firsts[firsts.length - 1];
    const apex = this.vertex(end, part);
    for (let side = 0; side < sides; side++) this.indices.push(last + side, last + (side + 1) % sides, apex);
    this.rig = before;
    return this;
  }

  quad(a: V3, b: V3, c: V3, d: V3, part: Part, shade = 1): this {
    const first = this.vertexCount;
    for (const corner of [a, b, c, d]) this.vertex(corner, part, shade);
    this.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    return this;
  }
}
