import { lineAt, linesOf } from "../challenge/run";
import type { Challenge } from "../challenge/types";
import type { WorldManifest } from "../render/tile";
import type { SpeedPlan } from "../sim/autopilot";
import { limitsOn, type CarLimits } from "../sim/car-limits";
import type { CarId } from "../sim/cars";
import type { RoadLine } from "../sim/road-net";
import type { Condition, Surface, Tyre } from "../sim/surfaces";
import { WORLD } from "../sim/tuning";
import type { LaidPoint, LaidRoad } from "./laid-road";

/*
 * A route read once for every driver that follows it: the laid road under each
 * stretch (its middle, its edges and its surface, from `LaidRoad`), and a speed
 * plan for a car on it in a condition, from the car's measured limits on the
 * ground under each stretch (`sim/limits/`), at a share of that grip. The par
 * driver, the vetting tool and the racers all plan on it.
 */

/** How finely the route is read. */
export const ROUTE_STEP_M = 4;
/** The ground is loaded this far round a car, and the tiles under it must have their detail. */
const GROUND_REACH_M = 400;
/** A line belongs to a stretch of the driver's way running within this of its heading, not one crossing it or back along it. */
const SAME_WAY_COSINE = 0.5;
/** A pass this near a line is the way's own past it; once the way is this much further off again, it has gone on. */
const NEAR_LINE_M = 20;
const PASSED_LINE_M = 50;

export interface RouteSample {
  x: number;
  z: number;
  heading: number;
  /** The road laid under this stretch, or null where none is within reach (a gap at a junction's apron, a route off the laid roads). */
  laid: LaidPoint | null;
}

/** A stretch of the route driven at a share of the grip: on a circuit, the same stretch every lap, counted along the first. */
export interface Eased {
  from: number;
  to: number;
  share: number;
}

export const inSpot = ({ from, to }: Eased, along: number, lapM?: number) => {
  if (lapM === undefined) return along >= from && along <= to;
  const onLap = ((along % lapM) + lapM) % lapM;
  return [onLap - lapM, onLap, onLap + lapM].some((each) => each >= from && each <= to);
};

/**
 * Where the GPS's line strays further from the laid road than a sample can see, the road is followed on from the last
 * sample that found it, by the GPS line's own step, and looked for within this of where that puts it: only while the
 * line runs on much as it did there, since at a junction's apron the road turns and the gap is bridged instead.
 */
const FOLLOW_ON_WITHIN_M = 8;
const FOLLOW_ON_TURN_COSINE = Math.cos((20 * Math.PI) / 180);

export class RoutePlan {
  readonly samples: RouteSample[] = [];

  constructor(
    readonly line: RoadLine,
    laid: LaidRoad,
  ) {
    // The last sample that found the laid road under the GPS line itself: what a stray is followed on from.
    let anchor: RouteSample | null = null;
    for (let along = 0; along <= line.length + ROUTE_STEP_M; along += ROUTE_STEP_M) {
      const { x, z, heading } = line.at(Math.min(along, line.length));
      let under = laid.nearest(x, z, heading);
      if (under) anchor = { x, z, heading, laid: under };
      // OpenStreetMap's line and the road as laid can part by a road's width and more: the laid road is followed on from where it was last seen under the line.
      else if (anchor?.laid && Math.cos(heading - anchor.laid.heading) >= FOLLOW_ON_TURN_COSINE) under = laid.nearest(anchor.laid.x + (x - anchor.x), anchor.laid.z + (z - anchor.z), heading, FOLLOW_ON_WITHIN_M);
      this.samples.push({ x, z, heading, laid: under });
    }
  }

  at(along: number): RouteSample {
    return this.samples[Math.max(0, Math.min(this.samples.length - 1, Math.round(along / ROUTE_STEP_M)))];
  }

  /** How far a place stands right of the laid middle at a distance along the route, or null where no road is laid there. */
  offsetAt(along: number, x: number, z: number): number | null {
    const { laid } = this.at(along);
    if (!laid) return null;
    return (x - laid.x) * Math.cos(laid.heading) - (z - laid.z) * Math.sin(laid.heading);
  }

