import { describe, expect, it } from "vitest";
import { addSample, parsePingMessage, SAMPLE_WINDOW, summarise } from "./logic";

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
