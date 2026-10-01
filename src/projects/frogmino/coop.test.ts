import { describe, expect, it } from "vitest";
import {
  admitGuest,
  COOP_CAPACITY,
  drawCourseSeed,
  openListing,
  releaseGuest,
  startRound,
  WAITING,
  type HostMessage,
  type HostSeat,
  type ListingSource,
} from "./coop";
import { rowStream } from "./stream";
import { TUNING } from "./tuning";

const EMPTY: HostSeat = { phase: WAITING, partnerPeerId: null };
const PAIRED: HostSeat = { phase: WAITING, partnerPeerId: "guest-1" };

describe("drawCourseSeed", () => {
  it("draws a 32-bit unsigned seed", () => {
    for (let i = 0; i < 100; i++) {
      const seed = drawCourseSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });

  it("grows the same course on both ends of the wire", () => {
    const start: HostMessage = { kind: "start", seed: drawCourseSeed() };
    const received = JSON.parse(JSON.stringify(start)) as HostMessage;
    if (received.kind !== "start") throw new Error("the start message lost its kind");
    const [theirs, ours] = [rowStream(received.seed, TUNING), rowStream(start.seed, TUNING)];
    for (let i = 0; i < 20; i++) expect(theirs.row(i)).toEqual(ours.row(i));
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
    const startedAlone: HostSeat = { phase: { kind: "started", seed: 7 }, partnerPeerId: null };
    expect(admitGuest(startedAlone, "guest-2").admitted).toBe(false);
  });
});

describe("releaseGuest", () => {
  it("reopens the seat and ends the round when the partner leaves", () => {
    const started = startRound(PAIRED, 7);
    expect(releaseGuest(started, "guest-1")).toEqual({ seat: EMPTY, partnerLeft: true });
  });

  it("ignores a turned-away guest leaving", () => {
    expect(releaseGuest(PAIRED, "guest-2")).toEqual({ seat: PAIRED, partnerLeft: false });
  });
});

describe("startRound", () => {
  it("starts on the host's seed", () => {
    expect(startRound(PAIRED, 42).phase).toEqual({ kind: "started", seed: 42 });
  });

  it("refuses to start alone, or twice", () => {
    expect(() => startRound(EMPTY, 42)).toThrow();
    expect(() => startRound(startRound(PAIRED, 42), 43)).toThrow();
  });
});

describe("openListing", () => {
  const host: ListingSource = { role: "host", status: "connected", code: "ABCD", hostName: "Kyle", seat: EMPTY };

  it("lists a connected host waiting for a partner", () => {
    expect(openListing(host)).toEqual({ code: "ABCD", hostName: "Kyle", players: 1, capacity: COOP_CAPACITY });
  });

  it("lists nothing once the game is full or started", () => {
    expect(openListing({ ...host, seat: PAIRED })).toBeNull();
    expect(openListing({ ...host, seat: { phase: { kind: "started", seed: 1 }, partnerPeerId: null } })).toBeNull();
  });

  it("lists nothing for a guest, or a host not yet connected", () => {
    expect(openListing({ ...host, role: "guest" })).toBeNull();
    expect(openListing({ ...host, status: "connecting" })).toBeNull();
    expect(openListing({ ...host, status: "reconnecting" })).toBeNull();
    expect(openListing({ ...host, role: null, code: null, status: "idle" })).toBeNull();
  });
});
