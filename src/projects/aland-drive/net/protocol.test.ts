import { describe, expect, it } from "vitest";
import { parseChallengeMessage, parseGuestMessage, parseHostMessage, type ChallengeMessage } from "./protocol";

/* Every challenge message off the wire is someone else's, so anything not exactly a message is dropped. */

const valid: ChallengeMessage[] = [
  { type: "invite", challenge: "ytterby-sprint", attempt: 1 },
  { type: "accept", challenge: "ytterby-sprint", attempt: 1 },
  { type: "decline", challenge: "ytterby-sprint", attempt: 1 },
  { type: "start", challenge: "ytterby-sprint", attempt: 1, partner: "Ab3_x-9q" },
  { type: "retry", challenge: "ytterby-sprint", attempt: 7 },
  { type: "ready", challenge: "ytterby-sprint", attempt: 7 },
  { type: "result", challenge: "ytterby-sprint", attempt: 7, result: 81.25 },
  { type: "lost", challenge: "ytterby-sprint", attempt: 7, results: [80, null] },
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
    expect(parseChallengeMessage({ ...base, type: "result", result: -1 })).toBeNull();
    expect(parseChallengeMessage({ ...base, type: "result", result: Number.POSITIVE_INFINITY })).toBeNull();
    expect(parseChallengeMessage({ ...base, type: "lost", results: [] })).toBeNull();
    expect(parseChallengeMessage({ ...base, type: "lost", results: [1, 2, 3] })).toBeNull();
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
