import { describe, expect, it } from "vitest";
import {
  admitGuest,
  COOP_CAPACITY,
  openListing,
  parseGuestMessage,
  parseHostMessage,
  releaseGuest,
  startRound,
  WAITING,
  type GuestMessage,
  type HostMessage,
  type HostSeat,
  type ListingSource,
} from "./coop";
import type { CourseSpec } from "./courses";

const COURSE: CourseSpec = { kind: "coop" };

const EMPTY: HostSeat = { phase: WAITING, partnerPeerId: null };
const PAIRED: HostSeat = { phase: WAITING, partnerPeerId: "guest-1" };

describe("the wire", () => {
  const offTheWire = (message: unknown): unknown => JSON.parse(JSON.stringify(message));

  it("carries every host message through unchanged", () => {
    const messages: HostMessage[] = [
      { kind: "start", course: COURSE },
      { kind: "full" },
      { kind: "input", seq: 3, tick: 120, player: 0, input: { kind: "act", action: "rotateCw" } },
      { kind: "input", seq: 4, tick: 125, player: 1, input: { kind: "press", action: "forward" }, id: 2 },
      { kind: "input", seq: 5, tick: 130, player: 1, input: { kind: "releaseAll" } },
      { kind: "confirm", seq: 6, tick: 100, hash: 4_000_000_000 },
      { kind: "pong", seq: 7, at: 90, tick: 131 },
      { kind: "restart", seq: 8 },
    ];
    for (const message of messages) expect(parseHostMessage(offTheWire(message))).toEqual(message);
  });

  it("carries every guest message through unchanged", () => {
    const messages: GuestMessage[] = [
      { kind: "input", seq: 0, round: 1, id: 0, tick: 12, input: { kind: "release", action: "left" } },
      { kind: "restart", seq: 1, round: 1 },
      { kind: "ping", seq: 2, at: 40 },
      { kind: "desync", seq: 3, tick: 50 },
    ];
    for (const message of messages) expect(parseGuestMessage(offTheWire(message))).toEqual(message);
  });

  it("fails loudly on anything that isn't a message of the protocol", () => {
    expect(() => parseHostMessage({ kind: "teleport" })).toThrow(/not a host message/);
    expect(() => parseHostMessage("start")).toThrow();
    expect(() => parseHostMessage({ kind: "start", course: { kind: "moon" } })).toThrow(/not a course/);
    expect(() => parseHostMessage({ kind: "confirm", seq: 1, tick: -50, hash: 1 })).toThrow();
    expect(() => parseHostMessage({ kind: "input", seq: 1, tick: 1, player: 0, input: { kind: "act", action: "fly" } })).toThrow(/not a player input/);
    expect(() => parseGuestMessage({ kind: "input", seq: 0, round: 0, id: 0, tick: 1.5, input: { kind: "releaseAll" } })).toThrow();
    expect(() => parseGuestMessage({ kind: "start", course: COURSE })).toThrow(/not a guest message/);
  });
});

describe("admitGuest", () => {
  it("makes the first guest the partner", () => {
    expect(admitGuest(EMPTY, "guest-1")).toEqual({ seat: PAIRED, admitted: true });
  });

  it("turns away a guest once there is a partner", () => {
    expect(admitGuest(PAIRED, "guest-2")).toEqual({ seat: PAIRED, admitted: false });
  });

  it("turns away a guest once the round has started", () => {
    const startedAlone: HostSeat = { phase: { kind: "started", course: COURSE }, partnerPeerId: null };
    expect(admitGuest(startedAlone, "guest-2").admitted).toBe(false);
  });
});

describe("releaseGuest", () => {
  it("reopens the seat and ends the round when the partner leaves", () => {
    const started = startRound(PAIRED, COURSE);
    expect(releaseGuest(started, "guest-1")).toEqual({ seat: EMPTY, partnerLeft: true });
  });

  it("ignores a turned-away guest leaving", () => {
    expect(releaseGuest(PAIRED, "guest-2")).toEqual({ seat: PAIRED, partnerLeft: false });
  });
});

describe("startRound", () => {
  it("starts on the host's course", () => {
    expect(startRound(PAIRED, COURSE).phase).toEqual({ kind: "started", course: COURSE });
  });

  it("refuses to start alone, or twice", () => {
    expect(() => startRound(EMPTY, COURSE)).toThrow();
    expect(() => startRound(startRound(PAIRED, COURSE), COURSE)).toThrow();
  });
});

describe("openListing", () => {
  const host: ListingSource = { role: "host", status: "connected", code: "ABCD", hostName: "Kyle", seat: EMPTY };

  it("lists a connected host waiting for a partner", () => {
    expect(openListing(host)).toEqual({ code: "ABCD", hostName: "Kyle", players: 1, capacity: COOP_CAPACITY });
  });

  it("lists nothing once the game is full or started", () => {
    expect(openListing({ ...host, seat: PAIRED })).toBeNull();
    expect(openListing({ ...host, seat: { phase: { kind: "started", course: COURSE }, partnerPeerId: null } })).toBeNull();
  });

  it("lists nothing for a guest, or a host not yet connected", () => {
    expect(openListing({ ...host, role: "guest" })).toBeNull();
    expect(openListing({ ...host, status: "connecting" })).toBeNull();
    expect(openListing({ ...host, status: "reconnecting" })).toBeNull();
    expect(openListing({ ...host, role: null, code: null, status: "idle" })).toBeNull();
  });
});
