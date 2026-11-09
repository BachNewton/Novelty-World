import type { Page } from "@playwright/test";
import type { ChallengeConditions } from "../src/projects/aland-drive/challenge/conditions";
import type { RaceChallenge, RouteChallenge } from "../src/projects/aland-drive/challenge/types";
import { expect } from "./test";

/*
 * A challenge of the test's own on the fixture's one tile, for the challenge
 * specs. The list's challenges are elsewhere on the island, so a test lays a
 * Route on the fixture's main road, through the game's own GPS between two
 * places on that road, and hands it to each page through the probe, which puts
 * it on the maps and in the world beside the list's.
 */

export const STEPS_A_SECOND = 120;
export const COUNTDOWN_STEPS = 3 * STEPS_A_SECOND;
const NOON: ChallengeConditions = { date: { year: 2026, month: 7, day: 1 }, hour: 12, weather: "clear" };

/** A place a distance along a line of (x, y, z) points, and the way the line runs there, anticlockwise from north. */
export function along(points: readonly number[], metres: number) {
  let left = metres;
  const count = points.length / 3;
  for (let at = 0; at + 1 < count; at++) {
    const [ax, az, bx, bz] = [points[at * 3], points[at * 3 + 2], points[at * 3 + 3], points[at * 3 + 5]];
    const length = Math.hypot(bx - ax, bz - az);
    if (left <= length || at + 2 === count) {
      const share = Math.min(left / length, 1);
      return { x: ax + share * (bx - ax), z: az + share * (bz - az), heading: Math.atan2(-(bx - ax), -(bz - az)) };
    }
    left -= length;
  }
  throw new Error("a line of one point");
}

function lengthOf(points: readonly number[]) {
  let length = 0;
  for (let at = 3; at < points.length; at += 3) length += Math.hypot(points[at] - points[at - 3], points[at + 2] - points[at - 1]);
  return length;
}

/**
 * A Route on the fixture's main road: the GPS's way between two places on it,
 * its start places side by side a lane apart just past the first, and a row of
 * two more ahead of them for co-op's third and fourth, as the list's measured
 * starts stand, two gates and a finish short of the end. The target is `targetS`, or the length
 * over `targetMS` (a speed), and the line itself comes back too. It is played
 * on a clear summer noon unless given conditions of its own.
 */
export async function layChallenge(page: Page, { id, title, target, conditions = NOON }: { id: string; title: string; target: { s: number } | { ms: number }; conditions?: ChallengeConditions }): Promise<{ challenge: RouteChallenge; line: number[] }> {
  await page.waitForFunction(() => window.__alandDrive?.mapReady() === true, null, { timeout: 60_000 });
  const { waypoints, line } = await page.evaluate(() => {
    const probe = window.__alandDrive;
    if (!probe) throw new Error("no probe");
    const ends = [300, 800].map((metres) => {
      probe.placeOnRoad(0, metres);
      const [x, , z] = probe.car().position;
      return { x, z };
    });
    return { waypoints: ends, line: probe.routeThrough(ends.map(({ x, z }): [number, number] => [x, z])) };
  });
  const length = lengthOf(line);
  expect(length).toBeGreaterThan(300);
  const side = (by: number, metres = 15) => {
    const row = along(line, metres);
    return { x: row.x + by * Math.cos(row.heading), z: row.z - by * Math.sin(row.heading), heading: row.heading };
  };
  const gate = (metres: number) => ({ ...along(line, metres), halfWidthM: 12 });
  const finishM = length - 40;
  const lengthM = finishM - 15;
  const targetS = "s" in target ? target.s : lengthM / target.ms;
  return {
    challenge: {
      id,
      title,
      kind: "route",
      car: "sten",
      where: "the fixture's main road",
      waypoints,
      starts: [side(1.5), side(-1.5), side(1.5, 25), side(-1.5, 25)],
      lengthM,
      gates: [gate(finishM / 3), gate((2 * finishM) / 3), gate(finishM)],
      parS: targetS,
      targetS,
      conditions,
    },
    line,
  };
}

/** A sprint race on the same road as `layChallenge`'s Route: its start places the front row of a grid of four, its gates its lines. */
export async function layRace(page: Page, { id, title }: { id: string; title: string }): Promise<{ race: RaceChallenge; line: number[] }> {
  const { challenge, line } = await layChallenge(page, { id, title, target: { s: 600 } });
  const [front, beside] = challenge.starts;
  const back = (place: typeof front) => ({ ...place, x: place.x + 10 * Math.sin(place.heading), z: place.z + 10 * Math.cos(place.heading) });
  const { car, where, waypoints, lengthM, gates } = challenge;
  const starts = [front, beside];
  return {
    race: {
      id,
      title,
      car,
      where,
      waypoints,
      starts,
      lengthM,
      gates,
      kind: "race",
      tier: "A6",
      number: "T1",
      shape: "sprint",
      ground: "road",
      laps: 1,
      grid: [front, beside, back(front), back(beside)],
      reserve: [],
      lapM: challenge.lengthM,
      lineM: 0,
    },
    line,
  };
}

export const challengeOf = (page: Page) => page.evaluate(() => window.__alandDrive?.challenge() ?? null);
export const carAt = (page: Page) => page.evaluate(() => window.__alandDrive?.car().position ?? []);
export async function offStart(page: Page, place: { x: number; z: number }) {
  const [x, , z] = await carAt(page);
  return Math.hypot(x - place.x, z - place.z);
}
