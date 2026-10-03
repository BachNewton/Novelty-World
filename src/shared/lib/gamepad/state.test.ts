import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEADZONE,
  STANDARD_BUTTONS,
  buttonEdges,
  radialDeadzone,
  readPad,
  snapshotChanged,
  snapshotOf,
  type PadSnapshot,
  type StandardButton,
} from "./state";

function pad({
  held = [],
  values = {},
  axes = [0, 0, 0, 0],
  index = 0,
  id = "Xbox Wireless Controller",
  standard = true,
}: {
  held?: StandardButton[];
  values?: Partial<Record<StandardButton, number>>;
  axes?: number[];
  index?: number;
  id?: string;
  standard?: boolean;
} = {}): PadSnapshot {
  return {
    index,
    id,
    standard,
    buttons: STANDARD_BUTTONS.map((name) => {
      const value = values[name] ?? (held.includes(name) ? 1 : 0);
      return { pressed: held.includes(name), value };
    }),
    axes,
  };
}

describe("snapshotOf", () => {
  it("copies the pad and marks the standard mapping", () => {
    const buttons = [{ pressed: true, value: 1 }];
    const snapshot = snapshotOf({ index: 1, id: "pad", mapping: "standard", buttons, axes: [0.5] });
    buttons[0].pressed = false;
    expect(snapshot).toEqual({ index: 1, id: "pad", standard: true, buttons: [{ pressed: true, value: 1 }], axes: [0.5] });
    expect(snapshotOf({ index: 0, id: "pad", mapping: "", buttons: [], axes: [] }).standard).toBe(false);
  });
});

describe("radialDeadzone", () => {
  it("zeroes the stick inside the ring", () => {
    expect(radialDeadzone({ x: 0.1, y: -0.1 }, 0.2)).toEqual({ x: 0, y: 0 });
  });

  it("rescales so output starts at 0 on the ring and reaches 1 at the rim", () => {
    expect(radialDeadzone({ x: 0.2, y: 0 }, 0.2).x).toBeCloseTo(0);
    expect(radialDeadzone({ x: 0.6, y: 0 }, 0.2).x).toBeCloseTo(0.5);
    expect(radialDeadzone({ x: 0, y: -1 }, 0.2).y).toBeCloseTo(-1);
  });

  it("keeps the direction of a diagonal", () => {
    const out = radialDeadzone({ x: 0.5, y: 0.5 }, 0.2);
    expect(out.x).toBeCloseTo(out.y);
    expect(out.x).toBeGreaterThan(0);
  });

  it("caps a corner past the rim at magnitude 1", () => {
    const out = radialDeadzone({ x: 1, y: 1 }, 0.2);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1);
  });

  it("passes the stick through with no deadzone", () => {
    expect(radialDeadzone({ x: 0.3, y: -0.4 }, 0)).toEqual({ x: 0.3, y: -0.4 });
  });
});

describe("readPad", () => {
  it("names a standard pad's buttons, triggers and sticks", () => {
    const reading = readPad(pad({ held: ["A", "RT"], values: { LT: 0.25, RT: 0.9 }, axes: [1, 0, 0.1, 0] }));
    expect(reading.controls?.buttons.A.pressed).toBe(true);
    expect(reading.controls?.buttons.B.pressed).toBe(false);
    expect(reading.controls?.leftTrigger).toBe(0.25);
    expect(reading.controls?.rightTrigger).toBe(0.9);
    expect(reading.controls?.leftStick.x).toBeCloseTo(1);
    expect(reading.controls?.rightStick).toEqual({ x: 0, y: 0 });
  });

  it("uses the default deadzone unless given one", () => {
    const resting = pad({ axes: [DEFAULT_DEADZONE / 2, 0, 0, 0] });
    expect(readPad(resting).controls?.leftStick.x).toBe(0);
    expect(readPad(resting, { deadzone: 0 }).controls?.leftStick.x).toBe(DEFAULT_DEADZONE / 2);
  });

  it("names nothing on a pad whose layout isn't standard", () => {
    const reading = readPad(pad({ standard: false, held: ["A"] }));
    expect(reading.controls).toBeNull();
    expect(reading.buttons[0].pressed).toBe(true);
  });

  it("reads a standard pad that reports fewer buttons as released", () => {
    const short = { ...pad(), buttons: pad().buttons.slice(0, 16), axes: [] };
    expect(readPad(short).controls?.buttons.Home).toEqual({ pressed: false, value: 0 });
    expect(readPad(short).controls?.leftStick).toEqual({ x: 0, y: 0 });
  });
});

describe("buttonEdges", () => {
  it("reports presses and releases between frames", () => {
    const edges = buttonEdges(pad({ held: ["A", "LB"] }), pad({ held: ["LB", "DpadUp"] }));
    expect(edges).toEqual([
      { pad: 0, button: 0, name: "A", pressed: false },
      { pad: 0, button: 12, name: "DpadUp", pressed: true },
    ]);
  });

  it("reports nothing while buttons are held", () => {
    expect(buttonEdges(pad({ held: ["B"] }), pad({ held: ["B"] }))).toEqual([]);
  });

  it("counts held buttons as presses on a pad that just appeared", () => {
    expect(buttonEdges(null, pad({ held: ["Menu"], index: 2 }))).toEqual([{ pad: 2, button: 9, name: "Menu", pressed: true }]);
  });

  it("counts held buttons as releases on a pad that just left", () => {
    expect(buttonEdges(pad({ held: ["X"] }), null)).toEqual([{ pad: 0, button: 2, name: "X", pressed: false }]);
  });

  it("treats a different pad in the same slot as new", () => {
    expect(buttonEdges(pad({ held: ["A"], id: "old" }), pad({ held: ["A"], id: "new" }))).toEqual([
      { pad: 0, button: 0, name: "A", pressed: true },
    ]);
  });

  it("leaves the buttons of a non-standard pad unnamed", () => {
    expect(buttonEdges(null, pad({ held: ["Y"], standard: false }))).toEqual([{ pad: 0, button: 3, name: null, pressed: true }]);
  });
});

describe("snapshotChanged", () => {
  it("sees a moved axis, a pressed button and a trigger squeeze", () => {
    expect(snapshotChanged(pad(), pad({ axes: [0.01, 0, 0, 0] }))).toBe(true);
    expect(snapshotChanged(pad(), pad({ held: ["A"] }))).toBe(true);
    expect(snapshotChanged(pad(), pad({ values: { LT: 0.1 } }))).toBe(true);
  });

  it("sees nothing on an identical frame, and a change on a first frame", () => {
    expect(snapshotChanged(pad(), pad())).toBe(false);
    expect(snapshotChanged(null, pad())).toBe(true);
  });
});
