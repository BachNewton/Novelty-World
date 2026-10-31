import { BufferAttribute, BufferGeometry } from "three/webgpu";
import { Model, type BoxOptions, type Part, type TubeOptions, type V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { MOTION_KINDS, MOTION_RANGE_M, type Motion as StreetMotion } from "../street/paint";

/*
 * The roadside `Model` writes the shapes, with the street kit's tint layout, so a
 * marina model takes `placeModel` and the street's grow, dissolve and movement. Only
 * the paints are this folder's: each is one `Model`, joined by `build`.
 *
 * On land an origin is on the ground and a y of 0 is the ground. On the water a y of 0
 * is the water.
 */

export const PAINT = {
  "mark-red": { from: "mark-red", float: true },
  "mark-green": { from: "mark-green", float: true },
  "mark-yellow": { from: "mark-yellow", float: true },
  "mark-black": { from: "mark-black", gain: 1.1, float: true },
  "mark-white": { from: "mark-white", float: true },
  "mark-lens": { from: "car-lamp", float: true },
  "float-hull": { from: "wall-plinth", gain: 0.55, float: true },
  deck: { from: "wall-grey", to: "wall-door", share: 0.2, gain: 1.05, float: true },
  "deck-pale": { from: "wall-grey", to: "wall-door", share: 0.08, gain: 1.14, float: true },
  pile: { from: "wall-door", to: "wall-plinth", share: 0.5, gain: 0.8, float: true },
  "pile-top": { from: "wall-trim", float: true },
  fender: { from: "wall-plinth", gain: 0.5, float: true },
  galvanised: { from: "wall-pale", to: "wall-grey", share: 0.45, gain: 0.95 },
  "pale-plastic": { from: "wall-trim", to: "wall-pale", share: 0.5 },
  "pedestal-cap": { from: "sign-blue", gain: 1.05 },
  concrete: { from: "wall-pale", to: "wall-grey", share: 0.35 },
  "concrete-wet": { from: "wall-grey", to: "wall-plinth", share: 0.45, gain: 0.85, float: true },
  rail: { from: "rust", to: "wall-plinth", share: 0.35, gain: 0.95, float: true },
  sleeper: { from: "tar", to: "wall-door", share: 0.4, float: true },
  steel: { from: "wall-plinth", gain: 0.75 },
  lift: { from: "sign-blue", to: "wall-pale", share: 0.08 },
  "lift-dark": { from: "wall-plinth", gain: 0.6 },
  sling: { from: "mark-yellow", to: "wall-grey", share: 0.3 },
  tyre: { from: "car-tyre", gain: 1.2 },
  glass: { from: "wall-glass" },
  "red-boards": { from: "wall-red", boards: true },
  "grey-boards": { from: "wall-grey", to: "tree-bark", share: 0.18, gain: 0.9, boards: true },
  "tar-boards": { from: "tar", to: "wall-door", share: 0.35, gain: 1.1, boards: true },
  "white-boards": { from: "wall-trim", to: "wall-pale", share: 0.25, boards: true },
  trim: { from: "wall-trim" },
  door: { from: "wall-door", gain: 0.9, boards: true },
  "roof-dark": { from: "wall-plinth", gain: 0.82 },
  "roof-tin": { from: "wall-pale", to: "wall-grey", share: 0.6, gain: 0.85 },
  "roof-red": { from: "wall-red", to: "wall-plinth", share: 0.3 },
  "roof-under": { from: "wall-plinth", gain: 0.5 },
  "stone-grey": { from: "wall-grey", to: "wall-pale", share: 0.2, gain: 0.82, float: true },
  "stone-pink": { from: "wall-red", to: "wall-cream", share: 0.42, gain: 0.82, float: true },
  "stone-dark": { from: "wall-plinth", to: "wall-grey", share: 0.3, gain: 0.8 },
  lichen: { from: "wall-pale", to: "tree-birch", share: 0.2, float: true },
  ember: { from: "edge", gain: 1.2 },
  "hull-white": { from: "wall-trim" },
  antifoul: { from: "wall-red", to: "wall-plinth", share: 0.45, gain: 0.8 },
  "boot-top": { from: "sign-blue", gain: 0.6 },
  "yacht-deck": { from: "wall-cream", to: "wall-grey", share: 0.2 },
  "tarp-blue": { from: "tarp-blue" },
  "tarp-green": { from: "tarp-green" },
  shrink: { from: "wall-trim", gain: 1.02 },
  lashing: { from: "wall-cream", to: "wall-grey", share: 0.3, gain: 0.8 },
  spar: { from: "wall-pale", gain: 1.02 },
  "new-timber": { from: "new-timber" },
  "new-timber-end": { from: "new-timber", to: "wall-yellow", share: 0.3, gain: 1.08 },
  "new-timber-dark": { from: "new-timber", to: "oak", share: 0.5, gain: 0.92 },
  oak: { from: "oak" },
  plank: { from: "oak", to: "new-timber", share: 0.6 },
  "plank-tarred": { from: "oak", to: "tar", share: 0.55 },
  stickers: { from: "wall-grey", to: "tree-bark", share: 0.4 },
  iron: { from: "tar", to: "wall-plinth", share: 0.35, gain: 1.1 },
  "iron-rust": { from: "rust", to: "tar", share: 0.25 },
  tar: { from: "tar" },
  bronze: { from: "bronze" },
  brass: { from: "bronze", to: "ui-accent", share: 0.5, gain: 1.05 },
  net: { from: "wall-grey", to: "tree-pine", share: 0.3, gain: 0.8 },
  "net-orange": { from: "float-orange", to: "wall-door", share: 0.25 },
  "float-orange": { from: "float-orange", float: true },
  "float-white": { from: "wall-trim", float: true },
  rope: { from: "wall-yellow", to: "wall-grey", share: 0.4, gain: 0.9 },
  "box-blue": { from: "sign-blue", to: "wall-pale", share: 0.25 },
  "box-grey": { from: "wall-pale", to: "wall-grey", share: 0.3 },
  ice: { from: "wall-trim", to: "sky", share: 0.3, gain: 1.05 },
  "sign-blue": { from: "sign-blue" },
  "sign-white": { from: "wall-trim", gain: 1.04 },
  "flag-ax-blue": { from: "flag-ax-blue" },
  "flag-ax-yellow": { from: "flag-ax-yellow" },
  "flag-ax-red": { from: "flag-ax-red" },
  "flag-white": { from: "flag-white" },
  "figure-white": { from: "wall-trim", to: "wall-cream", share: 0.25 },
  "figure-gold": { from: "ui-accent", to: "bronze", share: 0.45 },
  "figure-blue": { from: "sign-blue" },
  "figure-skin": { from: "wall-cream", to: "wall-red", share: 0.12, gain: 1.05 },
  grass: { from: "tree-birch", to: "ground", share: 0.5 },
} as const satisfies Record<string, { from: string; to?: string; share?: number; gain?: number; float?: boolean; boards?: boolean }>;

export type MarinaPart = keyof typeof PAINT;
export const MARINA_PARTS = Object.keys(PAINT) as MarinaPart[];

export type Motion = (part: MarinaPart, at: V3) => ReturnType<StreetMotion>;

/** Any part: `Marked` replaces it, so which one doesn't matter. */
const UNREAD: Part = "galvanised";
const TINT_STRIDE = 4;

export const HALF_PI = Math.PI / 2;
export const TAU = Math.PI * 2;

export interface GableShed {
  /** Corners on the ground, x along the ridge. */
  x: readonly [number, number];
  z: readonly [number, number];
  /** How high the walls stand from `foot`, and where the ridge is. */
  eaves: number;
  ridge: number;
  foot?: number;
  overhang?: number;
  walls: MarinaPart;
  roof: MarinaPart;
  /** Boards round the eaves and verges, in this paint. */
  fascia?: MarinaPart;
}

/** A model with the same methods as the roadside `Model`, over this kit's paints, and the shapes a harbour keeps asking for. */
export class Marked {
  private readonly layers = new Map<MarinaPart, Model>();

  private layer(part: MarinaPart): Model {
    const known = this.layers.get(part);
    if (known !== undefined) return known;
    const model = new Model();
    this.layers.set(part, model);
    return model;
  }

  face(corners: readonly V3[], part: MarinaPart, shade = 1): this {
    this.layer(part).face(corners, UNREAD, shade);
    return this;
  }

  tube(from: V3, to: V3, radius: number, sides: number, options: TubeOptions, part: MarinaPart): this {
    this.layer(part).tube(from, to, radius, sides, options, UNREAD);
    return this;
  }

  spike(from: V3, to: V3, radius: number, part: MarinaPart, shade = 1): this {
    this.layer(part).spike(from, to, radius, UNREAD, shade);
    return this;
  }

  beam(from: V3, to: V3, wide: number, tall: number, part: MarinaPart, shade = 1, shadeTop = shade): this {
    this.layer(part).beam(from, to, wide, tall, UNREAD, shade, shadeTop);
    return this;
  }

  box(low: V3, high: V3, part: MarinaPart, options: BoxOptions = {}): this {
    this.layer(part).box(low, high, UNREAD, options);
    return this;
  }

  /** A turned shape up the y axis: `rings` are heights and radii, lowest first, each ring a tube to the next. */
  lathe(centre: V3, rings: readonly (readonly [up: number, radius: number])[], sides: number, part: MarinaPart): this {
    for (let ring = 0; ring + 1 < rings.length; ring++) {
      const [[fromUp, fromRadius], [toUp, toRadius]] = [rings[ring], rings[ring + 1]];
      this.tube([centre[0], centre[1] + fromUp, centre[2]], [centre[0], centre[1] + toUp, centre[2]], fromRadius, sides, { radiusTo: toRadius, shadeFrom: 0.86 + 0.3 * (ring / rings.length), shadeTo: 0.92 + 0.3 * (ring / rings.length) }, part);
    }
    return this;
  }

  /** A closed loop of beams round a centre, in the plane of two directions: wheels, rings and rims. */
  hoop(centre: V3, radius: number, sides: number, thick: number, part: MarinaPart, plane: "xy" | "xz" | "zy" = "xy"): this {
    const point = (side: number): V3 => {
      const [a, b] = [Math.cos((side / sides) * TAU) * radius, Math.sin((side / sides) * TAU) * radius];
      if (plane === "xy") return [centre[0] + a, centre[1] + b, centre[2]];
      if (plane === "xz") return [centre[0] + a, centre[1], centre[2] + b];
      return [centre[0], centre[1] + b, centre[2] + a];
    };
    for (let side = 0; side < sides; side++) this.beam(point(side), point(side + 1), thick, thick, part);
    return this;
  }

  /** A wheel on an axle along z: a short capped drum. */
  wheel(centre: V3, radius: number, wide: number, part: MarinaPart = "tyre"): this {
    return this.tube([centre[0], centre[1], centre[2] - wide / 2], [centre[0], centre[1], centre[2] + wide / 2], radius, 8, { cap: true }, part);
  }

  /** A pitched shed: four walls with gables, two roof slopes and, if asked, fascia boards. */
  shed({ x: [x0, x1], z: [z0, z1], eaves, ridge, foot = 0, overhang = 0.25, walls, roof, fascia }: GableShed): this {
    const midZ = (z0 + z1) / 2;
    const [top, peak] = [foot + eaves, foot + ridge];
    this.face([[x0, foot, z1], [x1, foot, z1], [x1, top, z1], [x0, top, z1]], walls, 1);
    this.face([[x1, foot, z0], [x0, foot, z0], [x0, top, z0], [x1, top, z0]], walls, 0.86);
    for (const [x, shade] of [[x0, 0.9], [x1, 1.02]] as const) this.face([[x, foot, z0], [x, foot, z1], [x, top, z1], [x, peak, midZ], [x, top, z0]], walls, shade);
    const slope = (ridge - eaves) / ((z1 - z0) / 2);
    const [ex0, ex1] = [x0 - overhang, x1 + overhang];
    const drop = overhang * slope;
    for (const [outer, shade] of [[z1 + overhang, 1.02], [z0 - overhang, 0.9]] as const) this.face([[ex0, peak, midZ], [ex1, peak, midZ], [ex1, top - drop, outer], [ex0, top - drop, outer]], roof, shade);
    if (fascia !== undefined) {
      for (const x of [ex0, ex1]) {
        this.beam([x, peak - 0.1, midZ], [x, top - drop - 0.05, z1 + overhang], 0.05, 0.16, fascia);
        this.beam([x, peak - 0.1, midZ], [x, top - drop - 0.05, z0 - overhang], 0.05, 0.16, fascia);
      }
    }
    return this;
  }

  /** A framed window on a wall that faces along x or z, with its cross bars. */
  window(at: V3, wide: number, tall: number, facing: "x" | "z", frame: MarinaPart = "trim"): this {
    const [x, y, z] = at;
    const way = (along: number, up: number, out: number): V3 => (facing === "x" ? [x + out, y + up, z + along] : [x + along, y + up, z + out]);
    const edge = 0.06;
    this.face([way(-wide / 2 - edge, -edge, 0), way(wide / 2 + edge, -edge, 0), way(wide / 2 + edge, tall + edge, 0), way(-wide / 2 - edge, tall + edge, 0)], frame);
    this.face([way(-wide / 2, 0, 0.01), way(wide / 2, 0, 0.01), way(wide / 2, tall, 0.01), way(-wide / 2, tall, 0.01)], "glass");
    return this.face([way(-0.02, 0, 0.02), way(0.02, 0, 0.02), way(0.02, tall, 0.02), way(-0.02, tall, 0.02)], frame);
  }

  build(motion?: Motion): BufferGeometry {
    const parts = [...this.layers].map(([part, model]) => ({ part, geometry: model.build() }));
    const count = (name: string) => parts.reduce((sum, { geometry }) => sum + geometry.getAttribute(name).array.length, 0);
    const positions = new Float32Array(count("position"));
    const tints = new Uint8Array(count("tint"));
    const indices: number[] = [];
    let vertices = 0;
    for (const { part, geometry } of parts) {
      const position = geometry.getAttribute("position");
      const tint = geometry.getAttribute("tint");
      positions.set(position.array, vertices * 3);
      tints.set(tint.array, vertices * TINT_STRIDE);
      for (let vertex = 0; vertex < position.count; vertex++) {
        const at = vertices + vertex;
        tints[at * TINT_STRIDE] = MARINA_PARTS.indexOf(part);
        if (motion === undefined) continue;
        const { kind, metres = 0 } = motion(part, [position.getX(vertex), position.getY(vertex), position.getZ(vertex)]);
        tints[at * TINT_STRIDE + 2] = Math.round(Math.min(1, metres / MOTION_RANGE_M) * 255);
        tints[at * TINT_STRIDE + 3] = MOTION_KINDS.indexOf(kind);
      }
      for (const index of geometry.getIndex()?.array ?? []) indices.push(index + vertices);
      vertices += position.count;
    }
    const joined = new BufferGeometry();
    joined.setAttribute("position", new BufferAttribute(positions, 3));
    joined.setAttribute("tint", new BufferAttribute(tints, TINT_STRIDE, true));
    joined.setIndex(indices);
    return joined;
  }
}

/** A marina object's versions, ready for `placeModel`. With no far version it simply dissolves away at `swapM`. */
export function marinaModel(near: Marked, far: Marked | null, swapM: number, reachM: number, motion?: Motion): RoadsideModel {
  return { near: near.build(motion), far: far?.build(motion) ?? null, swapM, reachM };
}

/** A building's walls and roof as cheap as they go, for a far version. */
export function farShed(shed: GableShed): Marked {
  return new Marked().shed({ ...shed, fascia: undefined });
}
