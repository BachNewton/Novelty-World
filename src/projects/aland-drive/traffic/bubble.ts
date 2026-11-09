import type { OnLane } from "./around";
import { bikeRides, seedShare, walks, type LaneCar, type LaneTraffic, type VehicleKind } from "./lane-driver";
import { pointAlong, type Lane } from "./lane-map";
import type { LaneNet } from "./lane-net";
import { carHourShare, pathShare, type TrafficClock } from "./rhythm";

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
 *
 * In the shared world every player runs a bubble, and a slot is kept by the
 * player nearest it: only they fill it, and only beyond every other player's
 * reach, since what another player's camera sees isn't known here. A vehicle is
 * taken away only by the player running it, once it's past every player's edge;
 * one another player runs is only let go of here, as it leaves this one's.
 */

/**
 * Cars on a lane come from its road's real vehicles a day (`Lane.daily`): a road holds its flow over its speed at any
 * moment, so a lane holds half the hour's traffic over its limit, the hour's share of the day following the game's
 * clock and calendar (`rhythm.ts`). With no clock set, every hour is an average daytime one.
 */
const DAYTIME_HOUR_SHARE = 0.065;
/** As games are, busier than the real island by half, so a daytime drive away from town meets something about once a minute. */
const BUSIER_THAN_REAL = 1.5;

/** Cars per kilometre of a road lane at a density of 1. */
function carsPerKm(lane: Lane, clock: TrafficClock | null): number {
  const [[, speedKmh]] = lane.speeds;
  return (BUSIER_THAN_REAL * (clock ? carHourShare(clock) : DAYTIME_HOUR_SHARE) * lane.daily) / 2 / speedKmh;
}

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


interface KindRules {
  /** Vehicles per kilometre of a lane at a density of 1, at the clock's hour and day, or an average daytime hour without one. */
  perKm: (lane: Lane, clock: TrafficClock | null) => number;
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
  /**
   * A slot every this many metres of lane, the first half that from its start. A walker's paths are cut into short
   * lanes at every junction, so its lanes share their whole length among their slots, at least one a lane; a car's
   * or a cyclist's past its last whole slot holds none.
   */
  slotM: number;
  shortLanes: boolean;
}

const RULES: Record<VehicleKind, KindRules> = {
  car: { perKm: (lane, clock) => (lane.path ? 0 : carsPerKm(lane, clock)), nearestM: 80, clearM: 25, beyondM: 250, leaveM: 200, slotM: 40, shortLanes: false },
  bike: { perKm: (lane, clock) => (bikeRides(lane) ? (BIKES_PER_KM[lane.kind] ?? 0) * (clock ? pathShare("bike", clock) : 1) : 0), nearestM: 40, clearM: 8, beyondM: 250, leaveM: 200, slotM: 40, shortLanes: false },
  walker: { perKm: (lane, clock) => (walks(lane) ? (WALKERS_PER_KM[lane.kind] ?? 0) * (clock ? pathShare("walker", clock) : 1) : 0), nearestM: 20, clearM: 3, beyondM: 100, leaveM: 100, slotM: 10, shortLanes: true },
};

/** Whether two kinds ever meet on a lane: a walker on a pavement is no reason for a car not to start beside it. */
const meet = (one: VehicleKind, other: VehicleKind) => !(one === "car" && other === "walker") && !(one === "walker" && other === "car");

/** A slot is kept by the player nearer it than any other by this much; between two players, until one is, by neither. */
export const KEEP_MARGIN_M = 10;

/** The slot a vehicle came from: its name, less what a player added to tell it from another out of the same slot. */
export const slotOf = (id: string) => id.split("~")[0];

/** A whole number from a slot's name, the same each time. */
function seedOf(name: string): number {
  let hash = 0x811c9dc5;
  for (let at = 0; at < name.length; at++) hash = Math.imul(hash ^ name.charCodeAt(at), 0x01000193);
  return hash >>> 0;
}

/**
 * What the bubble keeps each kind to: how far it's drawn, and its density, 1 for Åland's own and 0 for none. Both are
 * numbers a step reads, which a setting turns down on a weaker machine (`traffic/settings.ts`).
 */
export interface BubbleKind {
  reachM: number;
  density: number;
}

/** Whether the player could see a vehicle standing where it would. */
export type Seen = (vehicle: Pick<LaneCar, "kind" | "pose" | "half">) => boolean;

/**
 * Where the other players are, whether this player runs a vehicle, and whether it knows where everyone is yet: until it
 * does, it fills nothing, or a page joining a world would fill what the others already have. Alone, there are none, it
 * runs them all and it knows.
 */
export interface Sharing {
  others: readonly { x: number; z: number }[];
  runsHere: (vehicle: LaneCar) => boolean;
  ready: boolean;
}

const ALONE: Sharing = { others: [], runsHere: () => true, ready: true };

export class Bubble {
  private seen: Seen = () => true;
  private sharing = ALONE;
  /** Kinds whose next fill is the first, which may go anywhere. */
  private readonly fresh = new Set<VehicleKind>();
  private readonly made = { spawned: 0, gone: 0 };
  private clock: TrafficClock | null = null;
  private cost = { density: 1, reach: 1 };

