import type { OnLane } from "./around";
import { bikeRides, seedShare, walks, type LaneCar, type LaneTraffic, type VehicleKind } from "./lane-driver";
import { pointAlong, type Lane } from "./lane-map";
import type { LaneNet } from "./lane-net";

/*
 * The bubble: the cars, cyclists and walkers round the player, made and taken away only
 * where the player can't see it happen: past where their kind is drawn, out of
 * the camera's view, or behind the ground. Every lane holds places a vehicle may
 * start from, a slot every few tens of metres, and each slot is a seed: whether
 * it ever holds anyone, by its road's or path's density, and who, so a road
 * fills the same way each time it's driven and a vehicle that comes back is the
 * same one. A slot fills while its vehicle is gone and it lies out of sight in
 * the bubble; a vehicle goes once it's out of sight past the bubble's edge, or
 * its trip has ended. The first fill, as a page opens, goes anywhere: nothing
 * was there to see appear.
 */

/** Vehicles per kilometre of one lane, at Åland's own light traffic: busiest on the main roads, a car every few minutes on a village lane. */
const CARS_PER_KM: Partial<Record<string, number>> = {
  primary: 0.8,
  secondary: 0.6,
  tertiary: 0.4,
  unclassified: 0.2,
  residential: 0.25,
  living_street: 0.1,
  road: 0.2,
  service: 0.03,
  track: 0.01,
};

/** Cyclists per kilometre of one lane: most on the cycleways, a few on footways and quiet streets, fewest on the main roads. */
const BIKES_PER_KM: Partial<Record<string, number>> = {
  cycleway: 1.2,
  footway: 0.25,
  path: 0.2,
  pedestrian: 0.3,
  living_street: 0.3,
  residential: 0.2,
  unclassified: 0.1,
  tertiary: 0.06,
  secondary: 0.04,
  primary: 0.02,
  service: 0.03,
  track: 0.05,
};

/**
 * Walkers per kilometre of one way of a path: most down a pedestrian street and along the footways, which in a town are
 * its pavements, fewer on country paths and the cycleways they share.
 */
const WALKERS_PER_KM: Partial<Record<string, number>> = {
  pedestrian: 8,
  footway: 2.5,
  steps: 1.5,
  path: 0.8,
  cycleway: 0.5,
  bridleway: 0.3,
};

/** A slot every this many metres of lane, the first half that from its start. */
const SLOT_M = 40;

interface KindRules {
  /** Vehicles per kilometre of a lane at a density of 1. */
  perKm: (lane: Lane) => number;
  /** Nothing starts nearer the player than this, seen or not: a car behind the player at speed would run into it. */
  nearestM: number;
  /** Nor nearer another vehicle than this. */
  clearM: number;
  /**
   * How far past its kind's reach the bubble fills, and how much further a vehicle may go before it's taken away: far
   * enough for a car at speed, and less for a walker, who covers little ground and is drawn only near.
   */
  beyondM: number;
  leaveM: number;
}

const RULES: Record<VehicleKind, KindRules> = {
  car: { perKm: (lane) => (lane.path ? 0 : (CARS_PER_KM[lane.kind] ?? 0)), nearestM: 80, clearM: 25, beyondM: 250, leaveM: 200 },
  bike: { perKm: (lane) => (bikeRides(lane) ? (BIKES_PER_KM[lane.kind] ?? 0) : 0), nearestM: 40, clearM: 8, beyondM: 250, leaveM: 200 },
  walker: { perKm: (lane) => (walks(lane) ? (WALKERS_PER_KM[lane.kind] ?? 0) : 0), nearestM: 20, clearM: 3, beyondM: 100, leaveM: 100 },
};

/** Whether two kinds ever meet on a lane: a walker on a pavement is no reason for a car not to start beside it. */
const meet = (one: VehicleKind, other: VehicleKind) => !(one === "car" && other === "walker") && !(one === "walker" && other === "car");

/** A whole number from a slot's name, the same each time. */
function seedOf(name: string): number {
  let hash = 0x811c9dc5;
  for (let at = 0; at < name.length; at++) hash = Math.imul(hash ^ name.charCodeAt(at), 0x01000193);
  return hash >>> 0;
}

/** What the bubble keeps each kind to: how far it's drawn, and its density, 1 for Åland's own and 0 for none. */
export interface BubbleKind {
  reachM: number;
  density: number;
}

