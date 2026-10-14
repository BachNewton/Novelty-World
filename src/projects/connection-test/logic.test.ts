import { describe, expect, it } from "vitest";
import { addSample, openListing, parsePingMessage, ROOM_CAPACITY, SAMPLE_WINDOW, summarise } from "./logic";

describe("ping messages", () => {
  it("parses pings and pongs, and nothing else", () => {
    expect(parsePingMessage({ kind: "ping", sentAt: 12.5 })).toEqual({ kind: "ping", sentAt: 12.5 });
    expect(parsePingMessage({ kind: "pong", sentAt: 3 })).toEqual({ kind: "pong", sentAt: 3 });
    expect(parsePingMessage({ kind: "ping" })).toBeNull();
    expect(parsePingMessage({ kind: "hello", sentAt: 1 })).toBeNull();
    expect(parsePingMessage("ping")).toBeNull();
  });
});

describe("round trips", () => {
  it("has nothing to say before the first sample", () => {
    expect(summarise([])).toBeNull();
  });

  it("reports the last, best and median of the window", () => {
    expect(summarise([30, 10, 20])).toEqual({ last: 20, best: 10, median: 20, samples: 3 });
    expect(summarise([10, 40, 20, 30])).toEqual({ last: 30, best: 10, median: 25, samples: 4 });
  });

  it("keeps only the most recent samples", () => {
    let window: number[] = [];
    for (let i = 0; i < SAMPLE_WINDOW + 5; i++) window = addSample(window, i);
    expect(window).toHaveLength(SAMPLE_WINDOW);
    expect(window[0]).toBe(5);
  });
});

describe("the open-rooms listing", () => {
  const host = { role: "host" as const, status: "connected", code: "ABCD", hostName: "Kyle", players: 2 };

  it("lists a connected host's room with its player count", () => {
    expect(openListing(host)).toEqual({ code: "ABCD", hostName: "Kyle", players: 2, capacity: ROOM_CAPACITY });
  });

  it("lists nothing for a guest, a host still connecting, or a full room", () => {
    expect(openListing({ ...host, role: "guest" })).toBeNull();
    expect(openListing({ ...host, status: "connecting" })).toBeNull();
    expect(openListing({ ...host, players: ROOM_CAPACITY })).toBeNull();
  });
});
