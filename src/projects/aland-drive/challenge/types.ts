import type { CarId } from "../sim/cars";

/*
 * What a bucket list challenge is (`ideas/bucket-list.md`): one car, one place on
 * the real roads, and one target, passed or failed, solo or co-op for two. There
 * are two kinds: a Route against a clock, through gates in order, and a Speed
 * trap, the speed as the car crosses a camera's line. Places are in the scene:
 * east is +x and north is -z, and a heading is radians anticlockwise from north,
 * as the road lines' are.
 */

export type ChallengeKind = "route" | "speed-trap";

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

export interface RouteChallenge extends ChallengeCommon {
  kind: "route";
  /** In the order they must be passed. The last is the finish. */
  gates: readonly Gate[];
  /** The scripted driver's time in this car, solo (`tools/challenge-par.ts`). */
  parS: number;
  targetS: number;
}

export interface SpeedTrapChallenge extends ChallengeCommon {
  kind: "speed-trap";
  camera: Gate;
  /** The speed the scripted driver reaches at the camera flat out in this car, solo. */
  parKmh: number;
  targetKmh: number;
}

export type Challenge = RouteChallenge | SpeedTrapChallenge;
