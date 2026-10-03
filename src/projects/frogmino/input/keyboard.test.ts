import { describe, expect, it } from "vitest";
import { focusLost, JOIN_KEYS, KEYBOARDS, keyDown, keyUp, RESTART_KEY, START_KEY } from "./keyboard";

describe("the solo keyboard", () => {
  it("is one device, with WASD and the arrows both moving and jumping", () => {
    expect(keyDown("solo", "KeyW")).toEqual({ device: "keys", input: { kind: "press", action: "forward" } });
    expect(keyDown("solo", "ArrowUp")).toEqual({ device: "keys", input: { kind: "press", action: "forward" } });
    expect(keyDown("solo", "ArrowLeft")).toEqual({ device: "keys", input: { kind: "press", action: "left" } });
    expect(keyDown("solo", "KeyQ")).toEqual({ device: "keys", input: { kind: "act", action: "rotateCcw" } });
    expect(keyDown("solo", "Space")).toEqual({ device: "keys", input: { kind: "act", action: "hop" } });
  });

  it("keeps solo's keys as they were: the right half's extra keys do nothing", () => {
    expect(keyDown("solo", "Slash")).toBeNull();
    expect(keyDown("solo", "Comma")).toBeNull();
  });

  it("lets go of a held key on release, and of nothing else", () => {
    expect(keyUp("solo", "KeyD")).toEqual({ device: "keys", input: { kind: "release", action: "right" } });
    expect(keyUp("solo", "Space")).toBeNull();
    expect(keyUp("solo", "KeyX")).toBeNull();
  });
});

describe("the split keyboard", () => {
  it("gives the left half WASD, Q, E and Space", () => {
    expect(keyDown("split", "KeyS")).toEqual({ device: "keys:left", input: { kind: "press", action: "back" } });
    expect(keyDown("split", "KeyE")).toEqual({ device: "keys:left", input: { kind: "act", action: "rotateCw" } });
    expect(keyDown("split", "Space")).toEqual({ device: "keys:left", input: { kind: "act", action: "hop" } });
  });

  it("gives the right half the arrows, , . and /", () => {
    expect(keyDown("split", "ArrowRight")).toEqual({ device: "keys:right", input: { kind: "press", action: "right" } });
    expect(keyDown("split", "Comma")).toEqual({ device: "keys:right", input: { kind: "act", action: "rotateCcw" } });
    expect(keyDown("split", "Period")).toEqual({ device: "keys:right", input: { kind: "act", action: "rotateCw" } });
    expect(keyDown("split", "Slash")).toEqual({ device: "keys:right", input: { kind: "act", action: "hop" } });
    expect(keyUp("split", "ArrowUp")).toEqual({ device: "keys:right", input: { kind: "release", action: "forward" } });
  });

  it("gives each half every action, and no key to both halves", () => {
    const halves = [...KEYBOARDS.split.values()];
    const actions = (keys: (typeof halves)[number]) => new Set([...keys.values()].map((control) => control.action));
    expect(actions(halves[0])).toEqual(actions(halves[1]));
    expect(actions(halves[0]).size).toBe(7);
    for (const key of halves[0].keys()) expect(halves[1].has(key)).toBe(false);
  });

  it("keeps restart, mute, joining and starting off the play keys", () => {
    for (const layout of ["solo", "split"] as const) {
      for (const key of [RESTART_KEY, "KeyM", START_KEY]) expect(keyDown(layout, key)).toBeNull();
    }
    expect(keyDown("split", JOIN_KEYS["keys:left"].join)?.device).toBe("keys:left");
    expect(keyDown("split", JOIN_KEYS["keys:right"].join)?.device).toBe("keys:right");
    expect(keyDown("split", JOIN_KEYS["keys:left"].leave)?.device).toBe("keys:left");
    expect(keyDown("split", JOIN_KEYS["keys:right"].leave)?.device).toBe("keys:right");
  });

  it("lets go of both halves' keys when the window loses focus", () => {
    expect(focusLost("split")).toEqual([
      { device: "keys:left", input: { kind: "releaseAll" } },
      { device: "keys:right", input: { kind: "releaseAll" } },
    ]);
    expect(focusLost("solo")).toEqual([{ device: "keys", input: { kind: "releaseAll" } }]);
  });
});
