import type { Paint, Soup, V3 } from "../art/dealers/shell";
import type { Maker, Origin } from "../sim/cars/character";
import type { Tier } from "../sim/tiers";

/*
 * The interior definition: what a dealership's art hands the walk-in system, as data. Every place that sells cars
 * builds one of these and the system reads nothing else, so a new dealership is art and a line in the registry, never
 * code in the system. `dealership/CLAUDE.md` explains each part and the rules a room keeps.
 *
 * Everything is in the room's own metres: +y up, the floor you walk on at y = 0, and the same axes as the dealership's
 * exterior model, its street side +z. A yaw turns about +y, anticlockwise seen from above, and yaw 0 faces -z.
 */

/** A point on the floor plan: x and z. */
export type PlanPoint = readonly [x: number, z: number];

/** A closed outline on the floor plan, its corners in order either way round. */
export type PlanOutline = readonly PlanPoint[];

/** Which cars it sells: every car in the car list that matches all the fields given (`sim/cars.ts`'s entries). */
export interface Stock {
  makers?: readonly Maker[];
  /** A tier, or null for a car outside the tiers. */
  tiers?: readonly (Tier | null)[];
  from?: readonly Origin[];
}

/** Where one car stands: the floor under its middle (its y the floor's height there, a plinth's top or a lift's deck) and the way its nose points. */
export interface Spot {
  at: V3;
  yaw: number;
  /** A spot on a turntable rides it: its `at` is the table's centre at its deck's height. */
  turntable?: number;
}

/** A part of the room that turns, with the car on its spot: a turntable's deck, centred on its own axis. */
export interface Turntable {
  soup: Soup;
  /** Its axis, on the floor. */
  centre: V3;
  /** One whole turn takes this long. */
  turnSeconds: number;
}

/** Something on the floor the player can't walk through: a box turned by its yaw, or a round post. */
export type Solid =
  | { kind: "box"; centre: PlanPoint; half: PlanPoint; yaw?: number }
  | { kind: "round"; centre: PlanPoint; radiusM: number };

/** A flat four-cornered pane, corners in order round it, through which the island is seen. */
export interface Window {
  corners: readonly [V3, V3, V3, V3];
}

/**
 * One source of light. A point shines all round; a spot down a cone about its aim; a strip, a tube or a run of
 * panels, from every point between its two ends. Each is as bright as `power` at itself and half that at `reachM`.
 */
export type Lamp =
  | { kind: "point"; at: V3; paint: Paint; power: number; reachM: number }
  | { kind: "spot"; at: V3; aim: V3; coneDeg: number; paint: Paint; power: number; reachM: number }
  | { kind: "strip"; from: V3; to: V3; paint: Paint; power: number; reachM: number };

/** The most lamps a room may have: the room's light is one shader for every dealership, sized for this many. */
export const MOST_LAMPS = 16;

/** How a room is lit: by its own lamps, never the sun. */
export interface RoomLight {
  /** The light every surface gets, whatever it faces: a delivery hall's bright even light is high, a yacht's evening low. 0 to 1. */
  ambient: number;
  ambientPaint: Paint;
  lamps: readonly Lamp[];
  /** What a glossy surface mirrors at a glancing angle: the floor's look, then the ceiling's. */
  mirrors: readonly [low: Paint, high: Paint];
}

/** The way in and out: where the player stands on entering, facing into the room, and how near it they must be to leave. */
export interface Door {
  at: PlanPoint;
  yaw: number;
  reachM: number;
}

export interface DealerInterior {
  /** As shown on the prompt at its door. */
  name: string;
  /** The room's origin in the exterior model's own frame: a yacht's car deck is above its waterline. */
  origin?: V3;
  /** The room's still art, one soup of the dealer kit (`art/dealers/shell.ts`), lit by `light`; a part with glow 1 shines by itself. */
  room: Soup;
  turntables: readonly Turntable[];
  stock: Stock;
  /** The spots in the order cars fill them: the finest place first. */
  spots: readonly Spot[];
  /** The floor the player may walk, as its outline. */
  floor: PlanOutline;
  /** What stands on the floor. A car on a spot is solid by itself, from its own footprint. */
  solids: readonly Solid[];
  windows: readonly Window[];
  /** Where the island is seen from: the middle of the windows, at the eye's height. */
  viewFrom: V3;
  light: RoomLight;
  door: Door;
}
