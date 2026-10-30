// Writes the scripted drives into the tiles' folder, as lines of scene points the driver follows with no road data of
// its own: routes.json there, served locally beside the tiles and never published.
//
//   npx tsx src/projects/aland-drive/tools/make-routes.ts [--folder=<tiles>]
//
// `edge-to-edge` crosses the world from its west edge to its east by the fastest roads, `all-nine` goes through the middle
// of every tile, and `wander` does that and then goes on to random places from a fixed seed until it has covered WANDER_M.
// All three come out the same every run.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { initPhysics } from "../sim/drive";
import { readWorld } from "../sim/read-tile";
import { throughLines } from "./road-lines";

const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const WANDER_M = 90_000;
const SEED = 20260;
const CELL_M = 30;
const MEETS_WITHIN_M = 12;
const SPACING_M = 8;
const SPEED_BY_KIND: Record<string, number> = { primary: 25, secondary: 22, tertiary: 20, unclassified: 14, residential: 12 };
const QUIET_ROAD_MS = 8;
const SPUR_POINTS = 300;

await initPhysics();
const world = readWorld(FOLDER);
const lines = throughLines(world).filter(({ kind }) => kind !== "track");

/** Where one line meets another: on `line` at `along`, on to `other` at `otherAlong`. */
interface Meeting {
  along: number;
  other: number;
  otherAlong: number;
}

const cells = new Map<string, { line: number; along: number }[]>();
const cellKey = (x: number, z: number) => `${Math.floor(x / CELL_M)},${Math.floor(z / CELL_M)}`;
lines.forEach(({ line }, index) => {
  for (let along = 0; along < line.length; along += CELL_M / 2) {
    const point = line.at(along);
    const key = cellKey(point.x, point.z);
    const cell = cells.get(key);
    if (cell) cell.push({ line: index, along });
    else cells.set(key, [{ line: index, along }]);
  }
});

const meetings: Meeting[][] = lines.map(() => []);
lines.forEach(({ line }, index) => {
  for (const along of [0, line.length]) {
    const end = line.at(along);
    let best: { line: number; along: number; distance: number } | null = null;
    for (let row = -1; row <= 1; row++) {
      for (let column = -1; column <= 1; column++) {
        for (const near of cells.get(cellKey(end.x + column * CELL_M, end.z + row * CELL_M)) ?? []) {
          if (near.line === index) continue;
          const point = lines[near.line].line.at(near.along);
          const distance = Math.hypot(point.x - end.x, point.z - end.z);
          if (distance < MEETS_WITHIN_M && (!best || distance < best.distance)) best = { ...near, distance };
        }
      }
    }
    if (!best) continue;
    meetings[index].push({ along, other: best.line, otherAlong: best.along });
    meetings[best.line].push({ along: best.along, other: index, otherAlong: along });
  }
});

let state = SEED;
const random = () => {
  state = (state + 0x6d2b79f5) | 0;
  let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
};

/** The road network as places to route between: every meeting and line end, joined along each line and across each meeting. */
interface Place {
  line: number;
  along: number;
  links: { to: number; seconds: number }[];
}

const places: Place[] = [];
const placesOn: number[][] = lines.map(() => []);
const placeAt = (line: number, along: number) => {
  const known = placesOn[line].find((place) => Math.abs(places[place].along - along) < 1);
  if (known !== undefined) return known;
  places.push({ line, along, links: [] });
  placesOn[line].push(places.length - 1);
  return places.length - 1;
};
lines.forEach(({ line }, index) => {
  placeAt(index, 0);
  placeAt(index, line.length);
  for (const meeting of meetings[index]) {
    const here = placeAt(index, meeting.along);
    const there = placeAt(meeting.other, meeting.otherAlong);
    places[here].links.push({ to: there, seconds: 0 });
    places[there].links.push({ to: here, seconds: 0 });
  }
});
lines.forEach(({ kind }, index) => {
  const ordered = [...placesOn[index]].sort((a, b) => places[a].along - places[b].along);
  ordered.slice(1).forEach((place, at) => {
    const before = ordered[at];
    const seconds = (places[place].along - places[before].along) / (SPEED_BY_KIND[kind] ?? QUIET_ROAD_MS);
    places[place].links.push({ to: before, seconds });
    places[before].links.push({ to: place, seconds });
  });
});