  constructor(
    private readonly net: LaneNet,
    private readonly traffic: LaneTraffic,
    private readonly kinds: Record<VehicleKind, BubbleKind>,
    /** A new vehicle's id from its slot's: the slot's alone, but online, where another player may have one from it far off. */
    private readonly nameOf: (slot: string) => string = (slot) => slot,
  ) {
    // Out of this player's sight, and of every other player's reach.
    traffic.mayGo = (vehicle) => !this.seen(vehicle) && this.sharing.others.every((other) => Math.hypot(vehicle.pose.x - other.x, vehicle.pose.z - other.z) > this.kinds[vehicle.kind].reachM);
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

  /**
   * The hour and day of the year the bubble fills for. A quieter hour leaves fewer slots to fill, and those out already
   * drive on until they leave as ever, so the roads empty and fill as the hours pass, never in sight.
   */
  setClock(clock: TrafficClock | null): void {
    this.clock = clock;
  }

  /**
   * What a weaker machine turns down (`traffic/settings.ts`), as shares of the full: how many of every kind the roads
   * and paths hold, and how far round the player the bubble fills and keeps them. Neither changes how any of them
   * drives. A shorter reach holds fewer to step; what's drawn still reaches as far, so a vehicle never appears in sight.
   */
  setCost(density: number, reach: number): void {
    this.cost = { density, reach };
  }

  /** The next fill of every kind turned on goes anywhere, as a page's first does: after a jump, nobody saw the car arrive. */
  refill(): void {
    for (const kind of Object.keys(this.kinds) as VehicleKind[]) if (this.kinds[kind].density > 0) this.fresh.add(kind);
  }

  density(kind: VehicleKind): number {
    return this.kinds[kind].density;
  }

  /** How many vehicles it has made and taken away. */
  counts(): { spawned: number; gone: number } {
    return { ...this.made };
  }

  /** How far from a player a vehicle of a kind is past the bubble's edge, and goes. */
  edgeM(kind: VehicleKind): number {
    const { beyondM, leaveM } = RULES[kind];
    return this.kinds[kind].reachM * this.cost.reach + beyondM + leaveM;
  }

  /** Takes away what has gone out of sight past the bubble's edge, and fills the slots out of sight within it that this player keeps. */
  update(focus: { x: number; z: number }, seen: Seen, sharing: Sharing = ALONE): void {
    this.seen = seen;
    this.sharing = sharing;
    for (const vehicle of [...this.traffic.all()]) {
      const edge = this.edgeM(vehicle.kind);
      const past = (at: { x: number; z: number }) => Math.hypot(vehicle.pose.x - at.x, vehicle.pose.z - at.z) > edge;
      if (!past(focus) || seen(vehicle)) continue;
      if (!sharing.runsHere(vehicle)) this.traffic.remove(vehicle.id);
      else if (sharing.others.every(past)) {
        this.traffic.remove(vehicle.id);
        this.made.gone++;
      }
    }
    if (!sharing.ready) return;
    for (const kind of Object.keys(this.kinds) as VehicleKind[]) {
      if (this.kinds[kind].density > 0) this.fill(kind, focus, sharing.others);
    }
  }

  private fill(kind: VehicleKind, focus: { x: number; z: number }, others: Sharing["others"]): void {
    const { reachM, density } = this.kinds[kind];
    const { perKm, nearestM, clearM, beyondM, slotM, shortLanes } = RULES[kind];
    const bubbleM = reachM * this.cost.reach + beyondM;
    const fresh = this.fresh.has(kind);
    const near = [...this.traffic.all()];
    const taken = new Set(near.map((vehicle) => slotOf(vehicle.id)));
    let lanes = 0;
    for (const ref of this.net.lanesNear(focus.x, focus.z, bubbleM)) {
      lanes++;
      const tile = this.net.tile(ref.tile);
      if (!tile) continue;
      const lane = tile.lanes[ref.lane];
      const perKmNow = perKm(lane, this.clock);
      if (perKmNow === 0) continue;
      const place: OnLane = { tile: ref.tile, index: ref.lane, connector: false, along: 0 };
      const length = this.traffic.around.length(place);
      const slots = shortLanes ? Math.max(1, Math.round(length / slotM)) : Math.floor(length / slotM);
      const spacing = shortLanes ? length / slots : slotM;
      const share = Math.min(1, (perKmNow * density * this.cost.density * spacing) / 1000);
      for (let slot = 0; slot < slots; slot++) {
        const id = `${kind}:${ref.tile}:${ref.lane}:${slot}`;
        const seed = seedOf(id);
        if (seedShare(seed) >= share || taken.has(id)) continue;
        const at = pointAlong(tile.points, lane, (slot + 0.5) * spacing);
        const away = Math.hypot(at.x - focus.x, at.z - focus.z);
        if (away > bubbleM || (!fresh && away < nearestM)) continue;
        // Another player's: nearer them, or in their sight, which is judged by their reach alone.
        if (others.some((other) => Math.hypot(at.x - other.x, at.z - other.z) < Math.max(reachM, away + KEEP_MARGIN_M))) continue;
        if (near.some((other) => meet(other.kind, kind) && Math.hypot(other.pose.x - at.x, other.pose.z - at.z) < clearM)) continue;
        const half = kind === "car" ? this.traffic.halfOf(seed) : null;
        if (!fresh && this.seen({ kind, pose: { ...at, yaw: 0 }, half: half ?? [0.5, 1] })) continue;
        near.push(this.traffic.enter({ ...place, along: (slot + 0.5) * spacing }, { kind, seed, id: this.nameOf(id) }));
        taken.add(id);
        this.made.spawned++;
      }
    }
    if (lanes > 0) this.fresh.delete(kind);
  }
}
