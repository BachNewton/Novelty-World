import { describe, expect, it } from "vitest";
import type { CarState } from "../sim/car-state";
import { parseChallengeMessage, parseGuestMessage, parseHostMessage, wireState, type ChallengeMessage } from "./protocol";

/* Every challenge message off the wire is someone else's, so anything not exactly a message is dropped. */

const valid: ChallengeMessage[] = [
  { type: "invite", challenge: "ytterby-sprint", attempt: 1 },
  { type: "accept", challenge: "ytterby-sprint", attempt: 1 },
  { type: "start", challenge: "ytterby-sprint", attempt: 1, team: ["Ab3_x-9q", "c", "d", "e"] },
  { type: "retry", challenge: "ytterby-sprint", attempt: 7 },
  { type: "ready", challenge: "ytterby-sprint", attempt: 7 },
  { type: "result", challenge: "ytterby-sprint", attempt: 7, result: 81.25 },
  { type: "result", challenge: "a5-race", attempt: 7, result: 412.5, points: 350 },
  { type: "lost", challenge: "ytterby-sprint", attempt: 7, results: [80, null, null, 91] },
  { type: "leave", challenge: "ytterby-sprint", attempt: 7 },
];

describe("a challenge message", () => {
  it("comes through whole when it is one", () => {
    for (const message of valid) expect(parseChallengeMessage(structuredClone(message))).toEqual(message);
  });

  it("is dropped with no challenge, or an attempt that isn't a count from 1", () => {
    const retry = { type: "retry", challenge: "c", attempt: 2 };
    for (const attempt of [0, -1, 1.5, Number.NaN, "2", null, 1e12]) expect(parseChallengeMessage({ ...retry, attempt })).toBeNull();
    for (const challenge of ["", 7, null, "x".repeat(65)]) expect(parseChallengeMessage({ ...retry, challenge })).toBeNull();
    expect(parseChallengeMessage({ ...retry, type: "restart" })).toBeNull();
  });

  it("is dropped when what its type carries is missing or wrong", () => {
    const base = { challenge: "c", attempt: 2 };
    expect(parseChallengeMessage({ ...base, type: "start" })).toBeNull();
    for (const team of [["a"], ["a", "b", "c", "d", "e"], ["a", "a"], ["a", 7]]) expect(parseChallengeMessage({ ...base, type: "start", team })).toBeNull();
    expect(parseChallengeMessage({ ...base, type: "result", result: 1, points: -50 })).toBeNull();
    expect(parseChallengeMessage({ ...base, type: "result", result: -1 })).toBeNull();
    expect(parseChallengeMessage({ ...base, type: "result", result: Number.POSITIVE_INFINITY })).toBeNull();
    expect(parseChallengeMessage({ ...base, type: "lost", results: [] })).toBeNull();
    expect(parseChallengeMessage({ ...base, type: "lost", results: [1, 2, 3, 4, 5] })).toBeNull();
    expect(parseChallengeMessage({ ...base, type: "lost", results: [1, "2"] })).toBeNull();
  });

  it("carries extra fields no further than the parser", () => {
    expect(parseChallengeMessage({ type: "ready", challenge: "c", attempt: 2, sneaky: true })).toEqual({ type: "ready", challenge: "c", attempt: 2 });
  });
});

describe("a challenge message's envelope", () => {
  const ready: ChallengeMessage = { type: "ready", challenge: "c", attempt: 2 };

  it("from a guest names who it's for, or no one for everyone", () => {
    expect(parseGuestMessage({ kind: "challenge", to: "peer", message: ready })).toEqual({ kind: "challenge", to: "peer", message: ready });
    expect(parseGuestMessage({ kind: "challenge", message: ready })).toEqual({ kind: "challenge", message: ready });
    expect(parseGuestMessage({ kind: "challenge", to: "", message: ready })).toBeNull();
    expect(parseGuestMessage({ kind: "challenge", to: 4, message: ready })).toBeNull();
    expect(parseGuestMessage({ kind: "challenge", message: { ...ready, attempt: 0 } })).toBeNull();
  });

  it("from the host names who sent it", () => {
    expect(parseHostMessage({ kind: "challenge", from: "peer", message: ready })).toEqual({ kind: "challenge", from: "peer", message: ready });
    expect(parseHostMessage({ kind: "challenge", message: ready })).toBeNull();
    expect(parseHostMessage({ kind: "challenge", from: "peer" })).toBeNull();
  });
});

describe("a car's state", () => {
  const state = { position: [1, 2, 3], rotation: [0, 0, 0, 1], velocity: [0, 0, 0], spin: [0, 0, 0], car: "skerry-gt", steer: 0, suspension: [0.1, 0.1, 0.1, 0.1], roll: [0, 0, 0, 0] };

  it("carries its lamps, so other players see a car brake and back up", () => {
    const lamps = { head: true, brake: true, reverse: false };
    expect(parseGuestMessage({ kind: "car", state: { ...state, lamps } })).toEqual({ kind: "car", state: { ...state, lamps } });
  });

  it("shows a car from a version that sent no lamps with them off, rather than dropping it", () => {
    expect(parseGuestMessage({ kind: "car", state })).toEqual({ kind: "car", state: { ...state, lamps: { head: false, brake: false, reverse: false } } });
  });

  const lamps = { head: true, brake: false, reverse: false };

  it("carries its driver's paint through JSON and the wire as a small index", () => {
    const painted: CarState = { ...(state as Omit<CarState, "lamps">), car: "grus", lamps, paint: 3 };
    const wire = JSON.parse(JSON.stringify(wireState(painted))) as unknown;
    expect(parseGuestMessage({ kind: "car", state: wire })).toEqual({ kind: "car", state: { ...painted, paint: 3 } });
  });

  it("drops a paint that isn't a small whole number, keeping the car, which then draws in its default", () => {
    for (const paint of [-1, 1.5, "2", null, 1e9, Number.NaN]) {
      const parsed = parseGuestMessage({ kind: "car", state: { ...state, lamps, paint } });
      expect(parsed).toEqual({ kind: "car", state: { ...state, lamps } });
      expect(parsed?.kind === "car" && "paint" in parsed.state).toBe(false);
    }
  });
});

describe("the world's time", () => {
  it("comes from the host as a number of game days, or is dropped", () => {
    expect(parseHostMessage({ kind: "time", gameDays: 1270.25 })).toEqual({ kind: "time", gameDays: 1270.25 });
    for (const gameDays of [null, "1270", Number.NaN, Infinity]) expect(parseHostMessage({ kind: "time", gameDays })).toBeNull();
    expect(parseGuestMessage({ kind: "ask-time" })).toEqual({ kind: "ask-time" });
  });
});
