import { describe, expect, it } from "vitest";
import { advanceRun, COUNTDOWN_S, partnerNeeds, reportResult, startRun, type CarSample, type ChallengeRun } from "./run";
import type { Gate, RouteChallenge, SpeedTrapChallenge } from "./types";

/* A straight road east along z = 0, every line across it 10 m either side. East is a heading of -π/2. */

const EAST = -Math.PI / 2;
const gate = (x: number): Gate => ({ x, z: 0, heading: EAST, halfWidthM: 10 });
const start = { x: 0, z: 0, heading: EAST };
const common = { title: "", car: "skerry-gt" as const, where: "", waypoints: [], starts: [start, start] as const, lengthM: 300, conditions: { date: { year: 2026, month: 7, day: 1 }, hour: 12, weather: "clear" as const } };
const route = (targetS: number): RouteChallenge => ({ ...common, id: "route", kind: "route", gates: [gate(100), gate(200), gate(300)], parS: targetS, targetS });
const trap = (targetKmh: number): SpeedTrapChallenge => ({ ...common, id: "trap", kind: "speed-trap", camera: gate(100), parKmh: targetKmh, targetKmh });

const at = (x: number, z = 0, speedMS = 20): CarSample => ({ x, z, speedMS });

/** Past the countdown, with every car noted where it starts. */
function green(run: ChallengeRun, places: (CarSample | null)[]): ChallengeRun {
  return advanceRun(run, COUNTDOWN_S, places).run;
}

/** Steps of a second through each player's places in turn. */
function drive(run: ChallengeRun, steps: (CarSample | null)[][]): ChallengeRun {
  return steps.reduce((each, samples) => advanceRun(each, 1, samples).run, run);
}

describe("crossing a line between two steps", () => {
  it("is found however far the car went in the step, at the moment it crossed", () => {
    // 300 m in one second passes every gate, and the finish line a hair before the step's end.
    const run = drive(green(startRun(route(60), 1), [at(0)]), [[at(300.0001)]]);
    expect(run.players[0].result).toBeCloseTo(300 / 300.0001, 6);
  });

  it("counts only going the road's way, and only across the line, not past its end", () => {
    let run = green(startRun(route(60), 1), [at(150)]);
    run = drive(run, [[at(50)], [at(150, 30)], [at(150)]]);
    // Back through the first gate, then forwards past its end and back on to the road: none of it counts.
    expect(run.players[0].nextGate).toBe(0);
  });

  it("isn't crossed by a car put back on the road", () => {
    let run = green(startRun(route(60), 1), [at(0)]);
    run = advanceRun(run, 1, [{ ...at(150), placed: true }]).run;
    expect(run.players[0].nextGate).toBe(0);
  });
});

describe("a Route's gates", () => {
  it("count only in order: a gate missed is passed by going back through it", () => {
    let run = green(startRun(route(600), 1), [at(0)]);
    // Round the first gate on the verge, then on through the second and over the finish line.
    run = drive(run, [[at(90, 20)], [at(110, 20)], [at(110)], [at(250)], [at(310)]]);
    expect(run.players[0].nextGate).toBe(0);
    expect(run.outcome).toBeNull();
    // Back past the first and through it again, the right way: everything after it counts once more.
    run = drive(run, [[at(90)], [at(310)]]);
    expect(run.players[0].nextGate).toBe(3);
    expect(run.outcome?.passed).toBe(true);
  });
});

describe("a co-op Route", () => {
  it("passes on the average, a strong run carrying a weak one", () => {
    let run = green(startRun(route(100), 2), [at(0), at(0)]);
    // The first finishes in 70 s, so the second needs to be in by 130.
    run = advanceRun(run, 70, [at(300.01), at(150)]).run;
    expect(partnerNeeds(run)?.player).toBe(1);
    expect(partnerNeeds(run)?.result).toBeCloseTo(130, 1);
    // At 125 s, past the target alone, the second finishes and the team passes.
    run = advanceRun(run, 55, [null, at(300.01)]).run;
    expect(run.outcome?.passed).toBe(true);
    expect(run.outcome?.average).toBeCloseTo(97.5, 1);
  });

  it("is lost once the finished times and the clock for each player still driving average over the target", () => {
    let run = green(startRun(route(100), 2), [at(0), at(0)]);
    run = advanceRun(run, 80, [at(300.01), at(150)]).run;
    run = advanceRun(run, 39, [null, at(160)]).run;
    // (80 + 119) / 2 is still inside 100.
    expect(run.outcome).toBeNull();
    run = advanceRun(run, 2, [null, at(170)]).run;
    expect(run.outcome?.passed).toBe(false);
    expect(run.outcome?.results[0]).toBeCloseTo(80, 1);
    expect(run.outcome?.results[1]).toBeNull();
  });

  it("takes the partner's own time from their report, and ignores one for another attempt", () => {
    let run = green(startRun(route(100), 2, 3), [at(0), null]);
    run = reportResult(run, 2, 1, 50).run;
    expect(run.players[1].result).toBeNull();
    run = reportResult(run, 3, 1, 50).run;
    run = advanceRun(run, 140, [at(300.01), null]).run;
    // 140 alone fails; with the partner's 50 the team is at 95.
    expect(run.outcome?.passed).toBe(true);
  });
});

describe("a co-op Speed trap", () => {
  it("ends once both have crossed, and passes on the average of the speeds at the line", () => {
    let run = green(startRun(trap(139), 2), [at(0, 0, 0), at(0, 0, 0)]);
    // Between steps at 140 and 160 km/h, crossing halfway: 150.
    run = advanceRun(run, 1, [at(90, 0, 140 / 3.6), at(50, 0, 0)]).run;
    run = advanceRun(run, 1, [at(110, 0, 160 / 3.6), at(60, 0, 130 / 3.6)]).run;
    expect(run.players[0].result).toBeCloseTo(150, 6);
    expect(run.outcome).toBeNull();
    expect(partnerNeeds(run)?.result).toBeCloseTo(128, 6);
    run = advanceRun(run, 1, [at(120, 0, 0), at(110, 0, 130 / 3.6)]).run;
    expect(run.outcome?.average).toBeCloseTo(140, 6);
    expect(run.outcome?.passed).toBe(true);
  });
});
