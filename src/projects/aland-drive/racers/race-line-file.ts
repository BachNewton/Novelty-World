import type { RaceSpec } from "../challenge/race-specs";
import { RoadLine } from "../sim/road-net";
import type { LineGeometry } from "./racing-line";
import { ROUTE_STEP_M } from "./route-plan";

/*
 * A race's racing line as a file the game fetches (`public/aland-drive/race-lines/<id>.json`, written by
 * `tools/race-lines.ts`): the line's points every few metres with the road's height, whether the road under each
 * is sealed, which the speed plan reads, and the room to each side, which racecraft reads: where the laid middle
 * stands right of the line and how far the carriageway reaches from it. The line needs the whole route's laid road
 * to draw, and the game only ever has the tiles round the car, so it is drawn once from the built tiles and shipped;
 * every page and the vetting tool then drive the very same line. Each file says what it was drawn from, so a test can tell when a change to the list
 * or the tiles needs it drawn again.
 */

export const RACE_LINES_FOLDER = "aland-drive/race-lines";

export interface RaceLineFile {
  madeFrom: {
    /** The tiles' version, whose roads the line lies on. */
    tiles: string;
    car: string;
    waypoints: readonly { x: number; z: number }[];
    laps: number;
  };
  stepM: number;
  /** Scene x, y and z of each point, end to end, to the centimetre. */
  points: number[];
  /** A character per point: 1 on a sealed road, 0 on a loose one. */
  paved: string;
  /** Per point, to the decimetre: the laid middle right of the line, and the carriageway's reach left and right of that middle. */
  middle: number[];
  left: number[];
  right: number[];
}

/** A race's line as the game and the tools drive it. */
export interface RaceLine {
  line: RoadLine;
  pavedAt: (alongM: number) => boolean;
  geometry: LineGeometry;
}

/** The address a page fetches a race's line from. */
export const raceLineUrl = (origin: string, id: string) => `${origin}/${RACE_LINES_FOLDER}/${id}.json`;

export function raceLineFile(spec: RaceSpec, laps: number, tiles: string, { line, pavedAt, geometry }: RaceLine): RaceLineFile {
  const points: number[] = [];
  let paved = "";
  const middle: number[] = [];
  const left: number[] = [];
  const right: number[] = [];
  const tenth = (value: number) => Math.round(value * 10) / 10;
  for (let along = 0, at = 0; along <= line.length + ROUTE_STEP_M / 2; along += ROUTE_STEP_M, at++) {
    const { x, y, z } = line.at(Math.min(along, line.length));
    points.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(z * 100) / 100);
    paved += pavedAt(along) ? "1" : "0";
    const sample = Math.min(geometry.middleM.length - 1, at);
    middle.push(tenth(geometry.middleM[sample]));
    left.push(tenth(geometry.leftM[sample]));
    right.push(tenth(geometry.rightM[sample]));
  }
  return { madeFrom: { tiles, car: spec.car, waypoints: spec.waypoints, laps }, stepM: ROUTE_STEP_M, points, paved, middle, left, right };
}

/** The line, its surface and its room, read back from a file. */
export function readRaceLine(file: RaceLineFile): RaceLine {
  const count = file.points.length / 3;
  if (count < 2 || file.points.length % 3 !== 0 || file.paved.length !== count || file.middle.length !== count || file.left.length !== count || file.right.length !== count) throw new Error("not a race line file");
  const line = new RoadLine(Float32Array.from(file.points));
  const { paved, stepM } = file;
  return {
    line,
    pavedAt: (alongM) => paved[Math.max(0, Math.min(paved.length - 1, Math.round(alongM / stepM)))] === "1",
    geometry: { stepM, middleM: Float64Array.from(file.middle), leftM: Float64Array.from(file.left), rightM: Float64Array.from(file.right) },
  };
}
