import { describe, expect, it } from "vitest";
import type { CarId } from "../sim/cars";
import { COUNTDOWN_S } from "./run";
import { ChallengeSession, type SessionHost } from "./session";
import type { Gate, RouteChallenge } from "./types";

/* A straight road east along z = 0, the finish 100 m from the start. East is a heading of -π/2. */

const EAST = -Math.PI / 2;
const finish: Gate = { x: 100, z: 0, heading: EAST, halfWidthM: 10 };
const start = { x: 0, z: 0, heading: EAST };
const ROUTE: RouteChallenge = { id: "route", title: "", car: "sten", where: "", waypoints: [], starts: [start, start], lengthM: 100, kind: "route", gates: [finish], parS: 60, targetS: 60, conditions: { date: { year: 2026, month: 7, day: 1 }, hour: 12, weather: "clear" } };

/** A host whose placing waits until the test lets it land, as a load does. */
function host() {
  const placing: (() => void)[] = [];
  const state: { car: CarId; routes: (string | null)[]; overs: number } = { car: "skerry-gt", routes: [], overs: 0 };
  const made: SessionHost = {
    carId: () => state.car,
    setCar: (id) => {
      state.car = id;
    },
    placeAt: (_, done) => {
      placing.push(done);
    },
    showRoute: (challenge) => {
      state.routes.push(challenge?.id ?? null);
    },
    onOver: () => {
      state.overs++;
    },
  };
  return { made, state, land: () => placing.shift()?.(), waiting: () => placing.length };
}

const at = (x: number) => ({ x, z: 0, speedMS: 20 });

describe("a challenge played on this client", () => {
  it("waits for the car to reach the line before the countdown runs, and holds it there through the countdown", () => {
    const { made, land } = host();
    const session = new ChallengeSession(ROUTE, made);
    session.step(COUNTDOWN_S, at(0));
    expect(session.run.clockS).toBe(-COUNTDOWN_S);
    expect(session.holdsCar()).toBe(true);
    land();
    session.step(COUNTDOWN_S - 0.5, at(0));
    expect(session.holdsCar()).toBe(true);
    session.step(1, at(0));
    expect(session.holdsCar()).toBe(false);
  });

  it("restarts once for a retry asked again while the car is still on its way to the line", () => {
    const { made, land, waiting } = host();
    const session = new ChallengeSession(ROUTE, made);
    land();
    session.step(COUNTDOWN_S + 2, at(0));
    expect(session.retry()).toBe(true);
    expect(session.retry()).toBe(false);
    expect(session.run.attempt).toBe(2);
    expect(waiting()).toBe(1);
    land();
    expect(session.placing).toBe(false);
    expect(session.run.clockS).toBe(-COUNTDOWN_S);
  });

  it("swaps to the challenge's car, and leaving gives back the car from before and takes the route away", () => {
    const { made, state, land } = host();
    const session = new ChallengeSession(ROUTE, made);
    expect(state.car).toBe("sten");
    land();
    expect(state.routes).toEqual(["route"]);
    session.leave();
    expect(state.car).toBe("skerry-gt");
    expect(state.routes).toEqual(["route", null]);
  });

  it("tells the host when an attempt is over, once", () => {
    const { made, state, land } = host();
    const session = new ChallengeSession(ROUTE, made);
    land();
    session.step(COUNTDOWN_S, at(0));
    session.step(5, at(120));
    session.step(1, at(130));
    expect(state.overs).toBe(1);
    expect(session.run.outcome?.passed).toBe(true);
  });
});
