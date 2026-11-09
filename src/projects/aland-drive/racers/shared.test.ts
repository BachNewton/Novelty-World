import { describe, expect, it } from "vitest";
import type { Gate, RaceChallenge } from "../challenge/types";
import type { RaceProgress } from "../net/protocol";
import { limitsOn } from "../sim/car-limits";
import type { CarState } from "../sim/car-state";
import { RoadLine } from "../sim/road-net";
import { STEP_S } from "../sim/tuning";
import { Racer } from "./racer";
import { alongForProgress, leftUnfinished, mayRunRacer, parseRacerDriver, placerOf, replacementOf, type RacerDriver } from "./shared";
import { planSpeeds } from "./speed-plan";

/*
 * What sharing racers online rests on: a racer's snapshot carries everything
 * it drives from, so whoever runs it next drives exactly as it would have; the
 * rules for who puts a racer down, who may run one and when a player has left
 * a race; and the racer that takes a leaver's place carrying on from the lines
 * they had crossed.
 */

const EAST = -Math.PI / 2;
const SOUTH = Math.PI;
const WEST = Math.PI / 2;
const NORTH = 0;
const gate = (x: number, z: number, heading: number): Gate => ({ x, z, heading, halfWidthM: 10 });
const start = { x: 0, z: 0, heading: EAST };

/** A square circuit 200 m a side, round twice, its lap's lines at the middle of each side, the last its start line. */
const SIDE = 200;
const CORNERS = [
  [0, 0],
  [SIDE, 0],
  [SIDE, SIDE],
  [0, SIDE],
];
const loop = Float32Array.from(Array.from({ length: 2 * CORNERS.length + 2 }, (_, at) => CORNERS[at % CORNERS.length]).flatMap(([x, z]) => [x, 0, z]));
const CIRCUIT: RaceChallenge = {
  id: "square",
  kind: "race",
  tier: "A5",
  number: "A5.0",
  title: "",
  car: "skerry-gt",
  where: "",
  waypoints: [],
  shape: "circuit",
  ground: "road",
  laps: 2,
  gates: [gate(SIDE, SIDE / 2, SOUTH), gate(SIDE / 2, SIDE, WEST), gate(0, SIDE / 2, NORTH), gate(SIDE / 2, 0, EAST)],
  grid: [start, start],
  starts: [start, start],
  lapM: 4 * SIDE,
  lineM: 0,
  lengthM: 8 * SIDE,
};
const circuitLine = new RoadLine(loop);

const STRAIGHT: RaceChallenge = { ...CIRCUIT, id: "straight", shape: "sprint", laps: 1, gates: [gate(400, 0, EAST), gate(800, 0, EAST)], lapM: 800, lengthM: 800 };
const straightLine = new RoadLine(Float32Array.from([0, 0, 0, 1000, 0, 0]));
const planOn = (line: RoadLine) => planSpeeds({ curvature: new Float64Array(Math.ceil(line.length / 4) + 1), stepM: 4, limitsAt: () => limitsOn("skerry-gt", "dry", "asphalt"), cornerShare: 0.8 });

/** A car standing at a place facing east, moving east at a speed. */
const carAt = (x: number, speedMS = 0, z = 0): CarState => ({
  car: "skerry-gt",
  position: [x, 0.5, z],
  rotation: [0, Math.sin(EAST / 2), 0, Math.cos(EAST / 2)],
  velocity: [speedMS, 0, 0],
  spin: [0, 0, 0],
  steer: 0,
  suspension: [0, 0, 0, 0],
  roll: [0, 0, 0, 0],
  lamps: { head: true, brake: false, reverse: false },
});

const racerOn = (race: RaceChallenge, line: RoadLine, from: number) => new Racer(race, line, planOn(line), from, { reset: () => undefined });

