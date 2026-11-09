import type { RaceSpec } from "../challenge/race-specs";
import { RoadLine } from "../sim/road-net";
import { ROUTE_STEP_M } from "./route-plan";

/*
 * A race's racing line as a file the game fetches (`public/aland-drive/race-lines/<id>.json`, written by
 * `tools/race-lines.ts`): the line's points every few metres with the road's height, and whether the road under each
 * is sealed, which the speed plan reads. The line needs the whole route's laid road to draw, and the game only ever
 * has the tiles round the car, so it is drawn once from the built tiles and shipped; every page and the vetting tool
 * then drive the very same line. Each file says what it was drawn from, so a test can tell when a change to the list
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
}

/** The address a page fetches a race's line from. */
export const raceLineUrl = (origin: string, id: string) => `${origin}/${RACE_LINES_FOLDER}/${id}.json`;

export function raceLineFile(spec: RaceSpec, laps: number, tiles: string, line: RoadLine, pavedAt: (alongM: number) => boolean): RaceLineFile {
  const points: number[] = [];
  let paved = "";
  for (let along = 0; along <= line.length + ROUTE_STEP_M / 2; along += ROUTE_STEP_M) {
    const { x, y, z } = line.at(Math.min(along, line.length));
    points.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(z * 100) / 100);
    paved += pavedAt(along) ? "1" : "0";
  }
  return { madeFrom: { tiles, car: spec.car, waypoints: spec.waypoints, laps }, stepM: ROUTE_STEP_M, points, paved };
}

/** The line and its surface, read back from a file. */
export function readRaceLine(file: RaceLineFile): { line: RoadLine; pavedAt: (alongM: number) => boolean } {
  if (file.points.length < 6 || file.points.length % 3 !== 0 || file.paved.length !== file.points.length / 3) throw new Error("not a race line file");
  const line = new RoadLine(Float32Array.from(file.points));
  const { paved, stepM } = file;
  return { line, pavedAt: (alongM) => paved[Math.max(0, Math.min(paved.length - 1, Math.round(alongM / stepM)))] === "1" };
}
