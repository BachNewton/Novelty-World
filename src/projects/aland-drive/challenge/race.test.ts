import { describe, expect, it } from "vitest";
import { advanceRun, COUNTDOWN_S, gatesPassed, lapOf, reportResult, startRun, type CarSample, type ChallengeRun } from "./run";
import type { Gate, RaceChallenge } from "./types";

/*
 * A circuit laid on a straight road east along z = 0, its lap's lines at 100, 200 and 300 m, the last the start line.
 * A car put back at the start (placed, so it crosses nothing on the way) drives the next lap.
 */

const EAST = -Math.PI / 2;
const gate = (x: number): Gate => ({ x, z: 0, heading: EAST, halfWidthM: 10 });
const start = { x: 0, z: 0, heading: EAST };
const RACE: RaceChallenge = {
  id: "race",
  kind: "race",
  tier: "A5", number: "A5.0",
  title: "",
  car: "skerry-gt",
  where: "",
  waypoints: [],
  shape: "circuit",
  ground: "road",
  laps: 2,
  gates: [gate(100), gate(200), gate(300)],
  grid: Array.from({ length: 6 }, () => start),
  starts: [start, start],
  lapM: 300,
  lineM: 300,
  lengthM: 600,
};

const at = (x: number, placed = false): CarSample => ({ x, z: 0, speedMS: 20, placed });

/** Steps of a second through the places in turn, one car. */
function drive(run: ChallengeRun, places: CarSample[]): ChallengeRun {
  return places.reduce((each, place) => advanceRun(each, 1, [place]).run, run);
}

const raced = () => advanceRun(startRun(RACE, 1), COUNTDOWN_S, [at(0)]).run;

describe("a race's laps", () => {
  it("cross each lap's lines in turn and finish on the last lap's start line, not the first", () => {
    let run = drive(raced(), [at(110), at(210), at(310)]);
    expect(lapOf(run, 0)).toEqual({ lap: 2, of: 2 });
    expect(gatesPassed(run, 0)).toEqual({ passed: 0, of: 3 });
    expect(run.outcome).toBeNull();
    run = drive(run, [at(0, true), at(110), at(210)]);
    expect(gatesPassed(run, 0)).toEqual({ passed: 2, of: 3 });
    run = drive(run, [at(310)]);
    expect(run.outcome?.results).toHaveLength(1);
    expect(lapOf(run, 0)).toEqual({ lap: 2, of: 2 });
  });

  it("don't count a short cut back to the line: the next lap's lines are still to cross first", () => {
    let run = drive(raced(), [at(110), at(210), at(310)]);
    // Put back behind the start line and straight over it: the second lap's first line hasn't been crossed.
    run = drive(run, [at(250, true), at(310)]);
    expect(run.outcome).toBeNull();
    expect(gatesPassed(run, 0)).toEqual({ passed: 0, of: 3 });
  });

  it("can't be lost against the clock: a race ends only once everyone has finished", () => {
    let run = drive(raced(), [at(50)]);
    run = advanceRun(run, 3600, [at(50)]).run;
    expect(run.outcome).toBeNull();
  });

  it("is finished by everyone who finishes, solo at once and in co-op once both have, from each one's own client", () => {
    expect(reportResult(startRun(RACE, 1), 1, 0, 90).run.outcome).toMatchObject({ passed: true, results: [90] });
    let run = reportResult(startRun(RACE, 2), 1, 1, 80).run;
    expect(run.outcome).toBeNull();
    run = reportResult(run, 1, 0, 95).run;
    expect(run.outcome).toMatchObject({ passed: true, results: [95, 80] });
  });
});
