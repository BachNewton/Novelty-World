import { describe, expect, it } from "vitest";
import { STANDARD_BUTTONS, type PadSnapshot, type StandardButton } from "@/shared/lib/gamepad";
import { PAD_AT_REST, PAD_TUNING, padStep, type PadHold } from "./gamepad";

function pad({ held = [], axes = [0, 0, 0, 0], standard = true }: { held?: StandardButton[]; axes?: number[]; standard?: boolean } = {}): PadSnapshot {
  return {
    index: 0,
    id: "Xbox Wireless Controller",
    standard,
    buttons: STANDARD_BUTTONS.map((name) => ({ pressed: held.includes(name), value: held.includes(name) ? 1 : 0 })),
    axes,
  };
}

// The stick's raw tilt that comes out of the radial deadzone as `scaled`.
function raw(scaled: number): number {
  return Math.sign(scaled) * (Math.abs(scaled) * (1 - PAD_TUNING.deadzone) + PAD_TUNING.deadzone);
}

// Plays frames in order from rest, collecting every input and restart.
function frames(...snapshots: (PadSnapshot | null)[]) {
  let hold: PadHold = PAD_AT_REST;
  const inputs = [];
  let restarts = 0;
  for (const snapshot of snapshots) {
    const step = padStep(hold, snapshot);
    hold = step.hold;
    inputs.push(...step.inputs);
    if (step.restart) restarts++;
  }
  return { hold, inputs, restarts };
}

describe("a controller's buttons", () => {
  it("hop on A and turn on X, B, LB and RB, once per press", () => {
    expect(frames(pad({ held: ["A"] }), pad({ held: ["A"] }), pad(), pad({ held: ["A"] })).inputs).toEqual([
      { kind: "act", action: "hop" },
      { kind: "act", action: "hop" },
    ]);
    expect(frames(pad({ held: ["X"] }), pad({ held: ["X", "B"] }), pad({ held: ["LB", "RB"] })).inputs).toEqual([
      { kind: "act", action: "rotateCcw" },
      { kind: "act", action: "rotateCw" },
      { kind: "act", action: "rotateCcw" },
      { kind: "act", action: "rotateCw" },
    ]);
  });

  it("restart on Menu, once per press", () => {
    const { inputs, restarts } = frames(pad({ held: ["Menu"] }), pad({ held: ["Menu"] }), pad(), pad({ held: ["Menu"] }));
    expect(inputs).toEqual([]);
    expect(restarts).toBe(2);
  });

  it("count a button held as the pad first appears as a press", () => {
    expect(frames(pad({ held: ["A"] })).inputs).toEqual([{ kind: "act", action: "hop" }]);
  });

  it("drive nothing on a pad without the standard layout", () => {
    expect(frames(pad({ standard: false, held: ["A", "DpadUp"], axes: [1, 0, 0, 0] })).inputs).toEqual([]);
  });
});

describe("a controller's D-pad", () => {
  it("holds a slide or a jump while pressed, for the rules to repeat", () => {
    expect(frames(pad({ held: ["DpadLeft"] }), pad({ held: ["DpadLeft"] }), pad()).inputs).toEqual([
      { kind: "press", action: "left" },
      { kind: "release", action: "left" },
    ]);
    expect(frames(pad({ held: ["DpadUp"] }), pad({ held: ["DpadDown"] }), pad()).inputs).toEqual([
      { kind: "press", action: "forward" },
      { kind: "release", action: "forward" },
      { kind: "press", action: "back" },
      { kind: "release", action: "back" },
    ]);
  });

  it("holds a slide and a jump at once, diagonally", () => {
    expect(frames(pad({ held: ["DpadUp", "DpadRight"] })).inputs).toEqual([
      { kind: "press", action: "right" },
      { kind: "press", action: "forward" },
    ]);
  });
});

describe("a controller's left stick", () => {
  it("does nothing inside its deadzone", () => {
    expect(frames(pad({ axes: [PAD_TUNING.deadzone * 0.9, 0, 0, 0] })).inputs).toEqual([]);
  });

  it("holds a way only past the press threshold", () => {
    expect(frames(pad({ axes: [raw(PAD_TUNING.press - 0.02), 0, 0, 0] })).inputs).toEqual([]);
    expect(frames(pad({ axes: [raw(PAD_TUNING.press + 0.02), 0, 0, 0] })).inputs).toEqual([{ kind: "press", action: "right" }]);
    // Up the stick is forward.
    expect(frames(pad({ axes: [0, -1, 0, 0] })).inputs).toEqual([{ kind: "press", action: "forward" }]);
    expect(frames(pad({ axes: [0, 1, 0, 0] })).inputs).toEqual([{ kind: "press", action: "back" }]);
  });

  it("keeps holding until it comes back inside the release threshold, so it never chatters", () => {
    const between = (PAD_TUNING.press + PAD_TUNING.release) / 2;
    const { inputs, hold } = frames(
      pad({ axes: [raw(-1), 0, 0, 0] }),
      pad({ axes: [raw(-between), 0, 0, 0] }),
      pad({ axes: [raw(-PAD_TUNING.release - 0.02), 0, 0, 0] }),
    );
    expect(inputs).toEqual([{ kind: "press", action: "left" }]);
    expect(hold.slide).toBe("left");
    expect(frames(pad({ axes: [raw(-1), 0, 0, 0] }), pad({ axes: [raw(-PAD_TUNING.release + 0.02), 0, 0, 0] })).inputs).toEqual([
      { kind: "press", action: "left" },
      { kind: "release", action: "left" },
    ]);
  });

  it("swaps a held slide for the other way when flicked across", () => {
    expect(frames(pad({ axes: [-1, 0, 0, 0] }), pad({ axes: [1, 0, 0, 0] })).inputs).toEqual([
      { kind: "press", action: "left" },
      { kind: "release", action: "left" },
      { kind: "press", action: "right" },
    ]);
  });

  it("holds a slide and a jump at once on a diagonal", () => {
    const corner = Math.SQRT1_2;
    expect(frames(pad({ axes: [corner, -corner, 0, 0] })).inputs).toEqual([
      { kind: "press", action: "right" },
      { kind: "press", action: "forward" },
    ]);
  });

  it("leaves the right stick alone", () => {
    expect(frames(pad({ axes: [0, 0, 1, -1] })).inputs).toEqual([]);
  });
});

describe("a controller disconnecting", () => {
  it("lets go of everything it held", () => {
    const { inputs, hold } = frames(pad({ held: ["A", "DpadLeft"], axes: [0, -1, 0, 0] }), null);
    expect(inputs).toEqual([
      { kind: "press", action: "left" },
      { kind: "press", action: "forward" },
      { kind: "act", action: "hop" },
      { kind: "release", action: "left" },
      { kind: "release", action: "forward" },
    ]);
    expect(hold).toEqual(PAD_AT_REST);
  });
});