describe("a racer's snapshot", () => {
  it("resumed elsewhere, after going over the wire, drives exactly as the racer it was taken from", () => {
    const racer = racerOn(STRAIGHT, straightLine, 50);
    // Through the countdown, a stretch of driving, and then stuck long enough to be backing out.
    const states = [
      ...Array.from({ length: 3 / STEP_S + 1 }, () => carAt(50)),
      ...Array.from({ length: 2 / STEP_S }, (_, step) => carAt(50 + step * 20 * STEP_S, 20)),
      ...Array.from({ length: 4 / STEP_S }, () => carAt(90)),
    ];
    for (const state of states) racer.step(state);
    expect(racer.record.phase).toBe("reversing");

    const handed = racerOn(STRAIGHT, straightLine, 50);
    handed.resume(JSON.parse(JSON.stringify(racer.snapshot())));
    // Out of the reversing, and on along the road, through the first line.
    const after = [...Array.from({ length: 3 / STEP_S }, () => carAt(89, 1)), ...Array.from({ length: 20 / STEP_S }, (_, step) => carAt(90 + step * 20 * STEP_S, 20))];
    for (const state of after) expect(handed.step(state)).toEqual(racer.step(state));
    expect(handed.snapshot()).toEqual(racer.snapshot());
    expect(racer.run.players[0].nextGate).toBe(1);
  });
});

describe("sharing a race's racers", () => {
  it("has each grid racer put down by the player whose start place is nearest it, the lower seat on a tie", () => {
    const starts = [
      { x: 0, z: 10 },
      { x: 0, z: 20 },
    ];
    expect(placerOf({ x: 0, z: 0 }, starts)).toBe(0);
    expect(placerOf({ x: 0, z: 30 }, starts)).toBe(1);
    expect(placerOf({ x: 0, z: 15 }, starts)).toBe(0);
  });

  const progress = (race: string, attempt: number, finishedS: number | null = null): RaceProgress => ({ race, attempt, nextGate: 3, progress: 3.5, finishedS });
  const driver = { race: "square", attempt: 2 } as RacerDriver;

  it("lets a racer be run only by a player in its race and attempt, and waits to hear from one who hasn't said", () => {
    expect(mayRunRacer(driver, progress("square", 2))).toBe(true);
    expect(mayRunRacer(driver, progress("square", 1))).toBe(false);
    expect(mayRunRacer(driver, progress("other", 2))).toBe(false);
    expect(mayRunRacer(driver, null)).toBe(false);
    expect(mayRunRacer(driver, undefined)).toBeNull();
  });

  it("counts a player as leaving a race unfinished when they go to no race, another or out of the world, not when they retry or have finished", () => {
    const racing = progress("square", 1);
    expect(leftUnfinished(racing, null)).toBe(true);
    expect(leftUnfinished(racing, progress("other", 1))).toBe(true);
    expect(leftUnfinished(racing, progress("square", 2))).toBe(false);
    expect(leftUnfinished(progress("square", 1, 312), null)).toBe(false);
    expect(leftUnfinished(undefined, null)).toBe(false);
  });

  it("finds where on a circuit's line a car stands by the lines it has crossed, so the same spot on another lap is told apart", () => {
    const quarter = SIDE / 4;
    expect(alongForProgress(CIRCUIT, circuitLine, 0, SIDE - quarter, 0)).toBeCloseTo(SIDE - quarter, 0);
    expect(alongForProgress(CIRCUIT, circuitLine, CIRCUIT.gates.length, SIDE - quarter, 0)).toBeCloseTo(5 * SIDE - quarter, 0);
  });

  it("puts a racer in a leaver's place that carries on round from the lines they had crossed, and finishes after the laps they had left", () => {
    // Left on the second lap, three quarters of the way along its first side, past its start line.
    const leaver = { state: carAt((3 * SIDE) / 4), progress: { race: CIRCUIT.id, attempt: 3, nextGate: CIRCUIT.gates.length, progress: 4.2, finishedS: null } };
    const replacement = parseRacerDriver(JSON.parse(JSON.stringify(replacementOf(CIRCUIT, circuitLine, leaver, 140, "dry"))) as Record<string, unknown>);
    expect(replacement.attempt).toBe(3);
    expect(replacement.racer.record.along).toBeCloseTo(4 * SIDE + (3 * SIDE) / 4, 0);

    const racer = racerOn(CIRCUIT, circuitLine, replacement.fromM);
    racer.resume(replacement.racer);
    // Driven round the rest of the last lap by hand, a metre a step, over the finish halfway along the first side.
    for (let along = replacement.racer.record.along; along <= 8 * SIDE + SIDE / 2 + 10; along += 1) {
      const { x, z } = circuitLine.at(along);
      racer.step({ ...carAt(x, 20, z) });
    }
    expect(racer.finishedS).not.toBeNull();
    expect(racer.run.players[0].nextGate).toBe(2 * CIRCUIT.gates.length);
  });

  it("fails loudly on a racer's record that isn't one", () => {
    expect(() => parseRacerDriver({ kind: "racer", race: "square" })).toThrow();
  });
});