  /** Whether the road under a stretch is sealed; a stretch with no laid road takes the nearest one before it. */
  pavedAt(along: number): boolean {
    const at = Math.max(0, Math.min(this.samples.length - 1, Math.round(along / ROUTE_STEP_M)));
    for (let index = at; index >= 0; index--) {
      const { laid } = this.samples[index];
      if (laid) return laid.paved;
    }
    for (let index = at + 1; index < this.samples.length; index++) {
      const { laid } = this.samples[index];
      if (laid) return laid.paved;
    }
    return true;
  }
}

/** The least grip anywhere in a car's bands on a ground: what a plan can count on at any speed. */
const least = (bands: readonly { g: number }[]) => Math.min(...bands.map(({ g }) => g)) * WORLD.gravity;

const gripOf = (limits: CarLimits) => ({ cornerMS2: least(limits.corner), brakeMS2: least(limits.braking) });

/**
 * The grip a car can count on along a route in a condition, on the tyres it wears: the road's own surface under each
 * stretch, asphalt or gravel as laid, and the limits table's least grip there, cornering and braking, at a share of
 * it, eased further round spots named.
 */
export function speedPlanFor(car: CarId, condition: Condition, tyres: Tyre, route: RoutePlan, share = 1, eased: readonly Eased[] = [], lapM?: number): SpeedPlan {
  const grip: Record<"asphalt" | "gravel", ReturnType<typeof gripOf>> = { asphalt: gripOf(limitsOn(car, condition, "asphalt", tyres)), gravel: gripOf(limitsOn(car, condition, "gravel", tyres)) };
  const shareAt = (along: number) => share * (eased.find((spot) => inSpot(spot, along, lapM))?.share ?? 1);
  const leastShare = share * Math.min(1, ...eased.map((spot) => spot.share));
  return {
    gripAt: (along) => {
      const { cornerMS2, brakeMS2 } = grip[route.pavedAt(along) ? "asphalt" : "gravel"];
      const at = shareAt(along);
      return { cornerMS2: cornerMS2 * at, brakeMS2: brakeMS2 * at };
    },
    leastBrakeMS2: Math.min(grip.asphalt.brakeMS2, grip.gravel.brakeMS2) * leastShare,
  };
}

/** The surface a route is mostly laid in, for naming the ground a run was on. */
export const mostlySurface = (route: RoutePlan): Surface => (route.samples.filter((sample) => sample.laid?.paved === false).length * 2 > route.samples.length ? "gravel" : "asphalt");

/** The tiles a line runs near, which a drive along it needs the detail of. */
export function tilesNear(manifest: WorldManifest, line: RoadLine): Set<string> {
  const names = new Set<string>();
  for (let along = 0; along <= line.length; along += GROUND_REACH_M / 2) {
    const { x, z } = line.at(along);
    for (const { name, west, north } of manifest.tiles) {
      if (x >= west - GROUND_REACH_M && x < west + manifest.tileM + GROUND_REACH_M && -z <= north + GROUND_REACH_M && -z > north - manifest.tileM - GROUND_REACH_M) names.add(name);
    }
  }
  return names;
}

/**
 * Where along the driver's way each line lies, in the order they're crossed: each the nearest place on from the last
 * running its way, on the first pass by it where a circuit passes it lap after lap.
 */
export function alongsOf(challenge: Challenge, line: RoadLine, from: number): number[] {
  const alongs: number[] = [];
  let after = from;
  for (let index = 0; index < linesOf(challenge); index++) {
    const { x, z, heading } = lineAt(challenge, index);
    let best = { distance: Infinity, along: after };
    for (let along = after; along <= line.length; along += 2) {
      const point = line.at(along);
      const distance = Math.hypot(point.x - x, point.z - z);
      if (distance < best.distance && Math.cos(point.heading - heading) > SAME_WAY_COSINE) best = { distance, along };
      // The first pass by it, not a later lap's, which can lie a hair nearer.
      else if (best.distance < NEAR_LINE_M && distance > best.distance + PASSED_LINE_M) break;
    }
    alongs.push(best.along);
    after = best.along + 1;
  }
  return alongs;
}
