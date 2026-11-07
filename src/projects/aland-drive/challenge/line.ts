import type { RoadGraph, Route } from "../map/road-graph";
import { RoadLine } from "../sim/road-net";
import type { RaceChallenge, ScenePoint } from "./types";

/*
 * A challenge's route as one line: the GPS's own routes from each waypoint to
 * the next, each leg starting the way the last one ended, as a drive picking
 * those destinations in turn would be sent. The gates, the start places, the
 * scripted driver's par and the GPS route shown during a run all come from
 * this one line.
 */

/** The GPS takes the way a car faces as a bearing, clockwise from north, where a road line's heading runs anticlockwise. */
const bearingOf = (dx: number, dz: number) => Math.atan2(dx, -dz);
const SAME_POINT_M = 0.05;

/** The route as the GPS shows it: the line and its end. */
export function challengeRoute(graph: RoadGraph, waypoints: readonly ScenePoint[]): Route {
  if (waypoints.length < 2) throw new Error("a challenge's route needs a start and a finish");
  const points: number[] = [];
  let bearing = bearingOf(waypoints[1].x - waypoints[0].x, waypoints[1].z - waypoints[0].z);
  let end = waypoints[waypoints.length - 1];
  for (let leg = 0; leg + 1 < waypoints.length; leg++) {
    const [from, to] = [waypoints[leg], waypoints[leg + 1]];
    const route = graph.route(from.x, from.z, bearing, to.x, to.z);
    if (!route) throw new Error(`no route from ${from.x}, ${from.z} to ${to.x}, ${to.z}`);
    const { line } = route;
    for (let at = 0; at < line.points.length / 3; at++) {
      const [x, z] = [line.points[at * 3], line.points[at * 3 + 2]];
      const count = points.length;
      if (count > 0 && Math.hypot(points[count - 3] - x, points[count - 1] - z) < SAME_POINT_M) continue;
      points.push(x, 0, z);
    }
    bearing = -line.at(line.length).heading;
    end = route.end;
  }
  const line = new RoadLine(Float32Array.from(points));
  const fold = line.foldsAt();
  if (fold) throw new Error(`the route turns back on itself at ${fold.x.toFixed(0)}, ${fold.z.toFixed(0)}: move a waypoint`);
  return { line, end };
}

export function challengeLine(graph: RoadGraph, waypoints: readonly ScenePoint[]): RoadLine {
  return challengeRoute(graph, waypoints).line;
}

/** A line and a straight run on past its end, so a driver following it doesn't turn for its last point as it gets there. */
export function runOn(line: RoadLine, metres: number): RoadLine {
  const end = line.at(line.length);
  return new RoadLine(Float32Array.from([...line.points, end.x - Math.sin(end.heading) * metres, 0, end.z - Math.cos(end.heading) * metres]));
}

/** The line cut short at a distance along it, its last point where the cut falls. */
export function cutAt(line: RoadLine, metres: number): RoadLine {
  const points: number[] = [];
  for (let at = 0; at < line.lengths.length && line.lengths[at] < metres; at++) points.push(line.points[at * 3], line.points[at * 3 + 1], line.points[at * 3 + 2]);
  const end = line.at(metres);
  points.push(end.x, end.y, end.z);
  return new RoadLine(Float32Array.from(points));
}

/**
 * A race's whole route as the GPS shows it, from its first waypoint to the
 * finish: a sprint's route, or a circuit's lap round and round from the first
 * waypoint to the start line on its last lap, so the route ends at the finish.
 */
export function raceRoute(graph: RoadGraph, race: RaceChallenge): Route {
  const lap = challengeRoute(graph, race.waypoints);
  if (race.shape === "sprint") return lap;
  const points: number[] = [];
  for (let round = 0; round <= race.laps; round++) points.push(...(round === 0 ? lap.line.points : lap.line.points.slice(3)));
  const line = cutAt(new RoadLine(Float32Array.from(points)), race.lineM + race.laps * race.lapM);
  const end = line.at(line.length);
  return { line, end: { x: end.x, z: end.z } };
}
