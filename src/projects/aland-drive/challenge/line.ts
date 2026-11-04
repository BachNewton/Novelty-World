import type { RoadGraph } from "../map/road-graph";
import { RoadLine } from "../sim/road-net";
import type { ScenePoint } from "./types";

/*
 * A challenge's route as one line: the GPS's own routes from each waypoint to
 * the next, each leg starting the way the last one ended, as a drive picking
 * those destinations in turn would be sent. The gates, the start places and
 * the scripted driver's par all come from this one line.
 */

/** The GPS takes the way a car faces as a bearing, clockwise from north, where a road line's heading runs anticlockwise. */
const bearingOf = (dx: number, dz: number) => Math.atan2(dx, -dz);
const SAME_POINT_M = 0.05;

export function challengeLine(graph: RoadGraph, waypoints: readonly ScenePoint[]): RoadLine {
  if (waypoints.length < 2) throw new Error("a challenge's route needs a start and a finish");
  const points: number[] = [];
  let bearing = bearingOf(waypoints[1].x - waypoints[0].x, waypoints[1].z - waypoints[0].z);
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
  }
  const line = new RoadLine(Float32Array.from(points));
  const fold = line.foldsAt();
  if (fold) throw new Error(`the route turns back on itself at ${fold.x.toFixed(0)}, ${fold.z.toFixed(0)}: move a waypoint`);
  return line;
}
