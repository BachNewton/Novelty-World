import { describe, expect, it } from "vitest";
import { frameSlicer, inlineSlicer, runSteps } from "./build-slices";

/** A clock each slice moves on by its own cost, so a test sets how long every slice takes. */
function clock() {
  let at = 0;
  return { now: () => at, spend: (ms: number) => () => (at += ms) };
}

describe("frame slicing", () => {
  it("runs slices until the frame's budget is spent, and none started past it", () => {
    const { now, spend } = clock();
    const slicer = frameSlicer(8, now);
    const ran: string[] = [];
    for (const key of ["a", "b", "c", "d", "e"]) {
      const cost = spend(3);
      slicer.add(key, () => {
        ran.push(key);
        cost();
      });
    }
    slicer.frame();
    // 3 + 3 = 6 ms is under the 8 ms budget, so a third starts; then 9 ms is spent.
    expect(ran).toEqual(["a", "b", "c"]);
    slicer.frame();
    expect(ran).toEqual(["a", "b", "c", "d", "e"]);
    expect(slicer.pending()).toBe(0);
  });

  it("always runs one slice a frame, however long it takes", () => {
    const { now, spend } = clock();
    const slicer = frameSlicer(8, now);
    const ran: string[] = [];
    for (const key of ["a", "b"]) {
      const cost = spend(40);
      slicer.add(key, () => {
        ran.push(key);
        cost();
      });
    }
    slicer.frame();
    expect(ran).toEqual(["a"]);
    slicer.frame();
    expect(ran).toEqual(["a", "b"]);
    slicer.frame();
    expect(ran).toEqual(["a", "b"]);
  });

  it("runs the most urgent slice first, asking as it chooses, and the first added among equals", () => {
    const { now, spend } = clock();
    const slicer = frameSlicer(1, now);
    const ran: string[] = [];
    let showing = "upper";
    for (const [key, floor] of [["cellar", "basement"], ["hall", "ground"], ["attic", "upper"], ["study", "ground"]] as const) {
      const cost = spend(5);
      slicer.add(
        key,
        () => {
          ran.push(key);
          cost();
        },
        () => (floor === showing ? 1 : 0),
      );
    }
    slicer.frame();
    expect(ran).toEqual(["attic"]);
    // The player turns to the ground floor: its rooms come next.
    showing = "ground";
    slicer.frame();
    slicer.frame();
    slicer.frame();
    expect(ran).toEqual(["attic", "hall", "study", "cellar"]);
  });

  it("drops a slice cancelled before it runs, and refuses a key already queued", () => {
    const slicer = frameSlicer(100, () => 0);
    const ran: string[] = [];
    slicer.add("a", () => void ran.push("a"));
    slicer.add("b", () => void ran.push("b"));
    expect(() => {
      slicer.add("a", () => void ran.push("again"));
    }).toThrow(/already queued/);
    slicer.cancel("a");
    slicer.frame();
    expect(ran).toEqual(["b"]);
  });

  it("runs a slice added by a slice in the same frame, budget allowing", () => {
    const slicer = frameSlicer(100, () => 0);
    const ran: string[] = [];
    slicer.add("first", () => {
      ran.push("first");
      slicer.add("then", () => void ran.push("then"));
    });
    slicer.frame();
    expect(ran).toEqual(["first", "then"]);
  });

  it("runs a slice of steps a step at a time, finishing it before another starts", () => {
    const { now, spend } = clock();
    const slicer = frameSlicer(8, now);
    const ran: string[] = [];
    const cost = spend(5);
    slicer.add("room", function* () {
      for (const step of ["build", "merge", "chart", "sample"]) {
        ran.push(step);
        cost();
        yield;
      }
    });
    slicer.add("next", () => {
      ran.push("next");
      cost();
    }, () => 1);
    slicer.frame();
    // The more urgent slice goes first; then the room starts, and a step past the budget ends the frame.
    expect(ran).toEqual(["next", "build"]);
    expect(slicer.pending()).toBe(1);
    slicer.frame();
    slicer.frame();
    slicer.frame();
    expect(ran).toEqual(["next", "build", "merge", "chart", "sample"]);
    slicer.frame();
    expect(slicer.pending()).toBe(0);
  });

  it("drops a slice of steps cancelled part way through, and refuses its key while it runs", () => {
    const slicer = frameSlicer(0, () => 0);
    const ran: string[] = [];
    let closed = false;
    slicer.add("room", function* () {
      try {
        for (const step of ["build", "merge", "chart"]) {
          ran.push(step);
          yield;
        }
      } finally {
        closed = true;
      }
    });
    slicer.frame();
    expect(() => {
      slicer.add("room", () => undefined);
    }).toThrow(/already queued/);
    slicer.cancel("room");
    expect(closed).toBe(true);
    expect(slicer.pending()).toBe(0);
    slicer.frame();
    expect(ran).toEqual(["build"]);
  });

  it("runs steps through at once, for what they return", () => {
    function* steps() {
      yield;
      yield;
      return 3;
    }
    expect(runSteps(steps())).toBe(3);
  });

  it("inline, runs each slice as it is added", () => {
    const slicer = inlineSlicer();
    const ran: string[] = [];
    slicer.add("a", () => {
      ran.push("a");
    });
    slicer.add("b", function* () {
      ran.push("b");
      yield;
      ran.push("b, on");
    });
    expect(ran).toEqual(["a", "b", "b, on"]);
    expect(slicer.pending()).toBe(0);
  });
});