function fastestRoute(from: number, to: number): number[] {
  const seconds = new Float64Array(places.length).fill(Infinity);
  const cameFrom = new Int32Array(places.length).fill(-1);
  const done = new Uint8Array(places.length);
  seconds[from] = 0;
  const open = [from];
  while (open.length > 0) {
    let best = 0;
    for (let at = 1; at < open.length; at++) if (seconds[open[at]] < seconds[open[best]]) best = at;
    const here = open[best];
    open[best] = open[open.length - 1];
    open.pop();
    if (done[here]) continue;
    done[here] = 1;
    if (here === to) break;
    for (const { to: next, seconds: cost } of places[here].links) {
      if (seconds[here] + cost >= seconds[next]) continue;
      seconds[next] = seconds[here] + cost;
      cameFrom[next] = here;
      open.push(next);
    }
  }
  if (!done[to]) throw new Error(`no way from ${from} to ${to}`);
  const path = [to];
  while (path[path.length - 1] !== from) path.push(cameFrom[path[path.length - 1]]);
  return path.reverse();
}

function nearestPlace(x: number, z: number): number {
  let best = 0;
  let bestDistance = Infinity;
  places.forEach(({ line, along }, index) => {
    const point = lines[line].line.at(along);
    const distance = Math.hypot(point.x - x, point.z - z);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** A line of points through waypoints, by the fastest roads between them. */
function routeThrough(waypoints: number[]): number[] {
  const points: number[] = [];
  for (let leg = 1; leg < waypoints.length; leg++) {
    if (waypoints[leg] === waypoints[leg - 1]) continue;
    const path = fastestRoute(waypoints[leg - 1], waypoints[leg]);
    for (let at = 1; at < path.length; at++) {
      const [from, to] = [places[path[at - 1]], places[path[at]]];
      if (from.line !== to.line) continue;
      const { line } = lines[from.line];
      const direction = Math.sign(to.along - from.along);
      for (let along = from.along; (to.along - along) * direction > 0; along += direction * SPACING_M) {
        const point = line.at(along);
        points.push(point.x, point.y, point.z);
      }
    }
  }
  return withoutSpurs(points);
}

/** Fastest routes turn back on themselves at a waypoint down a side road. No driver would, so each such spur is cut out. */
function withoutSpurs(points: number[]): number[] {
  const kept: number[] = [];
  for (let at = 0; at < points.length; at += 3) {
    const [x, z] = [points[at], points[at + 2]];
    for (let back = 9; back <= Math.min(SPUR_POINTS * 3, kept.length - 3); back += 3) {
      const from = kept.length - 3 - back;
      if (from >= 0 && Math.hypot(kept[from] - x, kept[from + 2] - z) < SPACING_M) {
        kept.length = from;
        break;
      }
    }
    kept.push(points[at], points[at + 1], points[at + 2]);
  }
  return kept;
}

const metres = (points: number[]) => {
  let total = 0;
  for (let at = 3; at < points.length; at += 3) total += Math.hypot(points[at] - points[at - 3], points[at + 2] - points[at - 1]);
  return total;
};

const worldTiles = [...world.all()];
const westmost = Math.min(...worldTiles.map((tile) => tile.column));
const northmost = Math.min(...worldTiles.map((tile) => tile.row));
const tileMiddle = (column: number, row: number) => nearestPlace((westmost + column + 0.5) * world.tileM, (northmost + row + 0.5) * world.tileM);

/** Through the middle of every tile, row by row, turning back at each side. */
const snake = [0, 1, 2].flatMap((row) => (row % 2 === 0 ? [0, 1, 2] : [2, 1, 0]).map((column) => tileMiddle(column, row)));

const edge = routeThrough([nearestPlace((westmost) * world.tileM, (northmost + 1.5) * world.tileM), nearestPlace((westmost + 3) * world.tileM, (northmost + 1.5) * world.tileM)]);
const allNine = routeThrough(snake);

const wanderStops = [...snake];
// Some roads connect to nothing else in these tiles, so the random stops come only from what the start can reach.
const reachable = new Set([snake[0]]);
for (const place of reachable) for (const { to } of places[place].links) reachable.add(to);
const reachableList = [...reachable];
const elsewhere = () => reachableList[Math.floor(random() * reachableList.length)];
let wander = routeThrough(wanderStops);
while (metres(wander) < WANDER_M) {
  wanderStops.push(elsewhere());
  wander = withoutSpurs(wander.concat(routeThrough(wanderStops.slice(-2))));
}

const round = (points: number[]) => points.map((value) => Number(value.toFixed(2)));
const report = (name: string, points: number[]) => {
  console.log(name, `${(metres(points) / 1000).toFixed(1)} km, from ${points[0].toFixed(0)}, ${points[2].toFixed(0)} to ${points[points.length - 3].toFixed(0)}, ${points[points.length - 1].toFixed(0)}`);
};
report("edge-to-edge", edge);
report("all-nine", allNine);
report("wander", wander);
// eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder given on the command line
writeFileSync(join(FOLDER, "routes.json"), JSON.stringify({ "edge-to-edge": round(edge), "all-nine": round(allNine), wander: round(wander) }));
