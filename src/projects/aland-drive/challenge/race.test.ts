import { describe, expect, it } from "vitest";
import { advanceRun, COUNTDOWN_S, gatesPassed, lapOf, placeNow, reportResult, startRun, type CarSample, type ChallengeRun } from "./run";
import { finishingOrder, medalFor, pointsFor, rivalTimes } from "./standings";
import type { Gate, RaceChallenge } from "./types";

/*
 * A circuit laid on a straight road east along z = 0, its lap's lines at 100, 200 and 300 m, the last the start line.
 * A car put back at the start (placed, so it crosses nothing on the way) drives the next lap. The scripted driver's
 * pace is 10 s a line, so the rivals finish two laps at 1.03, 1.07, 1.11, 1.15 and 1.19 times 60 s.
 */

const EAST = -Math.PI / 2;
const gate = (x: number): Gate => ({ x, z: 0, heading: EAST, halfWidthM: 10 });
const start = { x: 0, z: 0, heading: EAST };
const RACE: RaceChallenge = {
  id: "race",
  kind: "race",
  number: "R0",
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
  splitsS: [10, 20, 30, 40, 50, 60],
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

  it("place the player against the rivals at each line, by when each crossed it", () => {
    // 11 s to the first line: behind the rivals' 10.3 and 10.7 s, ahead of their 11.1, 11.5 and 11.9 s.
    let run = advanceRun(raced(), 11, [at(100.001)]).run;
    expect(placeNow(run, 0)).toEqual({ place: 3, of: 6 });
    run = advanceRun(startRun(RACE, 1), COUNTDOWN_S, [at(0)]).run;
    expect(placeNow(run, 0)).toBeNull();
  });
});

describe("a race's places and medals", () => {
  const [gold, silver, bronze] = rivalTimes(RACE);

  it("are first, second and third against the rivals, a tie going to the player", () => {
    expect(medalFor(RACE, [gold])).toBe("gold");
    expect(medalFor(RACE, [gold + 0.01])).toBe("silver");
    expect(medalFor(RACE, [bronze])).toBe("bronze");
    expect(medalFor(RACE, [bronze + 0.01])).toBeNull();
    expect(finishingOrder(RACE, [silver])[1]).toEqual({ seat: 0, time: silver });
  });

  it("make a solo run's outcome passed only with a medal", () => {
    const finish = (time: number) => reportResult(startRun(RACE, 1), 1, 0, time).run.outcome?.passed;
    expect(finish(bronze)).toBe(true);
    expect(finish(bronze + 1)).toBe(false);
  });

  it("score a co-op team as Forza does: 100 a rival beaten, 50 for winning, the medal from the points per player", () => {
    expect(pointsFor(RACE, gold)).toBe(550);
    expect(pointsFor(RACE, silver)).toBe(400);
    // A win and a fourth: 550 and 200, 375 each, which is all but two rivals beaten on average.
    expect(medalFor(RACE, [gold, bronze + 0.01])).toBe("bronze");
    // A win carries a second: 550 and 400, 475 each.
    expect(medalFor(RACE, [gold, silver])).toBe("silver");
    expect(medalFor(RACE, [gold, gold])).toBe("gold");
  });

  it("wait in co-op for both players' finishes, each from their own client", () => {
    let run = startRun(RACE, 2);
    run = reportResult(run, 1, 1, gold).run;
    expect(run.outcome).toBeNull();
    run = reportResult(run, 1, 0, silver).run;
    expect(run.outcome).toMatchObject({ passed: true, average: (gold + silver) / 2 });
  });
});