/** Whether the player could see a vehicle standing where it would. */
export type Seen = (vehicle: Pick<LaneCar, "kind" | "pose" | "half">) => boolean;

export class Bubble {
  private seen: Seen = () => true;
  /** Kinds whose next fill is the first, which may go anywhere. */
  private readonly fresh = new Set<VehicleKind>();
  private readonly made = { spawned: 0, gone: 0 };

  constructor(
    private readonly net: LaneNet,
    private readonly traffic: LaneTraffic,
    private readonly kinds: Record<VehicleKind, BubbleKind>,
  ) {
    traffic.mayGo = (vehicle) => !this.seen(vehicle);
    for (const kind of Object.keys(kinds) as VehicleKind[]) if (kinds[kind].density > 0) this.fresh.add(kind);
  }

  /**
   * Sets a kind's density, and takes every one of it away at 0. A kind turned on or up fills at once, anywhere: it's a
   * setting changed on purpose, not traffic arriving.
   */
  setDensity(kind: VehicleKind, density: number): void {
    if (density > this.kinds[kind].density) this.fresh.add(kind);
    this.kinds[kind].density = density;
    if (density === 0) for (const vehicle of [...this.traffic.all()]) if (vehicle.kind === kind) this.traffic.remove(vehicle.id);
  }

  density(kind: VehicleKind): number {
    return this.kinds[kind].density;
  }

  /** How many vehicles it has made and taken away. */
  counts(): { spawned: number; gone: number } {
    return { ...this.made };
  }

  /** Takes away what has gone out of sight past the bubble's edge, and fills the slots out of sight within it. */
  update(focus: { x: number; z: number }, seen: Seen): void {
    this.seen = seen;
    for (const vehicle of [...this.traffic.all()]) {
      const { reachM } = this.kinds[vehicle.kind];
      const { beyondM, leaveM } = RULES[vehicle.kind];
      if (Math.hypot(vehicle.pose.x - focus.x, vehicle.pose.z - focus.z) > reachM + beyondM + leaveM && !seen(vehicle)) {
        this.traffic.remove(vehicle.id);
        this.made.gone++;
      }
    }
    for (const kind of Object.keys(this.kinds) as VehicleKind[]) {
      if (this.kinds[kind].density > 0) this.fill(kind, focus);
    }
  }

  private fill(kind: VehicleKind, focus: { x: number; z: number }): void {
    const { reachM, density } = this.kinds[kind];
    const { perKm, nearestM, clearM, beyondM } = RULES[kind];
    const bubbleM = reachM + beyondM;
    const fresh = this.fresh.has(kind);
    const others = [...this.traffic.all()];
    let lanes = 0;
    for (const ref of this.net.lanesNear(focus.x, focus.z, bubbleM)) {
      lanes++;
      const tile = this.net.tile(ref.tile);
      if (!tile) continue;
      const lane = tile.lanes[ref.lane];
      const share = Math.min(1, (perKm(lane) * density * SLOT_M) / 1000);
      if (share === 0) continue;
      const place: OnLane = { tile: ref.tile, index: ref.lane, connector: false, along: 0 };
      const slots = Math.floor(this.traffic.around.length(place) / SLOT_M);
      for (let slot = 0; slot < slots; slot++) {
        const id = `${kind}:${ref.tile}:${ref.lane}:${slot}`;
        const seed = seedOf(id);
        if (seedShare(seed) >= share || this.traffic.get(id)) continue;
        const at = pointAlong(tile.points, lane, (slot + 0.5) * SLOT_M);
        const away = Math.hypot(at.x - focus.x, at.z - focus.z);
        if (away > bubbleM || (!fresh && away < nearestM)) continue;
        if (others.some((other) => meet(other.kind, kind) && Math.hypot(other.pose.x - at.x, other.pose.z - at.z) < clearM)) continue;
        const half = kind === "car" ? this.traffic.halfOf(seed) : null;
        if (!fresh && this.seen({ kind, pose: { ...at, yaw: 0 }, half: half ?? [0.5, 1] })) continue;
        others.push(this.traffic.enter({ ...place, along: (slot + 0.5) * SLOT_M }, { kind, seed, id }));
        this.made.spawned++;
      }
    }
    if (lanes > 0) this.fresh.delete(kind);
  }
}
