import type { CarId } from "../sim/cars";
import type { ChallengeConditions } from "./conditions";

/*
 * What a bucket list challenge is (`ideas/bucket-list.md`): one car, one place on
 * the real roads, and one target, passed or failed, solo or co-op for two. There
 * are two kinds: a Route against a clock, through gates in order, and a Speed
 * trap, the speed as the car crosses a camera's line. A race (`ideas/races.md`)
 * is a third kind on the same machinery: the same handed car, its lines crossed
 * lap after lap, and a place rather than a pass against a target, which earns
 * a medal. Places are in the scene:
 * east is +x and north is -z, and a heading is radians anticlockwise from north,
 * as the road lines' are.
 */

export type ChallengeKind = "route" | "speed-trap" | "race";

/** Laps of a loop, or point to point. */
export type RaceShape = "circuit" | "sprint";

/** What's under the wheels: asphalt only, asphalt and gravel mixed, or gravel and loose ground. */
export type RaceGround = "road" | "cross-country" | "off-road";

export interface ScenePoint {
  x: number;
  z: number;
}

/** A line across the road: through a point, square to the way the road runs there, reaching `halfWidthM` either side. It counts only when crossed going the road's way. */
export interface Gate extends ScenePoint {
  heading: number;
  halfWidthM: number;
}

/** Where a car stands still at the start, facing along the route. */
export interface StartPlace extends ScenePoint {
  heading: number;
}

interface ChallengeCommon {
  id: string;
  title: string;
  car: CarId;
  /** The real road or place, and anything about it that isn't as the list first had it. */
  where: string;
  /** The places the GPS routes through, start first and finish last (`challengeLine`). */
  waypoints: readonly ScenePoint[];
  /** Side by side, each in its own lane: the first player's on the right, as traffic keeps, and a solo run's. */
  starts: readonly [StartPlace, StartPlace];
  /** Along the route from the start to the finish or the camera. */
  lengthM: number;
}

/** A bucket list challenge's own date, hour and weather (`conditions.ts`); a race takes the world's. */
interface HeldConditions {
  conditions: ChallengeConditions;
}

export interface RouteChallenge extends ChallengeCommon, HeldConditions {
  kind: "route";
  /** In the order they must be passed. The last is the finish. */
  gates: readonly Gate[];
  /** The AI racer's best clean time in this car, solo, in the challenge's conditions (`tools/challenge-par.ts`). */
  parS: number;
  targetS: number;
}

export interface SpeedTrapChallenge extends ChallengeCommon, HeldConditions {
  kind: "speed-trap";
  camera: Gate;
  /** The AI racer's best speed at the camera in this car, solo, in the challenge's conditions. */
  parKmh: number;
  targetKmh: number;
}

export interface RaceChallenge extends ChallengeCommon {
  kind: "race";
  /** The list's number, as R1, X1 or O1. */
  number: string;
  shape: RaceShape;
  ground: RaceGround;
  laps: number;
  /** One lap's lines in the order they're passed, the last its finish: on a circuit, the start line. */
  gates: readonly Gate[];
  /** The places on the grid, pole first: two abreast on a road that takes two, single file on a lane. `starts` are its first two. */
  grid: readonly StartPlace[];
  /** How far a lap is, from the start line round to it again; a sprint's is the whole way. */
  lapM: number;
  /** Along the route from its first waypoint to the start line, where each lap of a circuit begins and ends. */
  lineM: number;
}

/** A bucket list challenge, which has a target to pass. */
export type BucketChallenge = RouteChallenge | SpeedTrapChallenge;

export type Challenge = BucketChallenge | RaceChallenge;
